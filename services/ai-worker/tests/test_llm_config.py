"""LLM configuration resolver tests."""

import os
import pytest

from infrastructure.llm.config import (
    resolve_embedding_config,
    resolve_embedding_dim,
    resolve_llm_config,
)


def _clear_llm_env() -> None:
    keys = [
        "LLM_PROVIDER",
        "EMBEDDING_PROVIDER",
        "ZHIPU_API_KEY",
        "ZHIPU_MODEL",
        "ZHIPU_EMBEDDING_MODEL",
        "ZHIPU_BASE_URL",
        "DEEPSEEK_API_KEY",
        "DEEPSEEK_MODEL",
        "DEEPSEEK_BASE_URL",
        "QWEN_API_KEY",
        "QWEN_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "LLM_SCENE_QA_MODEL",
        "LLM_SCENE_INTENT_MODEL",
        "LLM_SCENE_DOC_GEN_MODEL",
        "ZHIPU_EMBEDDING_DIM",
    ]
    for key in keys:
        os.environ.pop(key, None)


def test_resolve_llm_config_should_default_to_zhipu_qa_model() -> None:
    _clear_llm_env()
    cfg = resolve_llm_config("qa")
    assert cfg.provider == "zhipu"
    assert cfg.model == "glm-4-plus"
    assert cfg.base_url == "https://open.bigmodel.cn/api/paas/v4"
    assert cfg.scene == "qa"


def test_resolve_llm_config_should_use_intent_scene_model() -> None:
    _clear_llm_env()
    os.environ["LLM_SCENE_INTENT_MODEL"] = "glm-4-flash"
    try:
        cfg = resolve_llm_config("intent")
        assert cfg.model == "glm-4-flash"
    finally:
        os.environ.pop("LLM_SCENE_INTENT_MODEL", None)


def test_resolve_llm_config_should_switch_provider_to_deepseek() -> None:
    _clear_llm_env()
    os.environ["LLM_PROVIDER"] = "deepseek"
    os.environ["DEEPSEEK_API_KEY"] = "test-key"
    try:
        cfg = resolve_llm_config("qa")
        assert cfg.provider == "deepseek"
        assert cfg.model == "deepseek-chat"
        assert cfg.base_url == "https://api.deepseek.com/v1"
        assert cfg.api_key == "test-key"
    finally:
        os.environ.pop("LLM_PROVIDER", None)
        os.environ.pop("DEEPSEEK_API_KEY", None)


def test_resolve_llm_config_should_switch_provider_to_qwen() -> None:
    _clear_llm_env()
    os.environ["LLM_PROVIDER"] = "qwen"
    os.environ["QWEN_MODEL"] = "qwen-plus"
    try:
        cfg = resolve_llm_config("qa")
        assert cfg.provider == "qwen"
        assert cfg.model == "qwen-plus"
        assert "dashscope" in cfg.base_url
    finally:
        os.environ.pop("LLM_PROVIDER", None)
        os.environ.pop("QWEN_MODEL", None)


def test_resolve_llm_config_should_reject_unknown_provider() -> None:
    _clear_llm_env()
    os.environ["LLM_PROVIDER"] = "unknown-vendor"
    try:
        with pytest.raises(ValueError, match="unsupported LLM provider"):
            resolve_llm_config("qa")
    finally:
        os.environ.pop("LLM_PROVIDER", None)


def test_resolve_embedding_config_should_use_embedding_provider() -> None:
    _clear_llm_env()
    os.environ["EMBEDDING_PROVIDER"] = "openai"
    os.environ["OPENAI_API_KEY"] = "embed-key"
    try:
        cfg = resolve_embedding_config()
        assert cfg.provider == "openai"
        assert cfg.model == "text-embedding-3-small"
        assert cfg.api_key == "embed-key"
        assert cfg.scene == "embedding"
    finally:
        os.environ.pop("EMBEDDING_PROVIDER", None)
        os.environ.pop("OPENAI_API_KEY", None)


def test_resolve_embedding_dim_should_default_to_1024() -> None:
    _clear_llm_env()
    assert resolve_embedding_dim() == 1024


def test_resolve_embedding_dim_should_read_env_override() -> None:
    _clear_llm_env()
    os.environ["ZHIPU_EMBEDDING_DIM"] = "768"
    try:
        assert resolve_embedding_dim() == 768
    finally:
        os.environ.pop("ZHIPU_EMBEDDING_DIM", None)
