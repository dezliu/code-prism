"""Environment and Redis URL resolution for ai-worker."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


def load_env() -> None:
    """Load services/ai-worker/.env if present."""
    env_file = Path(__file__).resolve().parents[1] / ".env"
    load_dotenv(env_file, override=False)


def resolve_redis_url(env_name: str, default_db: int) -> str:
    """Resolve Redis URL from explicit env or REDIS_HOST_PORT fallback."""
    explicit = os.getenv(env_name)
    if explicit:
        return explicit

    host_port = os.getenv("REDIS_HOST_PORT", "6379")
    return f"redis://localhost:{host_port}/{default_db}"


def redis_host_port(url: str) -> int:
    parsed = urlparse(url)
    return parsed.port or 6379


def probe_redis(url: str) -> tuple[bool, str]:
    """Return (ok, detail) for a Redis URL connectivity probe."""
    try:
        import redis

        client = redis.from_url(url, socket_connect_timeout=2)
        client.ping()
        return True, "PONG"
    except Exception as exc:  # noqa: BLE001 — startup probe
        return False, str(exc)
