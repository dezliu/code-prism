"""Symbol resolution node for code_location intent."""

from __future__ import annotations

from typing import Any

from chains.symbol_query import parse_symbol_query
from infrastructure.langfuse_tracer import trace_workflow_node
from workflow.deps import WorkflowDeps
from workflow.state import QaWorkflowState, RouteKind


def _repo_filter(state: QaWorkflowState) -> list[str] | None:
    if state.anchor and state.anchor.repo_id:
        if state.allowed_repo_ids and state.anchor.repo_id not in state.allowed_repo_ids:
            return state.allowed_repo_ids or None
        return [state.anchor.repo_id]
    if state.allowed_repo_ids:
        return state.allowed_repo_ids
    return None


async def symbol_resolve_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("status", {"phase": "retrieving"})
    deps.emit("step", {"node": "symbol_resolve", "label": "定位代码符号"})

    query = state.resolved_message or state.message
    parsed = parse_symbol_query(query)
    repo_ids = _repo_filter(state)

    # 判断是否为精确符号查询（有 className 或 methodName）
    is_exact_symbol_query = bool(parsed.class_name or parsed.method_name)
    
    body: dict[str, Any] = {
        "query": parsed.semantic_query,
        "limit": 5,
    }
    if parsed.class_name:
        body["className"] = parsed.class_name
    if parsed.method_name:
        body["methodName"] = parsed.method_name
    if repo_ids:
        body["repoIds"] = repo_ids

    with trace_workflow_node(
        "symbol_resolve",
        trace_id=state.trace_id,
        metadata={
            "className": parsed.class_name,
            "methodName": parsed.method_name,
            "repoHint": parsed.repo_hint,
            "isExactQuery": is_exact_symbol_query,
        },
    ):
        result = await deps.search_client.resolve_symbols(body)
        locations = list(result.get("locations") or [])

        if parsed.repo_hint and len(locations) > 1:
            hint = parsed.repo_hint.lower()
            filtered = [
                loc
                for loc in locations
                if hint in str(loc.get("repoName", "")).lower()
                or hint in str(loc.get("repoId", "")).lower()
            ]
            if filtered:
                locations = filtered

        state.code_locations = locations
        state.rag_score = 0.85 if locations else 0.0

        for loc in locations[:5]:
            deps.emit("code_location", loc)
            deps.emit(
                "source",
                {
                    "type": "code",
                    "title": loc.get("qualifiedRef") or loc.get("methodName", ""),
                    "ref": loc.get("filePath"),
                },
            )

        if not locations:
            # 如果是自然语言查询且无结果，尝试降级到语义搜索
            if not is_exact_symbol_query and parsed.is_location_intent:
                state.low_confidence_retrieval = True
                state.clarify_question = (
                    f"正在为您搜索与「{query}」相关的代码位置...\n"
                    f"建议：提供更具体的类名或方法名可获得更精确的结果（如 OrderService.rollback）"
                )
                # 仍然返回 generate_answer，让 LLM 基于语义搜索结果生成回答
                return "generate_answer"
            else:
                # 精确查询无结果，要求用户补充信息
                state.low_confidence_retrieval = True
                state.clarify_question = (
                    "未找到精确匹配的代码位置。请补充：目标仓库/服务名、类名或方法名（如 OrderService.rollback）。"
                )
                return "clarify"

        if len(locations) > 3 and not repo_ids:
            state.clarify_question = (
                f"找到 {len(locations)} 处可能相关的代码位置，请指定目标仓库或服务名以缩小范围。"
            )
            state.low_confidence_retrieval = True

    state.current_node = "symbol_resolve"
    return "generate_answer"
