"""Knowledge document generation via LLM."""

from __future__ import annotations

from infrastructure.llm.factory import PlaceholderChatModel, create_chat_model

DOC_TYPE_LABELS = {
    "design": "设计文档",
    "adr": "架构决策记录",
    "ops": "运维文档",
    "training": "培训文档",
    "other": "知识文档",
}


def build_doc_prompt(
    *,
    title: str,
    doc_type: str,
    repo_names: list[str],
    context: str,
) -> str:
    type_label = DOC_TYPE_LABELS.get(doc_type, "知识文档")
    repos = "、".join(repo_names) if repo_names else "（未关联仓库）"
    return (
        f"请为知识库文档「{title}」生成{type_label}草稿。\n"
        f"关联代码仓库：{repos}\n\n"
        "要求包含以下章节（Markdown 格式）：\n"
        "1. 项目结构概览\n"
        "2. 核心功能说明\n"
        "3. 接口与模块清单\n"
        "4. 数据实体与依赖关系\n\n"
        f"以下是从代码索引检索到的上下文，请据此撰写，缺失处标注「待索引补充」：\n{context or '（暂无检索结果）'}"
    )


def generate_doc_content(
    *,
    title: str,
    doc_type: str,
    repo_names: list[str],
    context: str,
) -> str:
    prompt = build_doc_prompt(
        title=title,
        doc_type=doc_type,
        repo_names=repo_names,
        context=context,
    )
    model = create_chat_model("doc_gen")
    if isinstance(model, PlaceholderChatModel):
        repos = "、".join(repo_names) if repo_names else "未关联仓库"
        return (
            f"# {title}\n\n"
            f"> 关联仓库：{repos}\n\n"
            f"## 项目结构概览\n\n基于索引自动生成的草稿（Placeholder LLM）。\n\n"
            f"## 核心功能说明\n\n{context or '（暂无检索结果，请完成索引后重试）'}\n\n"
            f"## 接口与模块清单\n\n待索引完成后补充。\n\n"
            f"## 数据实体与依赖关系\n\n待索引完成后补充。"
        )

    result = model.invoke(prompt)
    content = getattr(result, "content", result)
    if not isinstance(content, str):
        content = str(content)
    return content
