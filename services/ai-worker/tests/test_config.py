"""Config and Redis URL resolution tests."""

import os

from infrastructure.config import resolve_redis_url


def test_resolve_redis_url_should_use_explicit_env_when_set() -> None:
    os.environ["CELERY_BROKER_URL"] = "redis://custom:6399/1"
    try:
        assert resolve_redis_url("CELERY_BROKER_URL", 1) == "redis://custom:6399/1"
    finally:
        os.environ.pop("CELERY_BROKER_URL", None)


def test_resolve_redis_url_should_build_from_redis_host_port_when_not_set() -> None:
    os.environ.pop("CELERY_BROKER_URL", None)
    os.environ["REDIS_HOST_PORT"] = "6380"
    try:
        assert resolve_redis_url("CELERY_BROKER_URL", 1) == "redis://localhost:6380/1"
    finally:
        os.environ.pop("REDIS_HOST_PORT", None)
