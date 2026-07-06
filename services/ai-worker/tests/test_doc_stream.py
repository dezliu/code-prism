"""Tests for doc generation SSE stream."""

from __future__ import annotations

from fastapi.testclient import TestClient

from internal_http.server import app


class _FakeRedis:
    def exists(self, _key: bytes | str) -> int:
        return 0


def test_doc_stream_returns_sse_events(monkeypatch) -> None:
    monkeypatch.setattr("internal_http.server._redis_client", lambda: _FakeRedis())
    monkeypatch.setattr(
        "chains.doc_gen.create_chat_model",
        lambda _scene: __import__(
            "infrastructure.llm.factory", fromlist=["PlaceholderChatModel"]
        ).PlaceholderChatModel(type("Cfg", (), {"provider": "test", "model": "test"})()),
    )

    client = TestClient(app)
    response = client.post(
        "/internal/doc/generate/stream",
        json={
            "streamId": "doc-stream-001",
            "title": "测试文档",
            "docType": "training",
            "repoNames": ["demo"],
            "context": "README",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: status" in body
    assert "event: token" in body
    assert "event: done" in body
