"""Template matching for chat SSE template_hint events."""

from __future__ import annotations

import re
from typing import Any


DEFAULT_TEMPLATES: list[dict[str, Any]] = [
    {
        "templateId": "arch-overview",
        "name": "架构概览",
        "preview": "请说明 {repo} 的整体架构与主要模块依赖关系。",
        "keywords": ["架构", "模块", "依赖", "服务"],
    },
    {
        "templateId": "code-locate",
        "name": "代码定位",
        "preview": "请帮我定位与「{topic}」相关的核心代码入口与调用链。",
        "keywords": ["代码", "函数", "类", "接口", "入口"],
    },
    {
        "templateId": "onboarding",
        "name": "新人上手",
        "preview": "我是新人，请基于现有文档说明如何快速理解 {repo} 项目。",
        "keywords": ["新人", "上手", "培训", "文档"],
    },
]


def match_templates(message: str, *, limit: int = 2) -> list[dict[str, Any]]:
    """Return template hints scored by keyword overlap with the user message."""
    scored: list[tuple[int, dict[str, Any]]] = []
    lower = message.lower()

    for template in DEFAULT_TEMPLATES:
        score = 0
        for kw in template["keywords"]:
            if kw.lower() in lower or re.search(re.escape(kw), message, re.IGNORECASE):
                score += 1
        if score > 0:
            scored.append((score, template))

    scored.sort(key=lambda item: item[0], reverse=True)
    hints: list[dict[str, Any]] = []
    for _, template in scored[:limit]:
        hints.append(
            {
                "templateId": template["templateId"],
                "name": template["name"],
                "preview": template["preview"],
            }
        )
    return hints
