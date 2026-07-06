"""Tests for simplified QA streaming chain."""

from __future__ import annotations

import asyncio

from chains.simple_qa import stream_qa_tokens


def test_stream_qa_tokens_without_api_key_yields_error() -> None:
    async def collect() -> list[tuple[str, dict | None]]:
        events: list[tuple[str, dict | None]] = []
        async for event in stream_qa_tokens("你好"):
            events.append(event)
        return events

    events = asyncio.run(collect())
    event_names = [name for name, _ in events]
    assert "status" in event_names
    assert "error" in event_names
    assert "token" not in event_names
    assert events[-1][0] == "done"
    error_data = next(data for name, data in events if name == "error")
    assert error_data is not None
    assert error_data["code"] == "LLM_NOT_CONFIGURED"
