"""Qdrant collection naming — shared convention with services/core."""

from __future__ import annotations

import os

PRODUCT_PREFIX = "lingprism"
COLLECTION_VERSION = "v1"


def resolve_collection_name(
    provider: str | None = None,
    dim: int | None = None,
    *,
    version: str = COLLECTION_VERSION,
) -> str:
    """
    Build collection name: lingprism_{version}_{provider}_{dim}.

    Example: lingprism_v1_zhipu_1024
    """
    resolved_provider = (provider or os.getenv("EMBEDDING_PROVIDER", "zhipu")).strip().lower()
    if dim is None:
        from infrastructure.llm.config import resolve_embedding_dim

        resolved_dim = resolve_embedding_dim()
    else:
        if dim <= 0:
            raise ValueError(f"embedding dimension must be positive, got {dim}")
        resolved_dim = dim

    return f"{PRODUCT_PREFIX}_{version}_{resolved_provider}_{resolved_dim}"


def resolve_collection_name_from_env() -> str:
    """Prefer explicit QDRANT_COLLECTION; otherwise derive from provider + dim."""
    explicit = os.getenv("QDRANT_COLLECTION")
    if explicit:
        return explicit
    return resolve_collection_name()
