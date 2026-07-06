"""Provider defaults for OpenAI-compatible LLM vendors."""

from __future__ import annotations

from dataclasses import dataclass

PROVIDER_IDS = frozenset({"deepseek", "qwen", "zhipu", "openai"})
DEFAULT_PROVIDER = "zhipu"


@dataclass(frozen=True)
class ProviderDefaults:
    chat_model: str
    embedding_model: str
    base_url: str
    intent_model: str | None = None


_PROVIDER_DEFAULTS: dict[str, ProviderDefaults] = {
    "deepseek": ProviderDefaults(
        chat_model="deepseek-chat",
        embedding_model="deepseek-embedding",
        base_url="https://api.deepseek.com/v1",
    ),
    "qwen": ProviderDefaults(
        chat_model="qwen-max",
        embedding_model="text-embedding-v3",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    "zhipu": ProviderDefaults(
        chat_model="glm-4-plus",
        embedding_model="embedding-3",
        base_url="https://open.bigmodel.cn/api/paas/v4",
        intent_model="glm-4-flash",
    ),
    "openai": ProviderDefaults(
        chat_model="gpt-4o",
        embedding_model="text-embedding-3-small",
        base_url="https://api.openai.com/v1",
    ),
}

_SCENE_ENV_KEYS: dict[str, str] = {
    "qa": "LLM_SCENE_QA_MODEL",
    "intent": "LLM_SCENE_INTENT_MODEL",
    "doc_gen": "LLM_SCENE_DOC_GEN_MODEL",
}


def validate_provider(provider: str) -> str:
    normalized = provider.strip().lower()
    if normalized not in PROVIDER_IDS:
        supported = ", ".join(sorted(PROVIDER_IDS))
        raise ValueError(f"unsupported LLM provider '{provider}'; expected one of: {supported}")
    return normalized


def get_provider_defaults(provider: str) -> ProviderDefaults:
    return _PROVIDER_DEFAULTS[validate_provider(provider)]


def scene_env_key(scene: str) -> str | None:
    return _SCENE_ENV_KEYS.get(scene)
