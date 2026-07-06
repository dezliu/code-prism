"""Workflow state for QA LangGraph-style pipeline."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Literal

from chains.context_anchor import ContextAnchor

IntentKind = Literal[
    "architecture",
    "code",
    "doc",
    "people",
    "general",
    "direct_answer",
    "refuse",
    "clarify",
    "needs_retrieval",
]

WorkflowPhase = Literal[
    "security",
    "understanding",
    "routing",
    "retrieving",
    "generating",
    "grounding",
    "formatting",
]

RouteKind = Literal[
    "continue",
    "clarify",
    "direct_answer",
    "refuse",
    "template_apply",
    "rag_prepare",
    "rag_retrieve",
    "rag_quality_gate",
    "hyde_expand",
    "generate_answer",
    "grounding_check",
    "stream_output",
    "end",
]


@dataclass
class TemplateMatchResult:
    template_id: str
    name: str
    preview: str
    score: float
    output_schema: dict[str, Any] | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class QaWorkflowState:
    message: str
    resolved_message: str = ""
    session_context: dict[str, Any] = field(default_factory=dict)
    trace_id: str | None = None

    anchor: ContextAnchor | None = None
    allowed_repo_ids: list[str] = field(default_factory=list)
    recent_messages: list[dict[str, Any]] = field(default_factory=list)
    qa_templates: list[dict[str, Any]] = field(default_factory=list)
    apply_template_id: str | None = None

    intent: IntentKind = "general"
    intent_confidence: float = 1.0
    sub_intents: list[str] = field(default_factory=list)
    clarify_question: str | None = None
    refuse_reason: str | None = None
    direct_answer: str | None = None

    template_matches: list[TemplateMatchResult] = field(default_factory=list)
    active_template: TemplateMatchResult | None = None

    rag_queries: list[str] = field(default_factory=list)
    rag_hits: list[dict[str, Any]] = field(default_factory=list)
    graph_hits: list[dict[str, Any]] = field(default_factory=list)
    retrieval_log: list[dict[str, str]] = field(default_factory=list)
    rag_score: float = 0.0
    rag_loop_count: int = 0
    hyde_used: bool = False
    hyde_draft: str | None = None
    low_confidence_retrieval: bool = False

    generated_answer: str = ""
    stream_buffer: str = ""
    last_error: str | None = None
    grounding_retry_count: int = 0

    current_phase: WorkflowPhase = "security"
    current_node: str = "start"
    status: Literal["running", "completed", "failed", "interrupted"] = "running"
    workflow_node: str = ""
    interrupted: bool = False
    message_id: str = ""

    max_rag_loops: int = field(default_factory=lambda: max(1, int(os.getenv("QA_MAX_RAG_LOOPS", "2"))))
    max_grounding_retries: int = field(default_factory=lambda: max(0, int(os.getenv("QA_MAX_GROUNDING_RETRIES", "2"))))
    min_rag_score: float = field(default_factory=lambda: float(os.getenv("QA_MIN_RAG_SCORE", "0.35")))
    min_rag_hits: int = field(default_factory=lambda: max(1, int(os.getenv("QA_MIN_RAG_HITS", "1"))))
    min_intent_confidence: float = field(default_factory=lambda: float(os.getenv("QA_MIN_INTENT_CONFIDENCE", "0.8")))


DEFAULT_WORKFLOW_LIMITS = {
    "max_rag_loops": max(1, int(os.getenv("QA_MAX_RAG_LOOPS", "2"))),
    "max_grounding_retries": max(0, int(os.getenv("QA_MAX_GROUNDING_RETRIES", "2"))),
    "min_rag_score": float(os.getenv("QA_MIN_RAG_SCORE", "0.35")),
    "min_rag_hits": max(1, int(os.getenv("QA_MIN_RAG_HITS", "1"))),
    "min_intent_confidence": float(os.getenv("QA_MIN_INTENT_CONFIDENCE", "0.8")),
}
