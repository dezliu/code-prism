"""Reindex knowledge documents with real embedding vectors."""

from __future__ import annotations

import argparse
import asyncio
import os

import httpx


async def reindex_doc(base_url: str, doc_id: str) -> bool:
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(f"{base_url.rstrip('/')}/internal/knowledge/index", json={"docId": doc_id})
        return res.status_code < 300


async def main() -> None:
    parser = argparse.ArgumentParser(description="Reindex knowledge docs via core internal API")
    parser.add_argument("--doc-id", action="append", dest="doc_ids", default=[])
    parser.add_argument("--base-url", default=os.getenv("CORE_HTTP_URL", "http://localhost:8080"))
    args = parser.parse_args()

    if not args.doc_ids:
        print("No --doc-id provided; nothing to reindex.")
        return

    for doc_id in args.doc_ids:
        ok = await reindex_doc(args.base_url, doc_id)
        status = "ok" if ok else "failed"
        print(f"reindex {doc_id}: {status}")


if __name__ == "__main__":
    asyncio.run(main())
