"""Terminal output nodes: clarify, direct answer, refuse, stream output."""

from __future__ import annotations

import uuid

from chains.context_anchor import extract_anchor_from_answer
from workflow.deps import WorkflowDeps
from workflow.nodes.generate import _build_no_context_fallback
from workflow.state import QaWorkflowState, RouteKind


async def clarify_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("step", {"node": "clarify", "label": "请求补充信息"})
    text = state.clarify_question or "请补充更具体的信息以便检索。"
    state.generated_answer = text
    state.stream_buffer = text
    for char in text:
        if deps.cancelled():
            state.interrupted = True
            break
        deps.emit("token", {"text": char})
    state.current_node = "clarify"
    state.workflow_node = "clarify"
    return "stream_output"


async def direct_answer_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("step", {"node": "direct_answer", "label": "直接回答"})
    history = state.recent_messages[-4:]
    if history:
        text = "基于对话历史：" + history[-1].get("content", "")
    else:
        text = "你好，我是灵镜企业知识助手。请描述你想了解的仓库、服务或模块。"
    state.generated_answer = text
    state.stream_buffer = text
    for char in text:
        if deps.cancelled():
            state.interrupted = True
            break
        deps.emit("token", {"text": char})
    state.current_node = "direct_answer"
    state.workflow_node = "direct_answer"
    return "stream_output"


async def refuse_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("step", {"node": "refuse", "label": "无法回答"})
    if state.refuse_reason and state.rag_score < state.min_rag_score:
        text = _build_no_context_fallback(state, llm_configured=deps.llm_configured())
        text = f"{state.refuse_reason}\n\n{text}"
    else:
        text = state.refuse_reason or "该问题无法在当前权限与知识库范围内回答。"
    state.generated_answer = text
    state.stream_buffer = text
    for char in text:
        if deps.cancelled():
            state.interrupted = True
            break
        deps.emit("token", {"text": char})
    state.current_node = "refuse"
    state.workflow_node = "refuse"
    return "stream_output"


async def stream_output_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("status", {"phase": "formatting"})
    deps.emit("step", {"node": "stream_output", "label": "完成"})

    new_anchor = extract_anchor_from_answer(state.generated_answer or state.stream_buffer, state.anchor)
    state.anchor = new_anchor
    state.message_id = str(uuid.uuid4())
    state.status = "interrupted" if state.interrupted else "completed"
    state.current_node = "stream_output"
    return "end"
