"""search_code MCP tool."""

from __future__ import annotations

from typing import Any

from clients.lingprism_api import LingPrismApiClient

SEARCH_CODE_TOOL = {
    "name": "search_code",
    "description": "符号/语义代码检索，支持精确定位代码位置",
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "检索关键词或自然语言问题"},
            "mode": {
                "type": "string",
                "enum": ["semantic", "locate"],
                "description": "semantic=混合检索；locate=精确定位符号位置",
            },
            "className": {"type": "string", "description": "可选类名（locate 模式）"},
            "methodName": {"type": "string", "description": "可选方法名（locate 模式）"},
            "repoIds": {
                "type": "array",
                "items": {"type": "string"},
                "description": "可选仓库 ID 列表",
            },
        },
        "required": ["query"],
    },
}


def _format_location(loc: dict[str, Any]) -> str:
    lines = [
        f"仓库: {loc.get('repoName', '')}",
        f"类名: {loc.get('className', '—')}",
        f"方法名: {loc.get('methodName', '')}",
        f"行数: {loc.get('startLine', '')}-{loc.get('endLine', '')}",
        f"文件: {loc.get('filePath', '')}",
        f"引用: {loc.get('qualifiedRef', '')}",
    ]
    if loc.get("docComment"):
        lines.append(f"注释: {loc.get('docComment')}")
    return "\n".join(lines)


async def call_search_code(arguments: dict[str, Any]) -> dict[str, Any]:
    query = str(arguments.get("query", "")).strip()
    if not query:
        return {"content": [{"type": "text", "text": "query 不能为空"}]}
    repo_ids = arguments.get("repoIds") or []
    if not isinstance(repo_ids, list):
        repo_ids = []
    mode = str(arguments.get("mode", "semantic")).strip().lower()
    client = LingPrismApiClient()

    if mode == "locate":
        result = await client.resolve_symbols(
            query=query,
            class_name=str(arguments.get("className", "") or "") or None,
            method_name=str(arguments.get("methodName", "") or "") or None,
            repo_ids=repo_ids,
        )
        locations = result.get("locations") or []
        if not locations:
            return {"content": [{"type": "text", "text": "未找到匹配的代码位置"}]}
        blocks = [f"## 结果 {idx + 1}\n{_format_location(loc)}" for idx, loc in enumerate(locations[:5])]
        return {"content": [{"type": "text", "text": "\n\n".join(blocks)}]}

    result = await client.search(query, repo_ids if repo_ids else None)
    hits = result.get("hits", [])
    lines = [f"- [{h.get('type')}] {h.get('title')}: {h.get('snippet')}" for h in hits[:8]]
    text = "\n".join(lines) if lines else "未找到匹配结果"
    return {"content": [{"type": "text", "text": text}]}
