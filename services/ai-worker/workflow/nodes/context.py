"""Load context and resolve anchor."""

from __future__ import annotations

from chains.context_anchor import ContextAnchor, resolve_query
from workflow.deps import WorkflowDeps
from workflow.state import QaWorkflowState, RouteKind


async def load_context_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("step", {"node": "load_context", "label": "加载会话上下文"})

    ctx = state.session_context or {}
    anchor_data = ctx.get("anchor")
    state.anchor = ContextAnchor.from_dict(anchor_data)
    state.recent_messages = list(ctx.get("recentMessages") or [])
    state.qa_templates = list(ctx.get("qaTemplates") or [])

    allowed = ctx.get("allowedRepoIds") or ctx.get("allowed_repo_ids") or []
    state.allowed_repo_ids = [str(r) for r in allowed if r]

    apply_id = ctx.get("applyTemplateId") or ctx.get("apply_template_id")
    if apply_id:
        state.apply_template_id = str(apply_id)

    state.trace_id = state.trace_id or ctx.get("traceId") or deps.trace_id

    resolved, updated_anchor = resolve_query(state.message, state.anchor)
    state.resolved_message = resolved
    state.anchor = updated_anchor
    state.current_node = "load_context"
    return "continue"
