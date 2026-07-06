"""search_code MCP tool."""

from __future__ import annotations

from typing import Any

from clients.lingprism_api import LingPrismApiClient

SEARCH_CODE_TOOL = {
    "name": "search_code",
    "description": "符号/语义代码检索",
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "检索关键词或自然语言问题"},
            "repoIds": {
                "type": "array",
                "items": {"type": "string"},
                "description": "可选仓库 ID 列表",
            },
        },
        "required": ["query"],
    },
}


async def call_search_code(arguments: dict[str, Any]) -> dict[str, Any]:
    query = str(arguments.get("query", "")).strip()
    if not query:
        return {"content": [{"type": "text", "text": "query 不能为空"}]}
    repo_ids = arguments.get("repoIds") or []
    client = LingPrismApiClient()
    result = await client.search(query, repo_ids if isinstance(repo_ids, list) else None)
    hits = result.get("hits", [])
    lines = [f"- [{h.get('type')}] {h.get('title')}: {h.get('snippet')}" for h in hits[:8]]
    text = "\n".join(lines) if lines else "未找到匹配结果"
    return {"content": [{"type": "text", "text": text}]}
