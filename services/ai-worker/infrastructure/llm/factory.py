"""LLM factory — LangChain ChatOpenAI / OpenAIEmbeddings with env-driven providers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from infrastructure.llm.config import resolve_embedding_config, resolve_llm_config

if TYPE_CHECKING:
    from langchain_core.embeddings import Embeddings
    from langchain_core.language_models.chat_models import BaseChatModel


class PlaceholderChatModel:
    """Dev/test stub when API key is absent — no external network call."""

    def __init__(self, config: Any) -> None:
        self.config = config

    def invoke(self, _input: str) -> str:
        return f"[placeholder:{self.config.provider}/{self.config.model}]"

    async def ainvoke(self, _input: str) -> str:
        return self.invoke(_input)


class PlaceholderEmbeddings:
    """Deterministic pseudo-vectors for tests without embedding API."""

    def __init__(self, config: Any, *, dim: int = 4) -> None:
        self.config = config
        self.dim = dim

    def embed_query(self, text: str) -> list[float]:
        seed = float(len(text) % 10)
        return [seed] * self.dim

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_query(text) for text in texts]


def create_chat_model(scene: str = "qa") -> BaseChatModel | PlaceholderChatModel:
    """Create a chat model for the given scene; falls back to placeholder without API key."""
    cfg = resolve_llm_config(scene)
    if not cfg.api_key:
        return PlaceholderChatModel(cfg)

    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=cfg.model,
        api_key=cfg.api_key,
        base_url=cfg.base_url,
        streaming=True,
        temperature=cfg.temperature,
    )


def create_embedding_model() -> Embeddings | PlaceholderEmbeddings:
    """Create an embedding model; falls back to placeholder without API key."""
    from infrastructure.llm.config import resolve_embedding_dim

    cfg = resolve_embedding_config()
    if not cfg.api_key:
        return PlaceholderEmbeddings(cfg, dim=resolve_embedding_dim())

    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(
        model=cfg.model,
        api_key=cfg.api_key,
        base_url=cfg.base_url,
    )
