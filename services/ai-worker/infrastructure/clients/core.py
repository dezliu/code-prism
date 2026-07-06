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

    async def search(self, query: str, repo_ids: list[str] | None = None) -> list[dict[str, Any]]:
        params: dict[str, str] = {"q": query}
        if repo_ids:
            params["repoIds"] = ",".join(repo_ids)

        candidates = [self.base_url, *[u for u in self._base_urls if u != self.base_url]]

        async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
            for base_url in candidates:
                try:
                    res = await client.get(f"{base_url}/internal/search", params=params)
                    res.raise_for_status()
                    data = res.json()
                    self.base_url = base_url
                    return list(data.get("hits", []))
                except Exception:
                    continue

        return [
            {
                "type": "doc",
                "title": "离线检索占位",
                "snippet": f"core 不可达时的本地占位结果：{query}",
                "ref": "offline",
            }
        ]
