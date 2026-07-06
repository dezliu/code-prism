"""Celery task: index embedding writes to Qdrant."""

from __future__ import annotations

import hashlib
import os

from celery_app import celery_app
from infrastructure.clients.qdrant import create_qdrant_client, ensure_collection


def _hash_embed(text: str, dim: int) -> list[float]:
    vec = [0.0] * dim
    for i, ch in enumerate(text):
        vec[i % dim] += float(ord(ch) % 997) / 997.0
    return vec


@celery_app.task(name="workers.index_embed.embed_text")
def embed_text(text: str, payload: dict) -> dict:
    dim = int(os.getenv("ZHIPU_EMBEDDING_DIM", "1024"))
    client = create_qdrant_client()
    collection = ensure_collection(client, vector_size=dim)
    vec = _hash_embed(text, dim)
    point_id = int(hashlib.md5(text.encode()).hexdigest()[:8], 16)
    client.upsert(
        collection_name=collection,
        points=[{"id": point_id, "vector": vec, "payload": payload}],
    )
    return {"ok": True, "collection": collection, "pointId": point_id}
