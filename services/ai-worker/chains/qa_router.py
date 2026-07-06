"""Intent routing + RAG retrieval — Batch 5 P0-B (PRD 4.2.1, 4.2.4)."""

from __future__ import annotations

import re
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

from chains.context_anchor import ContextAnchor, extract_anchor_from_answer, resolve_query
from chains.template_match import match_templates
from infrastructure.clients.core import CoreSearchClient
from infrastructure.llm.factory import PlaceholderChatModel, create_chat_model
from infrastructure.langfuse_tracer import trace_llm_call
from infrastructure.llm.config import resolve_llm_config


def classify_intent(message: str) -> list[str]:
    intents: list[str] = []
    if re.search(r"架构|依赖|调用|模块|服务关系", message):
        intents.append("architecture")
    if re.search(r"函数|类|代码|接口|字段|表", message):
        intents.append("code")
    if re.search(r"文档|手册|ADR|培训", message):
        intents.append("doc")
    if re.search(r"负责人|谁负责|团队", message):
        intents.append("people")
    if not intents:
        intents.append("general")
    return intents


def _extract_text(chunk: Any) -> str:
    content = getattr(chunk, "content", chunk)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
        return "".join(parts)
    return str(content) if content is not None else ""


async def stream_qa_with_rag(
    message: str,
    *,
    session_context: dict[str, Any] | None = None,
    search_client: CoreSearchClient | None = None,
    is_cancelled: Callable[[], bool] | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any] | None]]:
    client = search_client or CoreSearchClient()
    anchor_data = session_context.get("anchor") if session_context else None
    anchor = ContextAnchor.from_dict(anchor_data)
    recent = session_context.get("recentMessages", []) if session_context else []

    resolved_message, anchor = resolve_query(message, anchor)
    intents = classify_intent(resolved_message)

    yield "status", {"phase": "understanding", "intents": intents}

    for hint in match_templates(resolved_message, templates=session_context.get("qaTemplates") if session_context else None):
        yield "template_hint", hint

    yield "status", {"phase": "retrieving"}
    repo_ids = [anchor.repo_id] if anchor and anchor.repo_id else None
    hits = await client.search(resolved_message, repo_ids=repo_ids)

    for hit in hits[:3]:
        yield "source", {
            "type": hit.get("type", "doc"),
            "title": hit.get("title", ""),
            "ref": hit.get("ref"),
        }

    yield "status", {"phase": "generating"}

    context_lines = []
    for hit in hits[:5]:
        context_lines.append(f"- [{hit.get('type')}] {hit.get('title')}: {hit.get('snippet')}")
    history_lines = []
    for msg in recent[-4:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_lines.append(f"{role}: {content}")

    prompt = (
        "你是灵镜(LingPrism)企业知识助手。根据检索上下文与对话历史回答用户问题。\n"
        "若信息不足，明确说明并给出建议。\n\n"
        f"问题类型：{', '.join(intents)}\n"
        f"当前锚点：{anchor.entity_name if anchor else '无'}\n\n"
        "检索上下文：\n"
        f"{chr(10).join(context_lines) or '（无检索结果）'}\n\n"
        "对话历史：\n"
        f"{chr(10).join(history_lines) or '（无）'}\n\n"
        f"用户问题：{resolved_message}"
    )

    model = create_chat_model("qa")
    cfg = resolve_llm_config("qa")
    if isinstance(model, PlaceholderChatModel):
        fallback = (
            f"基于检索结果回答：{resolved_message}\n\n"
            + "\n".join(context_lines[:3])
            if context_lines
            else "未配置 LLM API Key，且暂无检索上下文。"
        )
        for char in fallback:
            if is_cancelled and is_cancelled():
                yield "done", {"messageId": str(uuid.uuid4()), "interrupted": True}
                return
            yield "token", {"text": char}
        new_anchor = extract_anchor_from_answer(fallback, anchor)
        yield "done", {
            "messageId": str(uuid.uuid4()),
            "interrupted": False,
            "anchor": new_anchor.to_dict() if new_anchor else None,
        }
        return

    collected: list[str] = []
    with trace_llm_call(name="qa_router", provider=cfg.provider, model=cfg.model, scene="qa"):
        if hasattr(model, "astream"):
            async for chunk in model.astream(prompt):
                if is_cancelled and is_cancelled():
                    yield "done", {
                        "messageId": str(uuid.uuid4()),
                        "interrupted": True,
                        "anchor": anchor.to_dict() if anchor else None,
                    }
                    return
                text = _extract_text(chunk)
                if text:
                    collected.append(text)
                    yield "token", {"text": text}

    answer = "".join(collected)
    new_anchor = extract_anchor_from_answer(answer, anchor)
    yield "done", {
        "messageId": str(uuid.uuid4()),
        "interrupted": False,
        "anchor": new_anchor.to_dict() if new_anchor else None,
    }
