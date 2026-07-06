"""HTTP client for LingPrism core/api internal endpoints."""

from __future__ import annotations

import os
from typing import Any

import httpx

INTERNAL_API_URL = os.getenv("LINGPRISM_INTERNAL_API_URL", "http://localhost:8080")
API_GRAPHQL_URL = os.getenv("LINGPRISM_GRAPHQL_URL", "http://localhost:4000/graphql")
SERVICE_TOKEN = os.getenv("MCP_SERVICE_TOKEN", "")


class LingPrismApiClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or INTERNAL_API_URL).rstrip("/")
        self.graphql_url = API_GRAPHQL_URL

    async def search(self, query: str, repo_ids: list[str] | None = None) -> dict[str, Any]:
        params: dict[str, str] = {"q": query}
        if repo_ids:
            params["repoIds"] = ",".join(repo_ids)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{self.base_url}/internal/search", params=params)
            resp.raise_for_status()
            return resp.json()

    async def get_architecture_draft(self, repo_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{self.base_url}/internal/architecture/{repo_id}/generate-draft")
            resp.raise_for_status()
            return resp.json()

    async def ask_question(self, message: str, stream_id: str, user_id: str = "mcp-agent") -> str:
        ai_worker_url = os.getenv("AI_WORKER_URL", "http://localhost:8001")
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{ai_worker_url.rstrip('/')}/internal/chat/stream",
                json={
                    "message": message,
                    "streamId": stream_id,
                    "userId": user_id,
                },
            )
            resp.raise_for_status()
            chunks: list[str] = []
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    import json

                    try:
                        data = json.loads(line[5:].strip())
                        if "text" in data:
                            chunks.append(str(data["text"]))
                    except json.JSONDecodeError:
                        continue
            return "".join(chunks) or "（无回答）"
