"""Streaming cancel token tests."""

from unittest.mock import MagicMock

from infrastructure.llm.streaming import (
    cancel_stream_key,
    is_cancelled,
    request_cancel,
)


def test_cancel_stream_key_should_use_stable_prefix() -> None:
    assert cancel_stream_key("abc-123") == "lingprism:stream:cancel:abc-123"


def test_request_cancel_should_set_redis_key_with_ttl() -> None:
    redis_client = MagicMock()
    request_cancel(redis_client, "stream-1")
    redis_client.setex.assert_called_once_with(
        "lingprism:stream:cancel:stream-1",
        300,
        "1",
    )


def test_is_cancelled_should_return_true_when_key_exists() -> None:
    redis_client = MagicMock()
    redis_client.exists.return_value = 1
    assert is_cancelled(redis_client, "stream-1") is True
    redis_client.exists.assert_called_once_with("lingprism:stream:cancel:stream-1")
