"""Streaming cancel helpers — Redis-backed cancel tokens for SSE (Batch 3)."""

from __future__ import annotations

import os
from typing import Any

CANCEL_KEY_PREFIX = "lingprism:stream:cancel:"
DEFAULT_CANCEL_TTL_SECONDS = 300


def cancel_stream_key(stream_id: str) -> str:
    return f"{CANCEL_KEY_PREFIX}{stream_id}"


def cancel_ttl_seconds() -> int:
    raw = os.getenv("LLM_STREAM_CANCEL_TTL_SECONDS", str(DEFAULT_CANCEL_TTL_SECONDS))
    try:
        ttl = int(raw)
    except ValueError as exc:
        raise ValueError(f"invalid LLM_STREAM_CANCEL_TTL_SECONDS: {raw}") from exc
    if ttl <= 0:
        raise ValueError("LLM_STREAM_CANCEL_TTL_SECONDS must be positive")
    return ttl


def request_cancel(redis_client: Any, stream_id: str) -> None:
    """Signal cancellation for an in-flight LLM stream."""
    redis_client.setex(cancel_stream_key(stream_id), cancel_ttl_seconds(), "1")


def is_cancelled(redis_client: Any, stream_id: str) -> bool:
    """Return True when stop was requested for stream_id."""
    return bool(redis_client.exists(cancel_stream_key(stream_id)))
