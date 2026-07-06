"""Knowledge document generation via LLM — role-aware, doc-type-specific prompts."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from infrastructure.llm.factory import PlaceholderChatModel, create_chat_model

if TYPE_CHECKING:
    from langchain_core.language_models.chat_models import BaseChatModel

DOC_TYPE_LABELS = {
    "design": "设计文档",
    "adr": "架构决策记录",
    "ops": "运维文档",
    "training": "培训文档",
    "other": "知识文档",
}


@dataclass(frozen=True)
class DocSection:
    title: str
    guidance: str


@dataclass(frozen=True)
class DocTypeProfile:
    role: str
    background: str
    audience: str
    analysis_focus: tuple[str, ...]
    sections: tuple[DocSection, ...]
    writing_style: str


def _section(title: str, guidance: str) -> DocSection:
    return DocSection(title=title, guidance=guidance)


DOC_TYPE_PROFILES: dict[str, DocTypeProfile] = {
    "design": DocTypeProfile(
        role="资深系统架构师",
        background=(
            "你正在为企业内部系统撰写正式设计文档，用于架构评审、研发落地与跨团队对齐。"
            "需要从代码中提炼真实的技术事实，形成可审查、可演进的设计说明。"
        ),
        audience="技术负责人、架构师、后端/前端开发工程师",
        analysis_focus=(
            "识别系统定位、边界、目标用户与核心价值",
            "梳理功能模块划分、关键业务流程与领域对象",
            "总结技术栈、分层架构、模块依赖与部署拓扑",
            "提取数据表/实体/字段、索引、主外键与 ORM/迁移线索",
            "列出对外 API、RPC、消息、Webhook 等集成点及契约",
            "归纳业务规则、状态机、权限模型与异常处理策略",
        ),
        sections=(
            _section("系统简介", "背景、建设目标、用户角色、系统边界、技术栈概览"),
            _section("系统功能", "按业务域拆分功能清单，说明入口、核心流程、关键约束"),
            _section("系统架构设计", "分层/组件/部署拓扑、模块职责、依赖关系、关键设计决策"),
            _section("表设计", "核心表/实体、字段说明、索引、关联关系、数据生命周期"),
            _section("对外提供服务", "REST/GraphQL/gRPC/消息/定时任务等接口清单与调用说明"),
            _section("具体业务信息", "领域规则、状态流转、权限、异常处理、与其他系统协作"),
        ),
        writing_style="严谨、结构化，适合架构评审；优先使用表格与示意图描述复杂关系",
    ),
    "training": DocTypeProfile(
        role="企业技术培训讲师",
        background=(
            "你正在为新员工或转岗同事编写培训文档，帮助他们从零上手该系统。"
            "内容应循序渐进、可操作，侧重「学会用」而非「评审设计」。"
        ),
        audience="新入职研发、测试、运维及需要快速了解系统的业务同学",
        analysis_focus=(
            "提炼系统一句话介绍与主要使用场景",
            "识别本地/测试环境搭建方式、启动命令、依赖服务",
            "梳理新人必懂的 3～5 个核心功能与操作路径",
            "标注关键代码入口、目录导航与常见开发改动点",
            "收集易踩坑点、调试手段与排错线索",
            "发现可练习的示例任务或冒烟验证步骤",
        ),
        sections=(
            _section("培训目标与学习路径", "学完后能做什么、建议阅读顺序、预计上手时间"),
            _section("系统概览", "业务背景、用户角色、系统边界、与周边系统关系（通俗表述）"),
            _section("环境准备与快速启动", "依赖安装、配置、启动命令、健康检查、首个成功验证"),
            _section("核心功能实操指南", "按场景分步操作说明，附界面/接口/命令示例"),
            _section("代码导读", "目录结构、关键模块、典型改动流程、调试与日志查看"),
            _section("常见问题与 FAQ", "高频问题、排错步骤、求助渠道、推荐阅读"),
        ),
        writing_style="通俗易懂、步骤清晰，多用「第一步/第二步」与检查清单，避免过度术语堆砌",
    ),
    "ops": DocTypeProfile(
        role="资深 SRE / DevOps 工程师",
        background=(
            "你正在编写运维文档，供部署、监控、值班与应急使用。"
            "内容必须可执行，强调配置、依赖、告警与回滚，而非业务细节复述。"
        ),
        audience="运维工程师、SRE、on-call 值班人员、发布负责人",
        analysis_focus=(
            "识别部署方式：容器、K8s、裸机、CI/CD 流水线线索",
            "提取环境变量、配置文件、密钥与外部依赖服务",
            "梳理健康检查、启动/停止、扩缩容与发布脚本",
            "发现日志、指标、链路追踪与告警相关配置",
            "标注数据库迁移、备份、灰度与回滚要点",
            "收集历史风险点：单点、资源瓶颈、超时与重试策略",
        ),
        sections=(
            _section("系统运行概览", "服务清单、运行环境、关键依赖、SLA 预期"),
            _section("部署架构与环境", "拓扑图、环境差异（dev/staging/prod）、网络与端口"),
            _section("配置与密钥管理", "配置项清单、默认值、敏感信息管理、变更流程"),
            _section("监控告警与日志", "指标、日志路径、告警规则、值班排查入口"),
            _section("发布与回滚流程", "发布步骤、前置检查、灰度策略、回滚与验证"),
            _section("故障排查与应急预案", "常见故障现象、定位步骤、临时止血、升级路径"),
        ),
        writing_style="偏操作手册，命令与检查项可直接复制执行；风险点用醒目标记",
    ),
    "adr": DocTypeProfile(
        role="技术委员会记录的架构师",
        background=(
            "你正在撰写架构决策记录（ADR），记录重要技术选型的背景、备选方案与最终结论。"
            "需体现决策时的约束与权衡，而非罗列现状。"
        ),
        audience="架构师、技术负责人、核心开发",
        analysis_focus=(
            "从代码与配置反推当前关键技术选型（框架、存储、通信、部署）",
            "识别隐含约束：性能、成本、团队技能、合规、存量系统",
            "对比代码中可见的替代方案痕迹或未采用路径",
            "评估决策对模块边界、可测试性、可运维性的影响",
            "标注仍开放的问题、技术债与后续演进方向",
        ),
        sections=(
            _section("背景与问题陈述", "要解决什么问题、为何现在必须决策"),
            _section("决策驱动因素与约束", "业务/技术/组织约束、非功能性要求"),
            _section("候选方案对比", "至少 2 个方案，列优缺点、成本、风险"),
            _section("最终决策与理由", "选择了什么、为何放弃其他方案"),
            _section("影响范围与落地事项", "受影响模块、迁移/改造步骤、负责人建议"),
            _section("风险与后续跟进", "已知风险、验证指标、复审触发条件"),
        ),
        writing_style="客观、论证充分，突出 trade-off；避免空泛口号",
    ),
    "other": DocTypeProfile(
        role="技术文档工程师",
        background=(
            "你正在沉淀团队可复用的通用知识文档，面向需要快速查阅的研发人员。"
            "根据代码上下文组织信息，不强行套用设计/培训/运维模板。"
        ),
        audience="全体研发与相关协作同学",
        analysis_focus=(
            "提炼主题相关核心概念与术语",
            "梳理与主题相关的模块、接口与数据",
            "标注代码来源与可信度",
            "指出尚待补充的信息",
        ),
        sections=(
            _section("文档目的与适用范围", "本文解决什么问题、适合谁阅读"),
            _section("核心概念", "关键术语、角色、边界定义"),
            _section("关键模块说明", "相关模块职责、交互关系、代码位置"),
            _section("参考与延伸", "相关仓库路径、链接、后续阅读建议"),
        ),
        writing_style="简洁准确，便于查阅与搜索",
    ),
}


def get_doc_profile(doc_type: str) -> DocTypeProfile:
    return DOC_TYPE_PROFILES.get(doc_type, DOC_TYPE_PROFILES["other"])


def build_system_message(profile: DocTypeProfile) -> str:
    return (
        f"你是{profile.role}。\n\n"
        f"## 背景\n{profile.background}\n\n"
        f"## 目标读者\n{profile.audience}\n\n"
        f"## 写作风格\n{profile.writing_style}"
    )


def build_analysis_prompt(*, doc_type: str, repo_names: list[str], context: str) -> str:
    profile = get_doc_profile(doc_type)
    repos = "、".join(repo_names) if repo_names else "（未关联仓库）"
    type_label = DOC_TYPE_LABELS.get(doc_type, "知识文档")
    focus_lines = "\n".join(f"{i}. {item}" for i, item in enumerate(profile.analysis_focus, 1))
    return (
        f"请基于你的角色，为后续撰写「{type_label}」整理技术分析笔记（Markdown）。\n\n"
        f"关联仓库：{repos}\n\n"
        "分析重点：\n"
        f"{focus_lines}\n\n"
        "输出要求：\n"
        "- 按分析重点分节，每节给出要点与代码依据\n"
        "- 标注信息来源文件路径\n"
        "- 无法从代码确认的内容写「待确认」\n\n"
        f"代码上下文：\n{context or '（暂无代码上下文）'}"
    )


def build_doc_prompt(
    *,
    title: str,
    doc_type: str,
    repo_names: list[str],
    analysis: str,
    context: str,
) -> str:
    profile = get_doc_profile(doc_type)
    type_label = DOC_TYPE_LABELS.get(doc_type, "知识文档")
    repos = "、".join(repo_names) if repo_names else "（未关联仓库）"
    section_titles = "\n".join(f"## {s.title}" for s in profile.sections)
    section_guidance = "\n".join(f"- {s.title}：{s.guidance}" for s in profile.sections)
    return (
        f"请为知识库文档「{title}」撰写一份详细的{type_label}（Markdown）。\n"
        f"关联代码仓库：{repos}\n\n"
        "写作要求：\n"
        f"- {profile.writing_style}\n"
        "- 每个章节至少 3 个小节或要点，尽量使用表格、列表\n"
        "- 优先引用代码中的真实模块名、接口名、表名、配置项\n"
        "- 信息不足时标注「待确认」并说明需补充材料\n"
        "- 不要输出与文档无关的寒暄\n"
        "- 不要生成与其他文档类型无关的章节\n\n"
        f"必须包含以下章节（按顺序，使用二级标题）：\n{section_titles}\n\n"
        f"各章节指引：\n{section_guidance}\n\n"
        f"技术分析笔记：\n{analysis or '（暂无分析结果）'}\n\n"
        f"原始代码上下文（供核对细节）：\n{context or '（暂无代码上下文）'}"
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


def analyze_code_context(*, doc_type: str, repo_names: list[str], context: str) -> str:
    profile = get_doc_profile(doc_type)
    system = build_system_message(profile)
    prompt = build_analysis_prompt(doc_type=doc_type, repo_names=repo_names, context=context)
    model = create_chat_model("doc_gen")
    if isinstance(model, PlaceholderChatModel):
        type_label = DOC_TYPE_LABELS.get(doc_type, "知识文档")
        return (
            f"## 分析角色\n\n{profile.role}（{type_label}）\n\n"
            "## 分析摘要\n\n基于仓库代码的自动分析（Placeholder LLM）。\n\n"
            "## 代码线索\n\n"
            f"{context[:2000] if context else '（暂无代码上下文）'}"
        )

    return _llm_complete(model, system, prompt)


def generate_doc_content(
    *,
    title: str,
    doc_type: str,
    repo_names: list[str],
    context: str,
) -> str:
    profile = get_doc_profile(doc_type)
    analysis = analyze_code_context(doc_type=doc_type, repo_names=repo_names, context=context)
    system = build_system_message(profile)
    prompt = build_doc_prompt(
        title=title,
        doc_type=doc_type,
        repo_names=repo_names,
        analysis=analysis,
        context=context,
    )
    model = create_chat_model("doc_gen")
    if isinstance(model, PlaceholderChatModel):
        repos = "、".join(repo_names) if repo_names else "未关联仓库"
        type_label = DOC_TYPE_LABELS.get(doc_type, "知识文档")
        lines = [
            f"# {title}",
            "",
            f"> 文档类型：{type_label} · 关联仓库：{repos}",
            f"> 生成角色：{profile.role}",
            "",
        ]
        for section in profile.sections:
            lines.extend([
                f"## {section.title}",
                "",
                _placeholder_section(doc_type, section.title, context),
                "",
            ])
        return "\n".join(lines).rstrip()

    return _llm_complete(model, system, prompt)


def _placeholder_section(doc_type: str, section: str, context: str) -> str:
    if section in {"系统简介", "培训目标与学习路径", "系统运行概览", "背景与问题陈述", "文档目的与适用范围"}:
        profile = get_doc_profile(doc_type)
        return f"基于 Git 仓库克隆与代码提取生成的「{DOC_TYPE_LABELS.get(doc_type, '知识文档')}」草稿（Placeholder LLM）。\n\n角色：{profile.role}"
    if section in {"系统功能", "核心功能实操指南", "代码导读"} and context:
        return f"根据代码上下文初步归纳：\n\n{context[:1500]}"
    return "待配置 LLM 或补充代码索引后生成详细内容。"


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


async def _stream_text_chunks(text: str) -> AsyncIterator[str]:
    chunk_size = 24
    for index in range(0, len(text), chunk_size):
        yield text[index : index + chunk_size]
        await asyncio.sleep(0)


async def _stream_llm_text(
    model: BaseChatModel | PlaceholderChatModel,
    system: str,
    human: str,
    *,
    is_cancelled: Callable[[], bool] | None = None,
) -> AsyncIterator[str]:
    if isinstance(model, PlaceholderChatModel):
        content = _llm_complete(model, system, human)
        async for chunk in _stream_text_chunks(content):
            if is_cancelled and is_cancelled():
                return
            yield chunk
        return

    from langchain_core.messages import HumanMessage, SystemMessage

    messages = [SystemMessage(content=system), HumanMessage(content=human)]
    if hasattr(model, "astream"):
        async for chunk in model.astream(messages):
            if is_cancelled and is_cancelled():
                return
            text = _extract_text(chunk)
            if text:
                yield text
        return

    content = _llm_complete(model, system, human)
    async for chunk in _stream_text_chunks(content):
        if is_cancelled and is_cancelled():
            return
        yield chunk


async def stream_doc_generation(
    *,
    title: str,
    doc_type: str,
    repo_names: list[str],
    context: str,
    is_cancelled: Callable[[], bool] | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any] | None]]:
    """Yield SSE tuples: status / token / done / error."""
    profile = get_doc_profile(doc_type)

    yield "status", {"phase": "analyzing"}

    analysis = analyze_code_context(doc_type=doc_type, repo_names=repo_names, context=context)
    if is_cancelled and is_cancelled():
        yield "done", {"interrupted": True}
        return

    yield "status", {"phase": "generating"}

    system = build_system_message(profile)
    prompt = build_doc_prompt(
        title=title,
        doc_type=doc_type,
        repo_names=repo_names,
        analysis=analysis,
        context=context,
    )
    model = create_chat_model("doc_gen")

    if isinstance(model, PlaceholderChatModel):
        content = generate_doc_content(
            title=title,
            doc_type=doc_type,
            repo_names=repo_names,
            context=context,
        )
        async for chunk in _stream_text_chunks(content):
            if is_cancelled and is_cancelled():
                yield "done", {"interrupted": True}
                return
            yield "token", {"text": chunk}
        yield "done", {"interrupted": False, "content": content}
        return

    parts: list[str] = []
    async for chunk in _stream_llm_text(model, system, prompt, is_cancelled=is_cancelled):
        parts.append(chunk)
        yield "token", {"text": chunk}

    if is_cancelled and is_cancelled():
        yield "done", {"interrupted": True}
        return

    yield "done", {
        "interrupted": False,
        "content": "".join(parts),
        "messageId": str(uuid.uuid4()),
    }
