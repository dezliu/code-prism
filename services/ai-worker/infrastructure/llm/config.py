"""LLM configuration resolver — env-driven, scene-aware."""

from __future__ import annotations

import os
from dataclasses import dataclass

from infrastructure.llm.providers.registry import (
    DEFAULT_PROVIDER,
    get_provider_defaults,
    scene_env_key,
    validate_provider,
)


@dataclass(frozen=True)
class LlmConfig:
    provider: str
    model: str
    base_url: str
    api_key: str
    temperature: float = 0.7
    scene: str | None = None


def _provider_env_prefix(provider: str) -> str:
    return validate_provider(provider).upper()


def _read_provider_api_key(provider: str) -> str:
    prefix = _provider_env_prefix(provider)
    return os.getenv(f"{prefix}_API_KEY", "")


def _read_provider_base_url(provider: str) -> str:
    prefix = _provider_env_prefix(provider)
    explicit = os.getenv(f"{prefix}_BASE_URL")
    if explicit:
        return explicit
    return get_provider_defaults(provider).base_url


def _resolve_scene_model(provider: str, scene: str) -> str:
    defaults = get_provider_defaults(provider)
    env_key = scene_env_key(scene)
    if env_key:
        override = os.getenv(env_key)
        if override:
            return override

    prefix = _provider_env_prefix(provider)
    provider_model = os.getenv(f"{prefix}_MODEL", defaults.chat_model)

    if scene == "intent" and defaults.intent_model:
        return defaults.intent_model

    return provider_model


def resolve_llm_config(scene: str = "qa") -> LlmConfig:
    """Resolve chat LLM config: env > provider defaults; scene selects model."""
    provider = validate_provider(os.getenv("LLM_PROVIDER", DEFAULT_PROVIDER))
    temperature_raw = os.getenv("LLM_TEMPERATURE", "0.7")
    try:
        temperature = float(temperature_raw)
    except ValueError as exc:
        raise ValueError(f"invalid LLM_TEMPERATURE: {temperature_raw}") from exc

    return LlmConfig(
        provider=provider,
        model=_resolve_scene_model(provider, scene),
        base_url=_read_provider_base_url(provider),
        api_key=_read_provider_api_key(provider),
        temperature=temperature,
        scene=scene,
    )


def resolve_embedding_config() -> LlmConfig:
    """Resolve embedding model config from EMBEDDING_PROVIDER env."""
    provider = validate_provider(os.getenv("EMBEDDING_PROVIDER", DEFAULT_PROVIDER))
    defaults = get_provider_defaults(provider)
    prefix = _provider_env_prefix(provider)

    return LlmConfig(
        provider=provider,
        model=os.getenv(f"{prefix}_EMBEDDING_MODEL", defaults.embedding_model),
        base_url=_read_provider_base_url(provider),
        api_key=_read_provider_api_key(provider),
        scene="embedding",
    )


def resolve_embedding_dim() -> int:
    """Embedding vector dimension — env override with provider-safe default."""
    raw = os.getenv("ZHIPU_EMBEDDING_DIM", "1024")
    try:
        dim = int(raw)
    except ValueError as exc:
        raise ValueError(f"invalid ZHIPU_EMBEDDING_DIM: {raw}") from exc
    if dim <= 0:
        raise ValueError(f"embedding dimension must be positive, got {dim}")
    return dim
