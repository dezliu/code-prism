"""Qdrant client helpers — ensure collection exists for embedding writes."""

from __future__ import annotations

import os
from typing import Any

from infrastructure.qdrant_collections import resolve_collection_name_from_env


def qdrant_url() -> str:
    return os.getenv("QDRANT_URL", "http://localhost:6333")


def create_qdrant_client(url: str | None = None) -> Any:
    from qdrant_client import QdrantClient

    return QdrantClient(url=url or qdrant_url())


def ensure_collection(
    client: Any,
    *,
    collection_name: str | None = None,
    vector_size: int,
    distance: str = "Cosine",
) -> str:
    """
    Create collection when missing. Returns the collection name used.

    distance: Cosine | Euclid | Dot — passed to qdrant_client.models.Distance.
    """
    from qdrant_client.http import models

    name = collection_name or resolve_collection_name_from_env()
    distance_map = {
        "Cosine": models.Distance.COSINE,
        "Euclid": models.Distance.EUCLID,
        "Dot": models.Distance.DOT,
    }
    if distance not in distance_map:
        raise ValueError(f"unsupported distance metric: {distance}")

    exists = False
    try:
        client.get_collection(name)
        exists = True
    except Exception:  # noqa: BLE001 — collection missing
        exists = False

    if not exists:
        client.create_collection(
            collection_name=name,
            vectors_config=models.VectorParams(
                size=vector_size,
                distance=distance_map[distance],
            ),
        )

    return name
