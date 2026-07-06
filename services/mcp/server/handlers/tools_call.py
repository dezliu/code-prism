"""MCP tools/call handler."""

from typing import Any

from tools import REGISTERED_TOOLS


def handle_tools_call(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("Missing params for tools/call")

    name = params.get("name")
    arguments = params.get("arguments") or {}

    if not name or name not in REGISTERED_TOOLS:
        raise ValueError(f"Unknown tool: {name}")

    return REGISTERED_TOOLS[name]["handler"](arguments)
