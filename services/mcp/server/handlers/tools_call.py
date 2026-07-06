"""MCP tools/call handler."""

import asyncio
import inspect
from typing import Any

from server.middleware.audit import audit_timer, log_tool_call
from tools import REGISTERED_TOOLS


async def handle_tools_call(params: dict[str, Any] | None, trace_id: str | None = None) -> dict[str, Any]:
    if not params:
        raise ValueError("Missing params for tools/call")

    name = params.get("name")
    arguments = params.get("arguments") or {}

    if not name or name not in REGISTERED_TOOLS:
        raise ValueError(f"Unknown tool: {name}")

    timer = audit_timer()
    try:
        handler = REGISTERED_TOOLS[name]["handler"]
        if inspect.iscoroutinefunction(handler):
            result = await handler(arguments)
        else:
            result = handler(arguments)
        log_tool_call(
            tool_name=name,
            arguments=arguments,
            status="ok",
            latency_ms=timer.elapsed_ms,
            trace_id=trace_id,
        )
        return result
    except Exception as exc:  # noqa: BLE001
        log_tool_call(
            tool_name=name,
            arguments=arguments,
            status="error",
            latency_ms=timer.elapsed_ms,
            trace_id=trace_id,
            error_message=str(exc),
        )
        raise


def handle_tools_call_sync(params: dict[str, Any] | None) -> dict[str, Any]:
    return asyncio.get_event_loop().run_until_complete(handle_tools_call(params))
