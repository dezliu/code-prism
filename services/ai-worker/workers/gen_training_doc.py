"""Celery task: generate training doc via LLM (delegates to knowledge API)."""

from __future__ import annotations

from celery_app import celery_app
from infrastructure.llm.factory import create_chat_model, PlaceholderChatModel


@celery_app.task(name="workers.gen_training_doc.generate")
def generate_training_doc(repo_name: str, context: str) -> dict:
    prompt = (
        f"为代码仓库 {repo_name} 生成培训文档草稿，包含：项目结构、核心功能、接口清单摘要。\n\n"
        f"上下文：\n{context}"
    )
    model = create_chat_model("doc_gen")
    if isinstance(model, PlaceholderChatModel):
        content = f"# {repo_name} 培训文档\n\n{context or '（待补充索引上下文）'}"
    else:
        content = model.invoke(prompt).content  # type: ignore[attr-defined]
        if not isinstance(content, str):
            content = str(content)
    return {"title": f"{repo_name} 培训文档", "content": content}
