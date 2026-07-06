"""MCP 2025 Streamable HTTP JSON-RPC transport."""

from typing import Any

from server.handlers.initialize import handle_initialize
from server.handlers.tools_call import handle_tools_call
from server.handlers.tools_list import handle_tools_list

METHOD_HANDLERS = {
    "initialize": handle_initialize,
    "tools/list": handle_tools_list,
    "tools/call": handle_tools_call,
}


def dispatch_jsonrpc(body: dict[str, Any]) -> dict[str, Any]:
    request_id = body.get("id")
    method = body.get("method")
    params = body.get("params")

    if body.get("jsonrpc") != "2.0":
        return _error_response(request_id, -32600, "Invalid Request")

    if not method:
        return _error_response(request_id, -32600, "Missing method")

    handler = METHOD_HANDLERS.get(method)
    if handler is None:
        return _error_response(request_id, -32601, f"Method not found: {method}")

    try:
        result = handler(params)
        return {"jsonrpc": "2.0", "id": request_id, "result": result}
    except ValueError as exc:
        return _error_response(request_id, -32602, str(exc))


def _error_response(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }
