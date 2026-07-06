"""Qdrant collection naming tests."""

import os

from infrastructure.qdrant_collections import (
    resolve_collection_name,
    resolve_collection_name_from_env,
)


def test_resolve_collection_name_should_build_default_zhipu_collection() -> None:
    os.environ.pop("EMBEDDING_PROVIDER", None)
    os.environ.pop("ZHIPU_EMBEDDING_DIM", None)
    assert resolve_collection_name("zhipu", 1024) == "lingprism_v1_zhipu_1024"


def test_resolve_collection_name_should_support_other_providers() -> None:
    assert resolve_collection_name("deepseek", 1536) == "lingprism_v1_deepseek_1536"
    assert resolve_collection_name("qwen", 1024) == "lingprism_v1_qwen_1024"
    assert resolve_collection_name("openai", 1536) == "lingprism_v1_openai_1536"


def test_resolve_collection_name_from_env_should_prefer_explicit_override() -> None:
    os.environ["QDRANT_COLLECTION"] = "custom_collection"
    try:
        assert resolve_collection_name_from_env() == "custom_collection"
    finally:
        os.environ.pop("QDRANT_COLLECTION", None)


def test_resolve_collection_name_from_env_should_derive_when_not_set() -> None:
    os.environ.pop("QDRANT_COLLECTION", None)
    os.environ["EMBEDDING_PROVIDER"] = "zhipu"
    os.environ["ZHIPU_EMBEDDING_DIM"] = "1024"
    try:
        assert resolve_collection_name_from_env() == "lingprism_v1_zhipu_1024"
    finally:
        os.environ.pop("EMBEDDING_PROVIDER", None)
        os.environ.pop("ZHIPU_EMBEDDING_DIM", None)


def test_resolve_collection_name_should_match_core_convention() -> None:
    """ai-worker and core must produce identical names for the same inputs."""
    # Mirrors services/core/internal/infrastructure/qdrant/collections.go
    provider = "zhipu"
    dim = 1024
    expected = f"lingprism_v1_{provider}_{dim}"
    assert resolve_collection_name(provider, dim) == expected
