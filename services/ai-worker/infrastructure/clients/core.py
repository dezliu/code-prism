"""HTTP client for core internal search API."""

from __future__ import annotations

import os
from typing import Any

import httpx


class CoreSearchClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or os.getenv("CORE_HTTP_URL", "http://localhost:8080")).rstrip("/")

    async def search(self, query: str, repo_ids: list[str] | None = None) -> list[dict[str, Any]]:
        params: dict[str, str] = {"q": query}
        if repo_ids:
            params["repoIds"] = ",".join(repo_ids)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(f"{self.base_url}/internal/search", params=params)
                res.raise_for_status()
                data = res.json()
                return list(data.get("hits", []))
        except Exception:
            return [
                {
                    "type": "doc",
                    "title": "离线检索占位",
                    "snippet": f"core 不可达时的本地占位结果：{query}",
                    "ref": "offline",
                }
            ]
