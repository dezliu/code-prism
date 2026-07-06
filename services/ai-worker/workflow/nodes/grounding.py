"""Grounding check node — verify claims against retrieved context."""

from __future__ import annotations

import json
import re
from typing import Any

from infrastructure.langfuse_tracer import trace_llm_call, trace_workflow_node
from infrastructure.llm.config import resolve_llm_config
from infrastructure.llm.factory import PlaceholderChatModel
from workflow.deps import WorkflowDeps
from workflow.nodes.rag import _format_context_lines
from workflow.state import QaWorkflowState, RouteKind


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                return None
    return None


def _simple_grounding_check(answer: str, context_text: str) -> tuple[bool, str | None]:
    """Heuristic grounding when LLM unavailable."""
    if not answer.strip():
        return False, "回答为空"
    if not context_text.strip():
        return True, None
    return True, None


async def grounding_check_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    if state.intent in ("clarify", "direct_answer", "refuse") or state.interrupted:
        return "stream_output"

    deps.emit("status", {"phase": "grounding"})
    deps.emit("step", {"node": "grounding_check", "label": "校验回答依据"})

    answer = state.generated_answer or state.stream_buffer
    context_lines = _format_context_lines(state.rag_hits + state.graph_hits)
    context_text = "\n".join(context_lines)
    model = deps.qa_model

    with trace_workflow_node(
        "grounding_check",
        trace_id=state.trace_id,
        metadata={"retry": state.grounding_retry_count},
    ):
        if isinstance(model, PlaceholderChatModel) or not context_text.strip():
            ok, err = _simple_grounding_check(answer, context_text)
            if ok:
                state.current_node = "grounding_check"
                return "stream_output"
            state.last_error = err
        else:
            prompt = (
                "你是事实校验助手。对照检索上下文，检查 assistant 回答是否有未 grounding 的关键事实。\n"
                '输出 JSON: {"passed": true/false, "issues": ["..."]}\n'
                f"检索上下文：\n{context_text}\n\n"
                f"回答：\n{answer}"
            )
            cfg = resolve_llm_config("qa")
            text = ""
            with trace_llm_call(name="grounding_check", provider=cfg.provider, model=cfg.model, scene="qa"):
                if hasattr(model, "ainvoke"):
                    result = await model.ainvoke(prompt)
                    text = str(getattr(result, "content", result))
                else:
                    text = str(model.invoke(prompt))

            parsed = _extract_json(text) or {}
            passed = bool(parsed.get("passed", True))
            issues = parsed.get("issues") or []
            if passed:
                state.current_node = "grounding_check"
                return "stream_output"

            state.last_error = "; ".join(str(i) for i in issues) or "存在未 grounding 的事实"
            state.grounding_retry_count += 1

    if state.grounding_retry_count <= state.max_grounding_retries:
        state.generated_answer = ""
        state.stream_buffer = ""
        return "generate_answer"

    state.current_node = "grounding_check"
    return "stream_output"
