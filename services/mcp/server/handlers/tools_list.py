"""MCP tools/list handler."""

from typing import Any

from tools import REGISTERED_TOOLS

PAGE_SIZE = 50


def handle_tools_list(params: dict[str, Any] | None) -> dict[str, Any]:
    cursor = (params or {}).get("cursor")
    tools = [entry["definition"] for entry in REGISTERED_TOOLS.values()]

    start = 0
    if cursor:
        try:
            start = int(cursor)
        except ValueError:
            start = 0

    page = tools[start : start + PAGE_SIZE]
    next_start = start + PAGE_SIZE
    result: dict[str, Any] = {"tools": page}

    if next_start < len(tools):
        result["nextCursor"] = str(next_start)

    return result
