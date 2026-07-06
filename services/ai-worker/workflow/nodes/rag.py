"""RAG retrieval nodes with intent-specific routing."""

from __future__ import annotations

import os
from typing import Any

from chains.rag_retrieval import (
    build_search_variants,
    expand_query_with_llm,
    is_meaningful_hit,
    merge_hits,
)
from infrastructure.langfuse_tracer import trace_workflow_node
from infrastructure.llm.factory import PlaceholderChatModel
from workflow.deps import WorkflowDeps
from workflow.state import IntentKind, QaWorkflowState, RouteKind

INTENT_WEIGHTS: dict[str, dict[str, float]] = {
    "architecture": {"code": 0.2, "doc": 0.3, "graph": 0.4, "repo": 0.1},
    "code": {"code": 0.6, "doc": 0.2, "graph": 0.1, "repo": 0.1},
    "doc": {"code": 0.1, "doc": 0.7, "graph": 0.0, "repo": 0.2},
    "general": {"code": 0.35, "doc": 0.45, "graph": 0.1, "repo": 0.1},
}


def _repo_filter(state: QaWorkflowState) -> list[str] | None:
    if state.anchor and state.anchor.repo_id:
        if state.allowed_repo_ids and state.anchor.repo_id not in state.allowed_repo_ids:
            return state.allowed_repo_ids or None
        return [state.anchor.repo_id]
    if state.allowed_repo_ids:
        return state.allowed_repo_ids
    return None


def _format_context_lines(hits: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for hit in hits[:8]:
        ref = hit.get("ref")
        ref_suffix = f" (引用: {ref})" if ref else ""
        lines.append(
            f"- [{hit.get('type', 'doc')}] {hit.get('title', '')}: "
            f"{hit.get('snippet', '')}{ref_suffix}"
        )
    return lines


def _compute_rag_score(hits: list[dict[str, Any]], graph_hits: list[dict[str, Any]], intent: IntentKind) -> float:
    if not hits and not graph_hits:
        return 0.0

    weights = INTENT_WEIGHTS.get(intent, INTENT_WEIGHTS["general"])
    buckets: dict[str, list[float]] = {"code": [], "doc": [], "graph": [], "repo": []}

    for hit in hits:
        hit_type = str(hit.get("type", "doc"))
        score = float(hit.get("score") or 0.5)
        if hit_type == "code":
            buckets["code"].append(score)
        elif hit_type == "repo":
            buckets["repo"].append(score)
        else:
            buckets["doc"].append(score)

    for hit in graph_hits:
        buckets["graph"].append(float(hit.get("score") or 0.6))

    total = 0.0
    weight_sum = 0.0
    for bucket, weight in weights.items():
        if weight <= 0:
            continue
        values = buckets.get(bucket, [])
        avg = sum(values) / len(values) if values else 0.0
        total += avg * weight
        if values:
            weight_sum += weight

    if weight_sum == 0:
        return 0.0
    return min(1.0, total / weight_sum)


async def _search_once(
    deps: WorkflowDeps,
    state: QaWorkflowState,
    query: str,
    strategy: str,
    *,
    intent: IntentKind | None = None,
    search_mode: str | None = None,
) -> list[dict[str, Any]]:
    repo_ids = _repo_filter(state)
    state.retrieval_log.append({"strategy": strategy, "query": query})

    use_hybrid = os.getenv("QA_USE_HYBRID_SEARCH", "true").lower() in ("1", "true", "yes")
    effective_intent = intent or state.intent
    if use_hybrid and hasattr(deps.search_client, "hybrid_search"):
        raw = await deps.search_client.hybrid_search(
            query,
            repo_ids=repo_ids,
            intent=effective_intent if effective_intent in ("architecture", "code", "doc", "general") else "general",
            mode=search_mode,
        )
    else:
        raw = await deps.search_client.search(query, repo_ids=repo_ids)

    return [h for h in raw if is_meaningful_hit(h)]


async def rag_prepare_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("status", {"phase": "routing"})
    deps.emit("step", {"node": "rag_prepare", "label": "准备检索 query"})

    query = state.resolved_message or state.message
    queries = [query.strip()]

    if len(query.strip()) >= 15 and not isinstance(deps.intent_model, PlaceholderChatModel):
        expanded = await expand_query_with_llm(query, deps.intent_model)
        queries.extend(expanded)

    state.rag_queries = list(dict.fromkeys(q for q in queries if q))
    state.current_node = "rag_prepare"
    return "rag_retrieve"


async def rag_retrieve_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("status", {"phase": "retrieving"})
    deps.emit("step", {"node": "rag_retrieve", "label": "检索企业知识"})

    query = state.resolved_message or state.message
    intent = state.intent if state.intent in ("architecture", "code", "doc", "general") else "general"

    with trace_workflow_node(
        "rag_retrieve",
        trace_id=state.trace_id,
        metadata={"intent": intent, "rag_loop": state.rag_loop_count},
    ):
        collected: list[list[dict[str, Any]]] = []

        search_query = state.hyde_draft or query
        if state.hyde_draft:
            hits = await _search_once(deps, state, search_query, "hyde", intent=intent)
            if hits:
                collected.append(hits)

        for q in state.rag_queries or [query]:
            hits = await _search_once(deps, state, q, "original" if q == query else "rewrite", intent=intent)
            if hits:
                collected.append(hits)
                break

        if not collected:
            for variant in build_search_variants(query)[1:4]:
                hits = await _search_once(deps, state, variant, "keyword", intent=intent)
                if hits:
                    collected.append(hits)
                    break

        state.rag_hits = merge_hits(collected, limit=8)

        if intent == "architecture" and hasattr(deps.search_client, "graph_neighbors"):
            entity = state.anchor.entity_name if state.anchor else query
            repo_ids = _repo_filter(state)
            graph_hits = await deps.search_client.graph_neighbors(
                entity=entity,
                repo_ids=repo_ids,
                depth=3,
            )
            state.graph_hits = [h for h in graph_hits if is_meaningful_hit(h)]
            for hit in state.graph_hits[:3]:
                state.rag_hits = merge_hits([state.rag_hits, [hit]], limit=8)

        if intent == "code":
            keywords = build_search_variants(query)[1:3]
            for kw in keywords:
                hits = await _search_once(deps, state, kw, "code_symbol", intent="code", search_mode="code")
                if hits:
                    state.rag_hits = merge_hits([state.rag_hits, hits], limit=8)
                    break

        for hit in state.rag_hits[:5]:
            deps.emit(
                "source",
                {
                    "type": hit.get("type", "doc"),
                    "title": hit.get("title", ""),
                    "ref": hit.get("ref"),
                },
            )

        state.rag_score = _compute_rag_score(state.rag_hits, state.graph_hits, intent)
        state.current_node = "rag_retrieve"

    if state.retrieval_log:
        deps.emit(
            "status",
            {
                "phase": "retrieving",
                "attempts": len(state.retrieval_log),
                "strategies": list(dict.fromkeys(entry["strategy"] for entry in state.retrieval_log)),
                "ragScore": round(state.rag_score, 3),
            },
        )

    return "rag_quality_gate"


async def rag_quality_gate_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("step", {"node": "rag_quality_gate", "label": "评估检索质量"})

    if state.rag_score >= state.min_rag_score:
        state.current_node = "rag_quality_gate"
        if state.active_template:
            return "template_apply"
        return "generate_answer"

    if state.rag_loop_count < state.max_rag_loops and not state.hyde_used:
        return "hyde_expand"

    if state.rag_loop_count >= state.max_rag_loops or state.hyde_used:
        state.refuse_reason = (
            f"已在知识库多轮检索（{len(state.retrieval_log)} 次），"
            f"相关度分数 {state.rag_score:.2f} 低于阈值 {state.min_rag_score}。"
        )
        state.current_node = "rag_quality_gate"
        return "refuse"

    return "generate_answer"


async def hyde_expand_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("step", {"node": "hyde_expand", "label": "扩展检索（HyDE）"})

    query = state.resolved_message or state.message
    model = deps.qa_model

    draft = ""
    if isinstance(model, PlaceholderChatModel):
        draft = f"关于 {query} 的技术说明草稿：涉及模块交互、接口定义与依赖关系。"
    else:
        prompt = (
            "请用 100 字以内写一段假设性的企业技术说明草稿，"
            "用于辅助检索，保留核心实体名，不要编造具体人名。\n"
            f"用户问题：{query}"
        )
        if hasattr(model, "ainvoke"):
            result = await model.ainvoke(prompt)
            draft = str(getattr(result, "content", result))
        else:
            draft = str(model.invoke(prompt))

    state.hyde_draft = draft.strip()
    state.hyde_used = True
    state.rag_loop_count += 1
    state.current_node = "hyde_expand"
    return "rag_retrieve"
