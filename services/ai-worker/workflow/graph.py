"""LangGraph-style workflow runner for QA."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

from infrastructure.clients.core import CoreSearchClient
from workflow.deps import WorkflowDeps
from workflow.nodes.context import load_context_node
from workflow.nodes.generate import generate_answer_node
from workflow.nodes.grounding import grounding_check_node
from workflow.nodes.intent import intent_classify_node
from workflow.nodes.rag import (
    hyde_expand_node,
    rag_prepare_node,
    rag_quality_gate_node,
    rag_retrieve_node,
)
from workflow.nodes.response import (
    clarify_node,
    direct_answer_node,
    refuse_node,
    stream_output_node,
)
from workflow.nodes.symbol_resolve import symbol_resolve_node
from workflow.nodes.security import security_guard_node
from workflow.nodes.template import template_apply_node, template_match_node
from workflow.state import QaWorkflowState, RouteKind


async def _execute_workflow(state: QaWorkflowState, deps: WorkflowDeps) -> None:
    route: RouteKind = "security"
    safety = 0

    while route != "end" and safety < 40:
        safety += 1
        if deps.cancelled():
            state.interrupted = True
            await stream_output_node(state, deps)
            return

        if route == "security":
            next_route = await security_guard_node(state, deps)
            route = "refuse" if next_route == "refuse" else "load_context"
            continue

        if route == "load_context":
            await load_context_node(state, deps)
            await template_match_node(state, deps)
            route = await intent_classify_node(state, deps)
            continue

        if route == "clarify":
            await clarify_node(state, deps)
            route = "stream_output"
            continue

        if route == "direct_answer":
            await direct_answer_node(state, deps)
            route = "stream_output"
            continue

        if route == "refuse":
            await refuse_node(state, deps)
            route = "stream_output"
            continue

        if route == "symbol_resolve":
            route = await symbol_resolve_node(state, deps)
            continue

        if route == "rag_prepare":
            await rag_prepare_node(state, deps)
            route = "rag_retrieve"
            continue

        if route == "rag_retrieve":
            await rag_retrieve_node(state, deps)
            route = "rag_quality_gate"
            continue

        if route == "rag_quality_gate":
            route = await rag_quality_gate_node(state, deps)
            continue

        if route == "hyde_expand":
            await hyde_expand_node(state, deps)
            route = "rag_retrieve"
            continue

        if route == "template_apply":
            route = await template_apply_node(state, deps)
            continue

        if route == "generate_answer":
            route = await generate_answer_node(state, deps)
            continue

        if route == "grounding_check":
            route = await grounding_check_node(state, deps)
            continue

        if route == "stream_output":
            await stream_output_node(state, deps)
            route = "end"
            continue

        break


logger = logging.getLogger(__name__)


async def run_qa_workflow(
    message: str,
    *,
    session_context: dict[str, Any] | None = None,
    search_client: CoreSearchClient | None = None,
    is_cancelled: Callable[[], bool] | None = None,
    trace_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any] | None]]:
    """Execute QA workflow and yield SSE-compatible events in real time.

    The workflow runs inside a background ``asyncio.Task``.  Every node calls
    ``deps.emit()`` which pushes events into an ``asyncio.Queue``.  This
    generator drains the queue so that downstream SSE consumers (FastAPI →
    API service → browser) receive events as soon as they are produced —
    enabling true token-level streaming.
    """
    queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()

    def emit(event: str, data: dict[str, Any]) -> None:
        queue.put_nowait((event, data))

    state = QaWorkflowState(
        message=message,
        session_context=session_context or {},
        trace_id=trace_id,
    )
    deps = WorkflowDeps(
        search_client=search_client or CoreSearchClient(),
        emit=emit,
        is_cancelled=is_cancelled,
        trace_id=trace_id,
    )

    async def _run() -> None:
        try:
            await _execute_workflow(state, deps)
            queue.put_nowait(("done", {
                "messageId": state.message_id or str(uuid.uuid4()),
                "interrupted": state.interrupted,
                "anchor": state.anchor.to_dict() if state.anchor else None,
                "ragScore": round(state.rag_score, 3),
                "workflowNode": state.workflow_node or state.current_node,
            }))
        except Exception:
            logger.exception("QA workflow failed: %s", message)
            queue.put_nowait(("error", {
                "code": "WORKFLOW_ERROR",
                "message": "内部处理异常，请稍后重试",
            }))
        finally:
            # Sentinel signals the consumer that no more events are coming.
            queue.put_nowait(None)

    asyncio.create_task(_run())

    while True:
        item = await queue.get()
        if item is None:
            break
        yield item
