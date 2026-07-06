"""LLM factory placeholder — Batch 2 接入 LangChain ChatOpenAI / OpenAIEmbeddings."""

from typing import Any

from infrastructure.llm.config import resolve_embedding_config, resolve_llm_config


class PlaceholderChatModel:
    """Stub chat model for Batch 1 — returns fixed response without API call."""

    def __init__(self, config: Any) -> None:
        self.config = config

    def invoke(self, _input: str) -> str:
        return f"[placeholder:{self.config.provider}/{self.config.model}]"


class PlaceholderEmbeddings:
    def __init__(self, config: Any) -> None:
        self.config = config

    def embed_query(self, text: str) -> list[float]:
        # deterministic pseudo-vector for tests
        return [float(len(text) % 10)] * 4


def create_chat_model(scene: str = "qa") -> PlaceholderChatModel:
    cfg = resolve_llm_config(scene)
    return PlaceholderChatModel(cfg)


def create_embedding_model() -> PlaceholderEmbeddings:
    cfg = resolve_embedding_config()
    return PlaceholderEmbeddings(cfg)
