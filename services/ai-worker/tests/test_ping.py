"""AI worker ping task tests."""

from workers.ping import ping


def test_ping_task_should_return_ok_status() -> None:
    result = ping()
    assert result == {"status": "ok", "service": "ai-worker"}
