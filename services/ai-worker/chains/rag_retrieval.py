"""Multi-step RAG retrieval — keyword extraction, query expansion, retry search."""

from __future__ import annotations

import os
import re
from typing import Any

DEFAULT_MAX_SEARCH_ATTEMPTS = max(1, int(os.getenv("RAG_MAX_SEARCH_ATTEMPTS", "5")))

from infrastructure.clients.core import CoreSearchClient
from infrastructure.llm.factory import PlaceholderChatModel

_IDENTIFIER_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9_-]{1,48}")
_CHINESE_TOPIC_PATTERN = re.compile(
    r"([\u4e00-\u9fa5]{2,12})(?:的)?(?:具体)?(?:设计|架构|实现|流程|模块|功能)?"
)
_PLACEHOLDER_MARKERS = ("未找到精确匹配", "core 不可达", "离线检索占位")


def is_meaningful_hit(hit: dict[str, Any]) -> bool:
    """Filter core placeholder / offline fallback hits."""
    snippet = str(hit.get("snippet", ""))
    title = str(hit.get("title", ""))
    ref = hit.get("ref")

    if any(marker in snippet for marker in _PLACEHOLDER_MARKERS):
        return False
    if ref == "offline":
        return False
    if title == "代码检索结果" and "未找到" in snippet:
        return False
    return bool(snippet.strip() or title.strip())


def extract_keywords(query: str) -> list[str]:
    """Pull entity identifiers and Chinese topic tokens from a natural question."""
    keywords: list[str] = []
    for match in _IDENTIFIER_PATTERN.finditer(query):
        token = match.group()
        keywords.append(token)
        if "-" in token:
            keywords.append(token.replace("-", "_"))
        if "_" in token:
            keywords.append(token.replace("_", "-"))

    for match in _CHINESE_TOPIC_PATTERN.finditer(query):
        keywords.append(match.group(1))

    return list(dict.fromkeys(kw for kw in keywords if kw))


def build_search_variants(query: str) -> list[str]:
    """Heuristic query variants before LLM expansion."""
    variants = [query.strip()]
    keywords = extract_keywords(query)

    for kw in keywords:
        variants.extend(
            [
                kw,
                f"{kw} 架构",
                f"{kw} 设计",
                f"{kw} architecture",
                f"{kw} design",
                f"{kw} module",
            ]
        )

    if re.search(r"设计|架构", query):
        variants.append(f"{query} architecture design")

    return list(dict.fromkeys(v for v in variants if v))


def merge_hits(hit_groups: list[list[dict[str, Any]]], *, limit: int = 8) -> list[dict[str, Any]]:
    """Dedupe hits by ref+title while preserving best score order."""
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()

    for group in hit_groups:
        for hit in group:
            if not is_meaningful_hit(hit):
                continue
            key = f"{hit.get('ref', '')}:{hit.get('title', '')}:{hit.get('type', '')}"
            if key in seen:
                continue
            seen.add(key)
            merged.append(hit)

    merged.sort(key=lambda h: float(h.get("score") or 0), reverse=True)
    return merged[:limit]


async def expand_query_with_llm(query: str, model: Any) -> list[str]:
    """Ask LLM to rewrite the user question into search-friendly queries."""
    if isinstance(model, PlaceholderChatModel):
        return []

    prompt = (
        "你是企业知识库检索助手。用户提问后在知识库中未找到结果。\n"
        "请将用户问题改写为 2-3 个更适合代码/文档全文与语义检索的搜索 query。\n"
        "要求：每行一个 query，不要编号，可中英文混合，保留核心实体名。\n\n"
        f"用户问题：{query}"
    )

    try:
        if hasattr(model, "ainvoke"):
            result = await model.ainvoke(prompt)
            text = getattr(result, "content", result)
            if not isinstance(text, str):
                text = str(text)
        elif hasattr(model, "invoke"):
            text = model.invoke(prompt)
            if not isinstance(text, str):
                text = str(text)
        else:
            return []

        lines = [line.strip().lstrip("0123456789.-) ").strip() for line in text.splitlines()]
        return [line for line in lines if line and line != query][:3]
    except Exception:
        return []


async def retrieve_context(
    client: CoreSearchClient,
    query: str,
    *,
    repo_ids: list[str] | None = None,
    expand_model: Any | None = None,
    max_attempts: int | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """
    Multi-step retrieval:
    1. Original query
    2. Heuristic keyword variants
    3. LLM-expanded queries (when model available)

    Returns (hits, retrieval_log).
    """
    attempt_limit = max(1, max_attempts if max_attempts is not None else DEFAULT_MAX_SEARCH_ATTEMPTS)
    log: list[dict[str, str]] = []
    collected_groups: list[list[dict[str, Any]]] = []
    attempts = 0

    async def _search(q: str, strategy: str) -> list[dict[str, Any]]:
        nonlocal attempts
        if attempts >= attempt_limit:
            return []
        if any(entry["query"] == q for entry in log):
            return []
        attempts += 1
        log.append({"strategy": strategy, "query": q})
        raw = await client.search(q, repo_ids=repo_ids)
        meaningful = [h for h in raw if is_meaningful_hit(h)]
        if meaningful:
            collected_groups.append(meaningful)
        return meaningful

    await _search(query, "original")
    if collected_groups:
        return merge_hits(collected_groups), log

    for variant in build_search_variants(query)[1:]:
        if attempts >= attempt_limit:
            break
        hits = await _search(variant, "keyword")
        if hits:
            break

    if collected_groups:
        return merge_hits(collected_groups), log

    if expand_model is not None and attempts < attempt_limit:
        expanded = await expand_query_with_llm(query, expand_model)
        for variant in expanded:
            if attempts >= attempt_limit:
                break
            await _search(variant, "llm_expand")
            if collected_groups:
                break

    return merge_hits(collected_groups), log
