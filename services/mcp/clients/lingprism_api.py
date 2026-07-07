"""HTTP client for LingPrism core/api internal endpoints."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

INTERNAL_API_URL = os.getenv("LINGPRISM_INTERNAL_API_URL", "http://localhost:4000")
API_GRAPHQL_URL = os.getenv("LINGPRISM_GRAPHQL_URL", "http://localhost:4000/graphql")
SERVICE_TOKEN = os.getenv("MCP_SERVICE_TOKEN", "")


class LingPrismApiClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or INTERNAL_API_URL).rstrip("/")
        self.graphql_url = API_GRAPHQL_URL

    def _core_base_url(self) -> str:
        return os.getenv("CORE_HTTP_URL", "http://localhost:8080").rstrip("/")

    async def search(self, query: str, repo_ids: list[str] | None = None) -> dict[str, Any]:
        params: dict[str, str] = {"q": query}
        if repo_ids:
            params["repoIds"] = ",".join(repo_ids)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{self._core_base_url()}/internal/search", params=params)
            resp.raise_for_status()
            return resp.json()

    async def resolve_symbols(
        self,
        *,
        query: str,
        class_name: str | None = None,
        method_name: str | None = None,
        repo_ids: list[str] | None = None,
        limit: int = 5,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"query": query, "limit": limit}
        if class_name:
            body["className"] = class_name
        if method_name:
            body["methodName"] = method_name
        if repo_ids:
            body["repoIds"] = repo_ids
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._core_base_url()}/internal/symbols/resolve",
                json=body,
            )
            resp.raise_for_status()
            return resp.json()

    async def get_architecture_draft(self, repo_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._core_base_url()}/internal/architecture/{repo_id}/generate-draft",
            )
            resp.raise_for_status()
            return resp.json()

    async def ask_question(
        self,
        message: str,
        stream_id: str,
        user_id: str = "mcp-agent",
        session_id: str | None = None,
    ) -> str:
        """Ask via API orchestrator (persists session) when service token configured."""
        if SERVICE_TOKEN:
            return await self._ask_via_api_orchestrator(message, stream_id, user_id, session_id)
        return await self._ask_via_ai_worker(message, stream_id, user_id)

    async def _ask_via_api_orchestrator(
        self,
        message: str,
        stream_id: str,
        user_id: str,
        session_id: str | None,
    ) -> str:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.base_url}/internal/mcp/ask",
                headers={"X-Service-Token": SERVICE_TOKEN},
                json={
                    "question": message,
                    "userId": user_id,
                    "sessionId": session_id,
                },
            )
            resp.raise_for_status()
            return self._collect_sse_text(resp.text)

    async def _ask_via_ai_worker(self, message: str, stream_id: str, user_id: str) -> str:
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
            return self._collect_sse_text(resp.text)

    def _collect_sse_text(self, raw: str) -> str:
        chunks: list[str] = []
        for block in raw.split("\n\n"):
            for line in block.splitlines():
                if line.startswith("data:"):
                    try:
                        data = json.loads(line[5:].strip())
                        if "text" in data:
                            chunks.append(str(data["text"]))
                    except json.JSONDecodeError:
                        continue
        return "".join(chunks) or "（无回答）"
