"""Tests for simplified QA streaming chain."""

from __future__ import annotations

import asyncio

from chains.simple_qa import stream_qa_tokens


def test_stream_qa_tokens_placeholder_yields_status_token_done() -> None:
    async def collect() -> list[tuple[str, dict | None]]:
        events: list[tuple[str, dict | None]] = []
        async for event in stream_qa_tokens("你好"):
            events.append(event)
        return events

    events = asyncio.run(collect())
    event_names = [name for name, _ in events]
    assert "status" in event_names
    assert "token" in event_names
    assert events[-1][0] == "done"
    assert events[-1][1] is not None
    assert events[-1][1]["interrupted"] is False
