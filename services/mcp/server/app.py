"""FastAPI entrypoint for MCP Streamable HTTP."""

import os

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from server.middleware.auth import ApiKeyAuthMiddleware
from server.transport import dispatch_jsonrpc

app = FastAPI(title="LingPrism MCP", version="0.1.0")
app.add_middleware(ApiKeyAuthMiddleware)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "mcp"}


@app.post("/mcp")
async def mcp_endpoint(request: Request) -> JSONResponse:
    protocol_version = os.getenv("MCP_PROTOCOL_VERSION", "2025-03-26")
    if request.headers.get("MCP-Protocol-Version") != protocol_version:
        return JSONResponse(
            status_code=400,
            content={
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": f"MCP-Protocol-Version must be {protocol_version}",
                },
                "id": None,
            },
        )

    body = await request.json()
    trace_id = request.headers.get("X-Trace-Id")
    response = await dispatch_jsonrpc(body, trace_id=trace_id)
    return JSONResponse(content=response)


def main() -> None:
    port = int(os.getenv("MCP_PORT", "8090"))
    uvicorn.run("server.app:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
