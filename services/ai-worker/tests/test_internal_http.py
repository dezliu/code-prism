"""Tests for internal HTTP chat SSE endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from internal_http.server import app


class _FakeRedis:
    def exists(self, _key: bytes | str) -> int:
        return 0


def test_health_returns_ok() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_chat_stream_returns_sse_events(monkeypatch) -> None:
    monkeypatch.setattr("internal_http.server._redis_client", lambda: _FakeRedis())

    client = TestClient(app)
    response = client.post(
        "/internal/chat/stream",
        json={
            "message": "你好",
            "streamId": "test-stream-001",
            "userId": "user-1",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: status" in body
    assert "event: token" in body
    assert "event: done" in body
