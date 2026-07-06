"""Celery application factory."""

from celery import Celery
from celery.signals import worker_init

from infrastructure.config import load_env, probe_redis, redis_host_port, resolve_redis_url

load_env()

broker_url = resolve_redis_url("CELERY_BROKER_URL", 1)
result_backend = resolve_redis_url("CELERY_RESULT_BACKEND", 2)

celery_app = Celery(
    "lingprism_ai_worker",
    broker=broker_url,
    backend=result_backend,
    include=["workers.ping"],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)


@worker_init.connect
def on_worker_init(**kwargs) -> None:  # noqa: ANN003
    ok, detail = probe_redis(broker_url)
    if not ok:
        port = redis_host_port(broker_url)
        raise RuntimeError(
            f"Redis unreachable at {broker_url} ({detail}). "
            f"If using infra/docker, ensure REDIS_HOST_PORT matches "
            f"(see infra/docker/.env.example, often 6380; current port {port}). "
            f"Start Redis: cd infra/docker && docker compose up -d redis"
        )
