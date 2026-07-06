"""LLM configuration resolver placeholder — Batch 2 llm-provider-abstraction 实现."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class LlmConfig:
    provider: str
    model: str
    base_url: str
    api_key: str
    temperature: float = 0.7


DEFAULT_PROVIDER = "zhipu"


def resolve_llm_config(scene: str = "qa") -> LlmConfig:
    """Resolve LLM config from env. Batch 2 will add DB hot-reload."""
    provider = os.getenv("LLM_PROVIDER", DEFAULT_PROVIDER)
    _ = scene

    provider_env = provider.upper()
    return LlmConfig(
        provider=provider,
        model=os.getenv(f"{provider_env}_MODEL", os.getenv("ZHIPU_MODEL", "glm-4-plus")),
        base_url=os.getenv(
            f"{provider_env}_BASE_URL",
            os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
        ),
        api_key=os.getenv(f"{provider_env}_API_KEY", os.getenv("ZHIPU_API_KEY", "")),
    )


def resolve_embedding_config() -> LlmConfig:
    provider = os.getenv("EMBEDDING_PROVIDER", DEFAULT_PROVIDER)
    provider_env = provider.upper()
    return LlmConfig(
        provider=provider,
        model=os.getenv(
            f"{provider_env}_EMBEDDING_MODEL",
            os.getenv("ZHIPU_EMBEDDING_MODEL", "embedding-3"),
        ),
        base_url=os.getenv(
            f"{provider_env}_BASE_URL",
            os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
        ),
        api_key=os.getenv(f"{provider_env}_API_KEY", os.getenv("ZHIPU_API_KEY", "")),
    )
