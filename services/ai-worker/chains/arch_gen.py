"""Architecture diagram generation via LLM — analyze → JSON graph → repair."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Callable
from typing import TYPE_CHECKING, Any

from infrastructure.llm.factory import PlaceholderChatModel, create_chat_model

if TYPE_CHECKING:
    from langchain_core.language_models.chat_models import BaseChatModel

ARCH_SYSTEM_MESSAGE = """你是资深系统架构师，擅长从代码仓库提炼可落地的系统架构视图。

## 任务
根据代码上下文，整理「系统架构分析笔记」，供后续生成结构化架构图 JSON。

## 分析原则
1. 抽象层级：组件/服务/模块/数据存储，不要落到单个源文件
2. 证据导向：每个结论标注来源文件路径；无法确认写「待确认」
3. 聚焦运行时拓扑：谁调用谁、同步/异步、读写哪些存储
4. 节点类型预判：可部署单元 → service；逻辑分包/库 → module；DB/缓存/队列 → database
5. 控制规模：核心节点 8～20 个，边 10～30 条；超大系统按域聚合

## 输出格式
Markdown，必须包含：
- 系统定位与边界
- 组件清单（名称、类型、职责、代码依据）
- 依赖关系（调用方向、协议/方式）
- 数据存储清单
- 待确认项"""

ARCH_GRAPH_SYSTEM_MESSAGE = """你是资深系统架构师。你的唯一输出是符合下列 Schema 的 JSON 对象，不要输出 Markdown、解释或代码块标记。

## JSON Schema（严格遵守）
{
  "nodes": [
    { "id": "kebab-case-unique", "label": "显示名", "type": "service|module|database", "metadata": {} }
  ],
  "edges": [
    { "id": "e1", "source": "节点id", "target": "节点id", "label": "HTTP|gRPC|SQL|MQ|..." }
  ]
}

## 硬性规则
1. 只输出一个 JSON 对象，可被 JSON.parse 解析
2. id 全局唯一，使用小写 kebab-case（如 api-gateway, user-db）
3. type 只能是 service、module、database 三者之一
4. edges 的 source/target 必须引用 nodes 中已存在的 id
5. edges 的 id 唯一（e1, e2, … 或语义化 id）
6. label 使用中文或团队通用组件名，简洁（≤20 字）
7. metadata 可选；需要时用 { "evidence": ["path/to/file"], "note": "..." }
8. 节点数 8～20，边数 10～30；禁止编造代码中不存在的组件
9. 信息不足时减少节点，并在 metadata.note 标注「待确认」

## 类型指引
- service：可独立部署/运行的进程（API、Worker、Gateway）
- module：仓库内逻辑分包、库、子系统（非独立进程）
- database：MySQL、Redis、Qdrant、Neo4j、OpenSearch 等持久化/缓存"""


def build_arch_analysis_prompt(
    *,
    repo_name: str,
    repo_id: str,
    url: str,
    context: str,
    official_summary: str = "",
) -> str:
    official_block = ""
    if official_summary.strip():
        official_block = f"\n当前官方架构图摘要（供增量对比）：\n{official_summary}\n"
    return (
        f"请为代码仓库「{repo_name}」整理架构分析笔记。\n\n"
        "关联信息：\n"
        f"- 仓库 ID：{repo_id}\n"
        f"- Git 地址：{url}\n"
        f"{official_block}\n"
        f"代码上下文：\n{context or '（暂无代码上下文）'}"
    )


def build_arch_graph_prompt(
    *,
    repo_name: str,
    analysis: str,
    context: str,
) -> str:
    return (
        f"请根据架构分析笔记，生成系统架构图 JSON。\n\n"
        f"仓库：{repo_name}\n\n"
        f"架构分析笔记：\n{analysis or '（暂无分析结果）'}\n\n"
        f"原始代码上下文（供核对）：\n{context or '（暂无代码上下文）'}\n\n"
        "再次提醒：只输出 JSON，不要 ```json 包裹。"
    )


def build_arch_repair_prompt(
    *,
    errors: list[str],
    bad_json: str,
    analysis: str,
) -> str:
    error_lines = "\n".join(f"- {err}" for err in errors)
    return (
        "上次生成的架构图 JSON 校验失败，请修正后重新输出完整 JSON。\n\n"
        "## 校验错误\n"
        f"{error_lines}\n\n"
        "## 上次输出（可能有截断）\n"
        f"{bad_json}\n\n"
        "## 架构分析笔记（保持一致）\n"
        f"{analysis}\n\n"
        "## 要求\n"
        "- 修复全部错误，输出完整合法 JSON\n"
        "- 保持与架构分析一致，不要新增无依据的节点\n"
        "- 仍然只输出 JSON，无其他文字"
    )


def _llm_complete(model: BaseChatModel | PlaceholderChatModel, system: str, human: str) -> str:
    if isinstance(model, PlaceholderChatModel):
        result = model.invoke(f"{system}\n\n{human}")
        content = getattr(result, "content", result)
        return content if isinstance(content, str) else str(content)

    from langchain_core.messages import HumanMessage, SystemMessage

    result = model.invoke([SystemMessage(content=system), HumanMessage(content=human)])
    content = getattr(result, "content", result)
    return content if isinstance(content, str) else str(content)


def _placeholder_graph(repo_name: str) -> str:
    slug = repo_name.lower().replace(" ", "-")[:20] or "app"
    return (
        '{"nodes":['
        f'{{"id":"{slug}-api","label":"{repo_name} API","type":"service"}},'
        f'{{"id":"{slug}-core","label":"核心业务","type":"module"}},'
        f'{{"id":"{slug}-db","label":"主数据库","type":"database"}}'
        '],'
        '"edges":['
        f'{{"id":"e1","source":"{slug}-api","target":"{slug}-core","label":"HTTP"}},'
        f'{{"id":"e2","source":"{slug}-core","target":"{slug}-db","label":"SQL"}}'
        "]}"
    )


def analyze_arch_context(
    *,
    repo_name: str,
    repo_id: str,
    url: str,
    context: str,
    official_summary: str = "",
) -> str:
    prompt = build_arch_analysis_prompt(
        repo_name=repo_name,
        repo_id=repo_id,
        url=url,
        context=context,
        official_summary=official_summary,
    )
    model = create_chat_model("doc_gen")
    if isinstance(model, PlaceholderChatModel):
        return (
            f"## 系统定位与边界\n\n基于仓库「{repo_name}」的自动分析（Placeholder LLM）。\n\n"
            "## 组件清单\n\n"
            "- API 服务（service）：HTTP 入口\n"
            "- 核心业务（module）：领域逻辑\n"
            "- 主数据库（database）：持久化\n\n"
            "## 依赖关系\n\n"
            "- API → 核心业务（HTTP）\n"
            "- 核心业务 → 主数据库（SQL）\n"
        )

    return _llm_complete(model, ARCH_SYSTEM_MESSAGE, prompt)


def generate_arch_graph_json(
    *,
    repo_name: str,
    analysis: str,
    context: str,
) -> str:
    prompt = build_arch_graph_prompt(repo_name=repo_name, analysis=analysis, context=context)
    model = create_chat_model("doc_gen")
    if isinstance(model, PlaceholderChatModel):
        return _placeholder_graph(repo_name)

    return _llm_complete(model, ARCH_GRAPH_SYSTEM_MESSAGE, prompt)


def repair_arch_graph_json(
    *,
    errors: list[str],
    bad_json: str,
    analysis: str,
) -> str:
    prompt = build_arch_repair_prompt(errors=errors, bad_json=bad_json, analysis=analysis)
    model = create_chat_model("doc_gen")
    if isinstance(model, PlaceholderChatModel):
        return _placeholder_graph("repaired")

    return _llm_complete(model, ARCH_GRAPH_SYSTEM_MESSAGE, prompt)


async def stream_arch_generation(
    *,
    repo_name: str,
    repo_id: str,
    url: str,
    context: str,
    official_summary: str = "",
    is_cancelled: Callable[[], bool] | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any] | None]]:
    """Yield SSE tuples: status / done / error."""
    yield "status", {"phase": "analyzing"}

    try:
        analysis = analyze_arch_context(
            repo_name=repo_name,
            repo_id=repo_id,
            url=url,
            context=context,
            official_summary=official_summary,
        )
    except Exception as exc:
        yield "error", {"code": "ANALYZE_FAILED", "message": str(exc)}
        return

    if is_cancelled and is_cancelled():
        yield "done", {"interrupted": True}
        return

    yield "status", {"phase": "generating"}

    try:
        content = generate_arch_graph_json(
            repo_name=repo_name,
            analysis=analysis,
            context=context,
        )
    except Exception as exc:
        yield "error", {"code": "GENERATE_FAILED", "message": str(exc)}
        return

    if is_cancelled and is_cancelled():
        yield "done", {"interrupted": True}
        return

    yield "done", {
        "interrupted": False,
        "analysis": analysis,
        "content": content,
        "messageId": str(uuid.uuid4()),
    }


async def _noop_sleep() -> None:
    await asyncio.sleep(0)
