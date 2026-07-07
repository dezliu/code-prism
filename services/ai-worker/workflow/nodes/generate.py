"""Answer generation node."""

from __future__ import annotations

from typing import Any

from infrastructure.langfuse_tracer import trace_llm_call, trace_workflow_node
from infrastructure.llm.config import resolve_llm_config
from infrastructure.llm.factory import PlaceholderChatModel
from workflow.deps import WorkflowDeps
from workflow.nodes.rag import _format_context_lines
from workflow.state import QaWorkflowState, RouteKind


def _format_retrieval_log(log: list[dict[str, str]]) -> str:
    if not log:
        return "（无）"
    return "\n".join(f"- [{entry['strategy']}] {entry['query']}" for entry in log)


def _build_no_context_fallback(state: QaWorkflowState, *, llm_configured: bool) -> str:
    tried = [entry["query"] for entry in state.retrieval_log]
    tried_text = "、".join(tried[:5])
    if len(tried) > 5:
        tried_text += f" 等 {len(tried)} 种"

    lines = [
        f"关于「{state.resolved_message or state.message}」：",
        "",
        f"已在代码索引与知识文档中多轮检索（{tried_text}），暂未找到相关内容。",
        "",
        "可能原因：",
        "1. 对应仓库/文档尚未同步或未完成索引",
        "2. 问题中的实体名与索引中的命名不一致",
        "3. 知识库中确实尚无该主题的文档或代码片段",
        "",
        "建议：",
        "- 在管理后台确认目标仓库已同步并完成索引",
        "- 换用更具体的关键词（模块名、文件名、接口名）重试",
    ]
    if not llm_configured:
        lines.append("- 配置 ZHIPU_API_KEY 后可启用 AI 扩写检索与深度回答")
    return "\n".join(lines)


def _extract_text(chunk: Any) -> str:
    content = getattr(chunk, "content", chunk)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
        return "".join(parts)
    return str(content) if content is not None else ""


def _format_code_locations(locations: list[dict[str, Any]]) -> str:
    if not locations:
        return "（无）"
    import json

    return json.dumps(locations, ensure_ascii=False, indent=2)


def _build_generate_prompt(state: QaWorkflowState) -> str:
    context_lines = _format_context_lines(state.rag_hits)
    graph_lines = _format_context_lines(state.graph_hits)
    location_json = _format_code_locations(state.code_locations)
    has_context = bool(context_lines or graph_lines or state.code_locations)

    history_lines = []
    for msg in state.recent_messages[-4:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_lines.append(f"{role}: {content}")

    retrieval_section = _format_retrieval_log(state.retrieval_log)
    has_context = bool(context_lines or graph_lines)
    anchor_name = state.anchor.entity_name if state.anchor else "无"

    error_feedback = ""
    if state.last_error:
        error_feedback = f"\n上次生成问题（请修正）：{state.last_error}\n"

    base = (
        "你是灵镜(LingPrism)企业知识助手。请基于检索到的企业知识上下文回答用户问题。\n"
        "要求：\n"
        "1. 优先整合检索上下文中的有效信息，组织成清晰、可直接阅读的回答\n"
        "2. 使用 Markdown 格式（标题、列表、加粗）；引用事实时标注来源类型（code/doc/repo/graph）\n"
        "3. 即使信息不完整，也要先给出已有信息的总结与合理推断，再在末尾用一两句话简要说明可能缺失的部分\n"
        "4. 禁止用「缺失的关键信息」「建议下一步行动」作为主要结构；不要只列缺口而不回答问题\n"
        "5. 不要编造上下文中不存在的技术细节\n\n"
        f"问题类型：{state.intent}\n"
        f"当前锚点：{anchor_name}\n"
        f"检索相关度：{state.rag_score:.2f}\n\n"
        f"检索过程（共 {len(state.retrieval_log)} 轮）：\n{retrieval_section}\n\n"
        "代码/文档检索上下文：\n"
        f"{chr(10).join(context_lines) if context_lines else '（无）'}\n\n"
        "已解析的代码位置（结构化，禁止修改行号/类名/方法名）：\n"
        f"{location_json}\n\n"
        "图谱关系上下文：\n"
        f"{chr(10).join(graph_lines) if graph_lines else '（无）'}\n\n"
        "对话历史：\n"
        f"{chr(10).join(history_lines) or '（无）'}\n"
        f"{error_feedback}\n"
    )
    if has_context:
        note = ""
        if state.low_confidence_retrieval:
            note = "注意：检索相关度偏低，以下回答基于有限上下文，请结合来源文档核实。\n\n"
        if state.intent == "code_location" and state.code_locations:
            note += (
                "注意：用户询问代码位置。请用 1-2 句话说明该功能做什么（基于 docComment/snippet），"
                "不要重复列出文件路径/行号/类名（前端会展示结构化卡片）。"
                "禁止编造上下文中不存在的行号或符号名。\n\n"
            )
        return base + note + f"用户问题：{state.resolved_message or state.message}"
    return (
        base
        + f"用户问题：{state.resolved_message or state.message}\n"
        + "注意：检索上下文为空，请诚实说明无法从知识库找到相关信息。"
    )


async def generate_answer_node(state: QaWorkflowState, deps: WorkflowDeps) -> RouteKind:
    deps.emit("status", {"phase": "generating"})
    deps.emit("step", {"node": "generate_answer", "label": "生成回答"})

    context_lines = _format_context_lines(state.rag_hits)
    has_context = bool(context_lines or state.graph_hits or state.code_locations)
    model = deps.qa_model
    cfg = resolve_llm_config("qa")

    with trace_workflow_node(
        "generate_answer",
        trace_id=state.trace_id,
        metadata={"rag_score": state.rag_score, "has_context": has_context},
    ):
        if isinstance(model, PlaceholderChatModel):
            if has_context:
                parts = []
                if state.code_locations:
                    parts.append("已定位以下代码位置（详见下方卡片）：")
                    for loc in state.code_locations[:3]:
                        parts.append(
                            f"- {loc.get('repoName', '')} / {loc.get('qualifiedRef', '')} "
                            f"({loc.get('filePath', '')}:{loc.get('startLine', '')})"
                        )
                else:
                    parts.append("根据知识库检索结果，整理如下：")
                    parts.extend(context_lines[:5])
                fallback = (
                    f"关于「{state.resolved_message or state.message}」：\n\n"
                    + "\n".join(parts)
                    + "\n\n"
                    "（当前为占位模式，配置 ZHIPU_API_KEY 后可获得更完整的 AI 分析。）"
                )
            else:
                fallback = _build_no_context_fallback(state, llm_configured=False)
            state.generated_answer = fallback
            state.stream_buffer = fallback
            for char in fallback:
                if deps.cancelled():
                    state.interrupted = True
                    return "stream_output"
                deps.emit("token", {"text": char})
            state.current_node = "generate_answer"
            return "stream_output"

        prompt = _build_generate_prompt(state)
        collected: list[str] = []
        with trace_llm_call(name="generate_answer", provider=cfg.provider, model=cfg.model, scene="qa"):
            if hasattr(model, "astream"):
                async for chunk in model.astream(prompt):
                    if deps.cancelled():
                        state.interrupted = True
                        return "stream_output"
                    text = _extract_text(chunk)
                    if text:
                        collected.append(text)
                        deps.emit("token", {"text": text})

        answer = "".join(collected)
        if not answer.strip():
            answer = _build_no_context_fallback(state, llm_configured=True)
            for char in answer:
                if deps.cancelled():
                    state.interrupted = True
                    return "stream_output"
                deps.emit("token", {"text": char})

        state.generated_answer = answer
        state.stream_buffer = answer
        state.current_node = "generate_answer"
        state.workflow_node = "generate_answer"
        return "grounding_check"
