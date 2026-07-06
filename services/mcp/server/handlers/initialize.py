"""MCP initialize handler."""

import os
from typing import Any


PROTOCOL_VERSION = os.getenv("MCP_PROTOCOL_VERSION", "2025-03-26")


def handle_initialize(params: dict[str, Any] | None) -> dict[str, Any]:
    _ = params
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {
            "tools": {
                "listChanged": True,
            }
        },
        "serverInfo": {
            "name": "lingprism-mcp",
            "version": "0.1.0",
        },
    }
