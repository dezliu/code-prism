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


def _format_location(loc: dict[str, Any], index: int = 1) -> str:
    """格式化代码位置信息，按用户要求的格式输出"""
    repo_name = loc.get('repoName', '未知仓库')
    class_name = loc.get('className') or '—'
    method_name = loc.get('methodName', '')
    start_line = loc.get('startLine', '')
    end_line = loc.get('endLine', '')
    qualified_ref = loc.get('qualifiedRef', '')
    doc_comment = loc.get('docComment', '')
    code_snippet = loc.get('codeSnippet', '')
    
    # 行数显示优化：单行和多行不同展示
    if start_line and end_line:
        line_text = f"{start_line}" if start_line == end_line else f"{start_line}-{end_line}"
    else:
        line_text = f"{start_line or ''}-{end_line or ''}"
    
    lines = [
        f"## 结果 {index}",
        f"**相关的功能，在 {repo_name} 仓库**",
        f"- **类名**：{class_name}",
        f"- **方法名**：{method_name}",
        f"- **行数**：{line_text}",
        f"- **符号引用**：`{qualified_ref}` ✨[点击复制]",
    ]
    
    if doc_comment:
        lines.append(f"- **注释**：{doc_comment}")
    
    # 新增：显示实际代码片段
    if code_snippet:
        lines.append("")
        lines.append("**代码片段：**")
        lines.append("```")
        lines.append(code_snippet)
        lines.append("```")
    
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
        blocks = [_format_location(loc, idx + 1) for idx, loc in enumerate(locations[:5])]
        return {"content": [{"type": "text", "text": "\n\n".join(blocks)}]}

    result = await client.search(query, repo_ids if repo_ids else None)
    hits = result.get("hits", [])
    lines = [f"- [{h.get('type')}] {h.get('title')}: {h.get('snippet')}" for h in hits[:8]]
    text = "\n".join(lines) if lines else "未找到匹配结果"
    return {"content": [{"type": "text", "text": text}]}
