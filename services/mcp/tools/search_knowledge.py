"""search_knowledge MCP tool."""

from __future__ import annotations

from typing import Any

from clients.lingprism_api import LingPrismApiClient

SEARCH_KNOWLEDGE_TOOL = {
    "name": "search_knowledge",
    "description": "知识库文档检索",
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "检索关键词"},
        },
        "required": ["query"],
    },
}


async def call_search_knowledge(arguments: dict[str, Any]) -> dict[str, Any]:
    query = str(arguments.get("query", "")).strip()
    client = LingPrismApiClient()
    result = await client.search(query)
    doc_hits = [h for h in result.get("hits", []) if h.get("type") == "doc"]
    lines = [f"- {h.get('title')}: {h.get('snippet')}" for h in doc_hits[:8]]
    text = "\n".join(lines) if lines else "未找到知识库文档"
    return {"content": [{"type": "text", "text": text}]}
