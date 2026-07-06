"""Intent routing + RAG retrieval — Batch 5 P0-B (PRD 4.2.1, 4.2.4)."""

from __future__ import annotations

import re
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

from chains.context_anchor import ContextAnchor, extract_anchor_from_answer, resolve_query
from chains.rag_retrieval import retrieve_context
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


def _format_context_lines(hits: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for hit in hits[:8]:
        ref = hit.get("ref")
        ref_suffix = f" (引用: {ref})" if ref else ""
        lines.append(
            f"- [{hit.get('type', 'doc')}] {hit.get('title', '')}: "
            f"{hit.get('snippet', '')}{ref_suffix}"
        )
    return lines


def _format_retrieval_log(log: list[dict[str, str]]) -> str:
    if not log:
        return "（无）"
    return "\n".join(f"- [{entry['strategy']}] {entry['query']}" for entry in log)


def _build_no_context_fallback(
    resolved_message: str,
    retrieval_log: list[dict[str, str]],
    *,
    llm_configured: bool,
) -> str:
    tried = [entry["query"] for entry in retrieval_log]
    tried_text = "、".join(tried[:5])
    if len(tried) > 5:
        tried_text += f" 等 {len(tried)} 种"

    lines = [
        f"关于「{resolved_message}」：",
        "",
        f"已在代码索引与知识文档中多轮检索（{tried_text}），暂未找到相关内容。",
        "",
        "可能原因：",
        "1. 对应仓库/文档尚未同步或未完成索引",
        "2. 问题中的实体名与索引中的命名不一致",
        "3. 知识库中确实尚无该主题的文档或代码片段",
        "",
        "建议：",
        "- 在管理后台确认目标仓库已同步并完成索引",
        "- 换用更具体的关键词（模块名、文件名、接口名）重试",
    ]
    if not llm_configured:
        lines.append("- 配置 ZHIPU_API_KEY 后可启用 AI 扩写检索与深度回答")
    return "\n".join(lines)


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

    for hint in match_templates(
        resolved_message,
        templates=session_context.get("qaTemplates") if session_context else None,
    ):
        yield "template_hint", hint

    yield "status", {"phase": "retrieving"}
    repo_ids = [anchor.repo_id] if anchor and anchor.repo_id else None
    expand_model = create_chat_model("intent")
    hits, retrieval_log = await retrieve_context(
        client,
        resolved_message,
        repo_ids=repo_ids,
        expand_model=expand_model,
    )

    if retrieval_log:
        yield "status", {
            "phase": "retrieving",
            "attempts": len(retrieval_log),
            "strategies": list(dict.fromkeys(entry["strategy"] for entry in retrieval_log)),
        }

    for hit in hits[:5]:
        yield "source", {
            "type": hit.get("type", "doc"),
            "title": hit.get("title", ""),
            "ref": hit.get("ref"),
        }

    yield "status", {"phase": "generating"}

    context_lines = _format_context_lines(hits)
    history_lines = []
    for msg in recent[-4:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_lines.append(f"{role}: {content}")

    retrieval_section = _format_retrieval_log(retrieval_log)
    has_context = bool(context_lines)

    prompt = (
        "你是灵镜(LingPrism)企业知识助手。请基于检索到的企业知识上下文回答用户问题。\n"
        "要求：\n"
        "1. 优先引用检索上下文中的事实，标注来源类型（code/doc/repo）\n"
        "2. 若上下文不足，明确说明缺失信息，不要编造\n"
        "3. 给出可执行的下一步建议（如需要同步哪个仓库、补充哪类文档）\n\n"
        f"问题类型：{', '.join(intents)}\n"
        f"当前锚点：{anchor.entity_name if anchor else '无'}\n\n"
        f"检索过程（共 {len(retrieval_log)} 轮）：\n{retrieval_section}\n\n"
        "检索上下文：\n"
        f"{chr(10).join(context_lines) if has_context else '（多轮检索后仍无有效命中）'}\n\n"
        "对话历史：\n"
        f"{chr(10).join(history_lines) or '（无）'}\n\n"
        f"用户问题：{resolved_message}"
    )

    model = create_chat_model("qa")
    cfg = resolve_llm_config("qa")
    if isinstance(model, PlaceholderChatModel):
        if has_context:
            fallback = (
                f"关于「{resolved_message}」：\n\n"
                "根据知识库检索结果，整理如下：\n\n"
                + "\n".join(context_lines[:5])
                + "\n\n"
                "（当前为占位模式，配置 ZHIPU_API_KEY 后可获得更完整的 AI 分析。）"
            )
        else:
            fallback = _build_no_context_fallback(
                resolved_message,
                retrieval_log,
                llm_configured=False,
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
    if not answer.strip():
        answer = _build_no_context_fallback(
            resolved_message,
            retrieval_log,
            llm_configured=True,
        )
        for char in answer:
            if is_cancelled and is_cancelled():
                yield "done", {
                    "messageId": str(uuid.uuid4()),
                    "interrupted": True,
                    "anchor": anchor.to_dict() if anchor else None,
                }
                return
            yield "token", {"text": char}

    new_anchor = extract_anchor_from_answer(answer, anchor)
    yield "done", {
        "messageId": str(uuid.uuid4()),
        "interrupted": False,
        "anchor": new_anchor.to_dict() if new_anchor else None,
    }
