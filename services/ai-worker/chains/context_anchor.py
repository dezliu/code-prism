"""Resolve pronouns and implicit references using session anchor — PRD 4.2.4."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ContextAnchor:
    entity_type: str
    entity_id: str
    entity_name: str
    repo_id: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ContextAnchor | None:
        if not data:
            return None
        return cls(
            entity_type=str(data.get("entityType", data.get("entity_type", "service"))),
            entity_id=str(data.get("entityId", data.get("entity_id", ""))),
            entity_name=str(data.get("entityName", data.get("entity_name", ""))),
            repo_id=data.get("repoId") or data.get("repo_id"),
        )

    def to_dict(self) -> dict[str, str | None]:
        return {
            "entityType": self.entity_type,
            "entityId": self.entity_id,
            "entityName": self.entity_name,
            "repoId": self.repo_id,
        }


_PRONOUN_PATTERN = re.compile(r"(它|这个|该服务|该模块|那个服务)")
_TOPIC_SWITCH = re.compile(r"(?:换个问题|另外|再说说|切换到)\s*([^，。?？!！\s]{2,30})")


def resolve_query(message: str, anchor: ContextAnchor | None) -> tuple[str, ContextAnchor | None]:
    """Expand follow-up queries using anchor; return resolved message and updated anchor."""
    text = message.strip()
    if not text:
        return text, anchor

    switch = _TOPIC_SWITCH.search(text)
    if switch:
        name = switch.group(1)
        new_anchor = ContextAnchor(
            entity_type="service",
            entity_id=name,
            entity_name=name,
        )
        return text, new_anchor

    if anchor and _PRONOUN_PATTERN.search(text):
        resolved = _PRONOUN_PATTERN.sub(anchor.entity_name, text)
        return resolved, anchor

    service_match = re.search(r"([\u4e00-\u9fa5A-Za-z0-9_-]{2,30})服务", text)
    if service_match:
        name = service_match.group(1) + "服务"
        return text, ContextAnchor(
            entity_type="service",
            entity_id=name,
            entity_name=name,
        )

    return text, anchor


def extract_anchor_from_answer(answer: str, current: ContextAnchor | None) -> ContextAnchor | None:
    if current:
        return current
    match = re.search(r"([\u4e00-\u9fa5A-Za-z0-9_-]{2,30})服务", answer)
    if match:
        name = match.group(1) + "服务"
        return ContextAnchor(entity_type="service", entity_id=name, entity_name=name)
    return None
