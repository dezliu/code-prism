"""HTTP client for core internal search API."""

from __future__ import annotations

import os
from typing import Any

import httpx


def resolve_core_base_urls(explicit: str | None = None) -> list[str]:
    """Mirror services/api CoreHttpClient failover: primary port then 18080."""
    if explicit:
        return [explicit.rstrip("/")]
    if env_url := os.getenv("CORE_HTTP_URL"):
        return [env_url.rstrip("/")]

    port = os.getenv("CORE_HTTP_PORT", "8080")
    primary = f"http://localhost:{port}"
    urls = [primary]
    if port == "8080":
        urls.append("http://localhost:18080")
    return list(dict.fromkeys(urls))


class CoreSearchClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_urls = resolve_core_base_urls(base_url)
        self.base_url = self._base_urls[0]

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        candidates = [self.base_url, *[u for u in self._base_urls if u != self.base_url]]

        async with httpx.AsyncClient(timeout=15.0, trust_env=False) as client:
            for base_url in candidates:
                try:
                    res = await client.request(
                        method,
                        f"{base_url}{path}",
                        params=params,
                        json=json_body,
                    )
                    res.raise_for_status()
                    self.base_url = base_url
                    return res.json()
                except Exception:
                    continue
        return None

    async def search(self, query: str, repo_ids: list[str] | None = None) -> list[dict[str, Any]]:
        params: dict[str, str] = {"q": query}
        if repo_ids:
            params["repoIds"] = ",".join(repo_ids)

        data = await self._request("GET", "/internal/search", params=params)
        if data is None:
            return self._offline_fallback(query)
        return list(data.get("hits", []))

    async def hybrid_search(
        self,
        query: str,
        *,
        repo_ids: list[str] | None = None,
        intent: str = "general",
        mode: str | None = None,
    ) -> list[dict[str, Any]]:
        body: dict[str, Any] = {"q": query, "intent": intent}
        if repo_ids:
            body["repoIds"] = repo_ids
        if mode:
            body["mode"] = mode

        data = await self._request("POST", "/internal/search/hybrid", json_body=body)
        if data is None:
            return await self.search(query, repo_ids=repo_ids)
        return list(data.get("hits", []))

    async def graph_neighbors(
        self,
        *,
        entity: str,
        repo_ids: list[str] | None = None,
        depth: int = 3,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {"entity": entity, "depth": str(depth)}
        if repo_ids:
            params["repoIds"] = ",".join(repo_ids)

        data = await self._request("GET", "/internal/graph/neighbors", params=params)
        if data is None:
            return []
        return list(data.get("hits", []))

    def _offline_fallback(self, query: str) -> list[dict[str, Any]]:
        return [
            {
                "type": "doc",
                "title": "离线检索占位",
                "snippet": f"core 不可达时的本地占位结果：{query}",
                "ref": "offline",
            }
        ]
