"""Langfuse tracing helpers for ai-worker LLM calls."""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from typing import Any, Generator


def _langfuse_enabled() -> bool:
    return bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))


def get_langfuse_client() -> Any | None:
    if not _langfuse_enabled():
        return None
    try:
        from langfuse import Langfuse

        return Langfuse(
            public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
            secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
            host=os.getenv("LANGFUSE_HOST"),
        )
    except Exception:  # noqa: BLE001
        return None


@contextmanager
def trace_llm_call(
    *,
    name: str,
    provider: str,
    model: str,
    scene: str = "qa",
    metadata: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Context manager recording provider/model/latency; no-op when Langfuse unset."""
    client = get_langfuse_client()
    start = time.perf_counter()
    usage: dict[str, Any] = {"prompt_tokens": 0, "completion_tokens": 0}
    trace_meta = {"provider": provider, "model": model, "scene": scene, **(metadata or {})}

    if client is not None:
        trace = client.trace(name=name, metadata=trace_meta)
        span = trace.span(name=f"{provider}/{model}")
    else:
        trace = None
        span = None

    try:
        yield usage
    finally:
        latency_ms = int((time.perf_counter() - start) * 1000)
        if span is not None:
            span.end(
                metadata={
                    **trace_meta,
                    "latency_ms": latency_ms,
                    "token_usage": usage,
                }
            )
        if trace is not None:
            trace.update(metadata={"latency_ms": latency_ms})
