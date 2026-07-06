"""Workflow runtime dependencies."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from infrastructure.clients.core import CoreSearchClient
from infrastructure.llm.factory import PlaceholderChatModel, create_chat_model


EmitFn = Callable[[str, dict[str, Any]], None]
CancelFn = Callable[[], bool]


@dataclass
class WorkflowDeps:
    search_client: CoreSearchClient
    emit: EmitFn
    is_cancelled: CancelFn | None = None
    trace_id: str | None = None
    intent_model: Any = field(default_factory=lambda: create_chat_model("intent"))
    qa_model: Any = field(default_factory=lambda: create_chat_model("qa"))

    def cancelled(self) -> bool:
        return bool(self.is_cancelled and self.is_cancelled())

    def llm_configured(self) -> bool:
        return not isinstance(self.qa_model, PlaceholderChatModel)
