"""Template matching for chat SSE template_hint events."""

from __future__ import annotations

import re
from typing import Any

TEMPLATE_AUTO_APPLY_THRESHOLD = 0.85
TEMPLATE_HINT_THRESHOLD = 0.6


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


def _keyword_overlap_score(message: str, template: dict[str, Any]) -> float:
    keywords = template.get("keywords") or []
    if not keywords:
        return 0.0
    lower = message.lower()
    hits = 0
    for kw in keywords:
        if kw.lower() in lower or re.search(re.escape(kw), message, re.IGNORECASE):
            hits += 1
    return min(1.0, hits / max(len(keywords), 1))


def score_templates(
    message: str,
    *,
    templates: list[dict[str, Any]] | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Return templates with normalized score in [0, 1]."""
    source = templates if templates else DEFAULT_TEMPLATES
    scored: list[tuple[float, int, dict[str, Any]]] = []

    for template in source:
        score = _keyword_overlap_score(message, template)
        if score > 0:
            priority = int(template.get("priority") or 0)
            scored.append((score, priority, template))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    results: list[dict[str, Any]] = []
    for score, _, template in scored[:limit]:
        results.append(
            {
                "templateId": template.get("templateId") or template.get("id", ""),
                "name": template["name"],
                "preview": template.get("preview") or template.get("previewTemplate", ""),
                "score": round(score, 3),
                "outputSchema": template.get("outputSchema") or template.get("output_schema"),
                "_raw": template,
            }
        )
    return results


def match_templates(
    message: str,
    *,
    templates: list[dict[str, Any]] | None = None,
    limit: int = 2,
) -> list[dict[str, Any]]:
    """Return template hints scored by keyword overlap with the user message."""
    scored = score_templates(message, templates=templates, limit=limit)
    return [
        {
            "templateId": item["templateId"],
            "name": item["name"],
            "preview": item["preview"],
        }
        for item in scored
        if item.get("score", 0) >= TEMPLATE_HINT_THRESHOLD
    ][:limit]
