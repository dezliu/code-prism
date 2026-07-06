"""Reindex knowledge documents with real embedding vectors.

Requires ZHIPU_API_KEY (or OPENAI_API_KEY) on the core service for real embeddings.
Without an API key, core falls back to hash vectors and semantic recall stays poor.

Examples:
  # Reindex specific docs (get doc IDs from knowledge_doc_items table / admin UI)
  python scripts/reindex_knowledge.py --doc-id <uuid> --doc-id <uuid2>

  # Reindex all published docs marked indexed_in_search (needs API + MySQL access)
  python scripts/reindex_knowledge.py --all-indexed
"""

from __future__ import annotations

import argparse
import asyncio
import os

import httpx


async def reindex_doc(base_url: str, doc_id: str) -> bool:
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(f"{base_url.rstrip('/')}/internal/knowledge/index", json={"docId": doc_id})
        return res.status_code < 300


async def list_indexed_doc_ids(base_url: str) -> list[str]:
    """Best-effort: core has no list endpoint; caller should pass --doc-id explicitly."""
    _ = base_url
    env_ids = os.getenv("REINDEX_DOC_IDS", "")
    return [item.strip() for item in env_ids.split(",") if item.strip()]


async def main() -> None:
    parser = argparse.ArgumentParser(description="Reindex knowledge docs via core internal API")
    parser.add_argument("--doc-id", action="append", dest="doc_ids", default=[])
    parser.add_argument("--all-indexed", action="store_true", help="Reindex doc IDs from REINDEX_DOC_IDS env (comma-separated)")
    parser.add_argument("--base-url", default=os.getenv("CORE_HTTP_URL", "http://localhost:8080"))
    args = parser.parse_args()

    doc_ids = list(args.doc_ids)
    if args.all_indexed:
        doc_ids.extend(await list_indexed_doc_ids(args.base_url))

    doc_ids = list(dict.fromkeys(doc_ids))
    if not doc_ids:
        print("No doc IDs provided. Use --doc-id <uuid> or set REINDEX_DOC_IDS for --all-indexed.")
        print("Ensure core has ZHIPU_API_KEY configured before reindexing.")
        return

    if not os.getenv("ZHIPU_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        print("Warning: no ZHIPU_API_KEY/OPENAI_API_KEY in this shell; confirm core service has embedding API configured.")

    for doc_id in doc_ids:
        ok = await reindex_doc(args.base_url, doc_id)
        status = "ok" if ok else "failed"
        print(f"reindex {doc_id}: {status}")


if __name__ == "__main__":
    asyncio.run(main())
