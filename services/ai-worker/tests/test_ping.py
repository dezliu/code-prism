"""AI worker tests."""

import os

from infrastructure.llm.config import resolve_llm_config
from infrastructure.llm.factory import create_chat_model, create_embedding_model
from workers.ping import ping


def test_ping_task_should_return_ok_status() -> None:
    result = ping()
    assert result == {"status": "ok", "service": "ai-worker"}


def test_resolve_llm_config_should_default_to_zhipu() -> None:
    os.environ.pop("LLM_PROVIDER", None)
    cfg = resolve_llm_config("qa")
    assert cfg.provider == "zhipu"
    assert cfg.model == "glm-4-plus"


def test_create_chat_model_should_return_placeholder_without_api_key() -> None:
    model = create_chat_model("qa")
    response = model.invoke("hello")
    assert "placeholder" in response
    assert "zhipu" in response


def test_create_embedding_model_should_return_deterministic_vector() -> None:
    embedder = create_embedding_model()
    vector = embedder.embed_query("test")
    assert len(vector) == 4
    assert vector[0] == 4.0
