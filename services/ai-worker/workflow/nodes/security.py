"""Security guard node."""

from __future__ import annotations

import re

from workflow.deps import WorkflowDeps
from workflow.state import QaWorkflowState, RouteKind

_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.I),
    re.compile(r"忽略.*(之前|上面).*(指令|规则)"),
    re.compile(r"system\s*prompt", re.I),
    re.compile(r"<\s*script", re.I),
]

_SENSITIVE_PATTERNS = [
    re.compile(r"(密码|api[_-]?key|secret|token)\s*[:=]", re.I),
]


async def security_guard_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("status", {"phase": "security"})
    deps.emit("step", {"node": "security_guard", "label": "安全检查"})

    text = state.message.strip()
    for pattern in _INJECTION_PATTERNS + _SENSITIVE_PATTERNS:
        if pattern.search(text):
            state.refuse_reason = "问题包含不安全或敏感内容，无法处理。"
            state.current_node = "security_guard"
            state.workflow_node = "refuse"
            return "refuse"

    state.current_phase = "understanding"
    state.current_node = "security_guard"
    return "continue"
