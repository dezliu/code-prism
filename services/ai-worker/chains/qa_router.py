"""Intent routing + RAG retrieval — delegates to LangGraph-style workflow."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Any

from infrastructure.clients.core import CoreSearchClient
from workflow.graph import run_qa_workflow


async def stream_qa_with_rag(
    message: str,
    *,
    session_context: dict[str, Any] | None = None,
    search_client: CoreSearchClient | None = None,
    is_cancelled: Callable[[], bool] | None = None,
    trace_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any] | None]]:
    async for event in run_qa_workflow(
        message,
        session_context=session_context,
        search_client=search_client,
        is_cancelled=is_cancelled,
        trace_id=trace_id,
    ):
        yield event
