"""Template matching and structured apply."""

from __future__ import annotations

import json
import re
from typing import Any

from chains.template_match import (
    TEMPLATE_AUTO_APPLY_THRESHOLD,
    TEMPLATE_HINT_THRESHOLD,
    score_templates,
)
from infrastructure.langfuse_tracer import trace_workflow_node
from workflow.deps import WorkflowDeps
from workflow.state import QaWorkflowState, RouteKind, TemplateMatchResult


def _find_template_by_id(templates: list[dict[str, Any]], template_id: str) -> dict[str, Any] | None:
    for tpl in templates:
        tid = str(tpl.get("templateId") or tpl.get("id") or "")
        if tid == template_id:
            return tpl
    return None


async def template_match_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind | None:
    deps.emit("step", {"node": "template_match", "label": "匹配问答模板"})

    message = state.resolved_message or state.message
    templates = state.qa_templates or None

    with trace_workflow_node("template_match", trace_id=state.trace_id):
        scored = score_templates(message, templates=templates)

    state.template_matches = [
        TemplateMatchResult(
            template_id=item["templateId"],
            name=item["name"],
            preview=item.get("preview", ""),
            score=float(item.get("score", 0)),
            output_schema=item.get("outputSchema") or item.get("output_schema"),
            raw=item.get("_raw") or {},
        )
        for item in scored
    ]

    chosen: TemplateMatchResult | None = None
    if state.apply_template_id:
        raw = _find_template_by_id(state.qa_templates, state.apply_template_id)
        if raw:
            chosen = TemplateMatchResult(
                template_id=str(raw.get("templateId") or raw.get("id", "")),
                name=str(raw.get("name", "")),
                preview=str(raw.get("preview") or raw.get("previewTemplate") or ""),
                score=1.0,
                output_schema=raw.get("outputSchema") or raw.get("output_schema"),
                raw=raw,
            )

    if chosen is None:
        for match in state.template_matches:
            if match.score >= TEMPLATE_AUTO_APPLY_THRESHOLD:
                chosen = match
                break

    if chosen is None:
        for match in state.template_matches:
            if match.score >= TEMPLATE_HINT_THRESHOLD:
                deps.emit(
                    "template_hint",
                    {
                        "templateId": match.template_id,
                        "name": match.name,
                        "preview": match.preview,
                        "score": match.score,
                    },
                )

    if chosen:
        state.active_template = chosen

    state.current_node = "template_match"
    return None


def build_template_prompt(state: QaWorkflowState, context_lines: list[str]) -> str:
    tpl = state.active_template
    if not tpl:
        return ""

    schema = tpl.output_schema or {
        "fields": ["summary", "details", "sources", "next_steps"],
    }
    return (
        f"请严格按模板「{tpl.name}」输出，先用 JSON 填充字段，再格式化为 Markdown。\n"
        f"JSON schema: {json.dumps(schema, ensure_ascii=False)}\n"
        "内容必须来自检索上下文，不得编造。\n"
        f"检索上下文：\n{chr(10).join(context_lines) or '（无）'}\n"
        f"用户问题：{state.resolved_message or state.message}"
    )


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


async def template_apply_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("status", {"phase": "generating"})
    deps.emit("step", {"node": "template_apply", "label": "按模板结构化生成"})

    from workflow.nodes.rag import _format_context_lines

    context_lines = _format_context_lines(state.rag_hits)
    prompt = build_template_prompt(state, context_lines)
    if not prompt:
        return "generate_answer"

    model = deps.qa_model
    collected: list[str] = []
    if hasattr(model, "astream"):
        async for chunk in model.astream(prompt):
            if deps.cancelled():
                state.interrupted = True
                return "stream_output"
            text = _extract_text(chunk)
            if text:
                collected.append(text)
                deps.emit("token", {"text": text})
    else:
        text = str(await model.ainvoke(prompt) if hasattr(model, "ainvoke") else model.invoke(prompt))
        collected.append(text)
        for char in text:
            deps.emit("token", {"text": char})

    state.generated_answer = "".join(collected)
    state.stream_buffer = state.generated_answer
    state.current_node = "template_apply"
    state.workflow_node = "template_apply"
    return "grounding_check"
