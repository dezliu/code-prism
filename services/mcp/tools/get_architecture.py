"""get_architecture MCP tool."""

from __future__ import annotations

import json
from typing import Any

from clients.lingprism_api import LingPrismApiClient

GET_ARCHITECTURE_TOOL = {
    "name": "get_architecture",
    "description": "获取官方/草稿架构图 JSON",
    "inputSchema": {
        "type": "object",
        "properties": {
            "repoId": {"type": "string", "description": "仓库 ID"},
        },
        "required": ["repoId"],
    },
}


async def call_get_architecture(arguments: dict[str, Any]) -> dict[str, Any]:
    repo_id = str(arguments.get("repoId", "")).strip()
    if not repo_id:
        return {"content": [{"type": "text", "text": "repoId 不能为空"}]}
    client = LingPrismApiClient()
    result = await client.get_architecture_draft(repo_id)
    return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}]}
