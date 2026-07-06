"""API Key authentication middleware for MCP."""

import os
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


def _load_api_keys() -> set[str]:
    raw = os.getenv("MCP_API_KEYS", "dev-key-1,dev-key-2")
    return {key.strip() for key in raw.split(",") if key.strip()}


class ApiKeyAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path != "/mcp":
            return await call_next(request)

        api_key = request.headers.get("X-API-Key") or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not api_key or api_key not in _load_api_keys():
            return JSONResponse(
                status_code=401,
                content={
                    "jsonrpc": "2.0",
                    "error": {"code": -32001, "message": "Unauthorized"},
                    "id": None,
                },
            )

        return await call_next(request)
