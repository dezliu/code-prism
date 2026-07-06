import asyncio

from chains.qa_router import stream_qa_with_rag


def _collect(message: str, session_context=None):
    async def run():
        events = []
        async for name, data in stream_qa_with_rag(
            message,
            session_context=session_context or {"anchor": None, "recentMessages": []},
        ):
            events.append((name, data))
        return events

    return asyncio.run(run())


def test_stream_qa_with_rag_emits_source_and_done():
    events = _collect("支付服务核心流程")
    event_names = [e[0] for e in events]
    assert "status" in event_names
    assert "token" in event_names
    assert "done" in event_names


def test_stream_qa_with_rag_resolves_follow_up():
    events = _collect(
        "那它的下游依赖有哪些？",
        session_context={
            "anchor": {
                "entityType": "service",
                "entityId": "pay",
                "entityName": "支付服务",
            },
            "recentMessages": [
                {"role": "user", "content": "支付服务核心流程是什么？"},
            ],
        },
    )
    assert any(name == "done" for name, _ in events)
