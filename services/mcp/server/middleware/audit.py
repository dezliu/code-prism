"""MCP audit logging — writes to stdout JSON for ingestion; optional MySQL via env."""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any


def log_tool_call(
    *,
    tool_name: str,
    arguments: dict[str, Any],
    status: str,
    latency_ms: int,
    trace_id: str | None = None,
    error_message: str | None = None,
) -> None:
    record = {
        "id": str(uuid.uuid4()),
        "tool_name": tool_name,
        "trace_id": trace_id,
        "arguments": arguments,
        "latency_ms": latency_ms,
        "status": status,
        "error_message": error_message,
    }
    print(json.dumps({"level": "info", "msg": "mcp_tool_call", **record}, ensure_ascii=False))

    if os.getenv("MCP_AUDIT_LOG_FILE"):
        with open(os.getenv("MCP_AUDIT_LOG_FILE", ""), "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")


class audit_timer:
    def __init__(self) -> None:
        self.start = time.perf_counter()

    @property
    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self.start) * 1000)
