"""Intent classification node."""

from __future__ import annotations

import json
import re
from typing import Any

from chains.intent_rules import classify_intent
from infrastructure.llm.factory import PlaceholderChatModel
from infrastructure.langfuse_tracer import trace_llm_call, trace_workflow_node
from infrastructure.llm.config import resolve_llm_config
from workflow.deps import WorkflowDeps
from workflow.state import IntentKind, QaWorkflowState, RouteKind


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                return None
    return None


def _regex_intent(message: str) -> tuple[IntentKind, float, list[str]]:
    intents = classify_intent(message)
    primary = intents[0] if intents else "general"
    if primary in ("architecture", "code", "doc", "people"):
        mapped: IntentKind = primary  # type: ignore[assignment]
        return mapped, 0.75, intents
    return "general", 0.7, intents


async def intent_classify_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("status", {"phase": "understanding"})
    deps.emit("step", {"node": "intent_classify", "label": "理解问题意图"})

    message = state.resolved_message or state.message
    model = deps.intent_model

    with trace_workflow_node("intent_classify", trace_id=state.trace_id):
        if isinstance(model, PlaceholderChatModel):
            intent, confidence, subs = _regex_intent(message)
            state.intent = intent
            state.intent_confidence = confidence
            state.sub_intents = subs
        else:
            prompt = (
                "你是企业知识库问答意图分类器。分析用户问题并输出 JSON：\n"
                '{"intent":"architecture|code|doc|people|general|direct_answer|refuse|clarify",'
                '"confidence":0.0-1.0,"subIntents":[],"clarifyQuestion":null}\n'
                "规则：\n"
                "- architecture: 架构/依赖/调用链/模块关系\n"
                "- code: 函数/类/接口/字段/表结构\n"
                "- doc: 文档/手册/ADR/培训\n"
                "- people: 负责人/团队\n"
                "- direct_answer: 纯闲聊或仅依赖对话历史可答\n"
                "- clarify: 实体/repo 不明确\n"
                "- refuse: 越权/恶意/无关\n"
                f"\n用户问题：{message}"
            )
            cfg = resolve_llm_config("intent")
            text = ""
            with trace_llm_call(name="intent_classify", provider=cfg.provider, model=cfg.model, scene="intent"):
                if hasattr(model, "ainvoke"):
                    result = await model.ainvoke(prompt)
                    text = getattr(result, "content", str(result))
                else:
                    text = str(model.invoke(prompt))

            parsed = _extract_json(str(text)) or {}
            raw_intent = str(parsed.get("intent", "general"))
            if raw_intent in ("direct_answer", "refuse", "clarify"):
                state.intent = raw_intent  # type: ignore[assignment]
            else:
                state.intent = raw_intent if raw_intent in ("architecture", "code", "doc", "people", "general") else "general"  # type: ignore[assignment]
            state.intent_confidence = float(parsed.get("confidence", 0.7))
            state.sub_intents = list(parsed.get("subIntents") or [])
            clarify = parsed.get("clarifyQuestion")
            state.clarify_question = str(clarify) if clarify else None

    state.current_node = "intent_classify"
    state.workflow_node = "intent_classify"

    if state.intent == "refuse":
        state.refuse_reason = state.refuse_reason or "该问题无法在当前知识库范围内回答。"
        return "refuse"

    if state.intent == "clarify" or (
        state.intent_confidence < state.min_intent_confidence and state.intent not in ("direct_answer", "refuse")
    ):
        state.clarify_question = state.clarify_question or (
            "请补充更具体的信息，例如：目标仓库/服务名、模块名或文件名，以便精准检索。"
        )
        state.intent = "clarify"
        return "clarify"

    if state.intent == "direct_answer":
        return "direct_answer"

    if state.intent == "people":
        state.clarify_question = (
            "人员/负责人信息尚未接入组织架构数据源。"
            "请提供具体服务或仓库名称，或改问相关文档/代码。"
        )
        state.intent = "clarify"
        return "clarify"

    return "rag_prepare"
