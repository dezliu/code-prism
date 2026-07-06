"""Celery task: generate training doc via LLM."""

from __future__ import annotations

from celery_app import celery_app
from chains.doc_gen import generate_doc_content


@celery_app.task(name="workers.gen_training_doc.generate")
def generate_training_doc(repo_name: str, context: str) -> dict:
    content = generate_doc_content(
        title=f"{repo_name} 培训文档",
        doc_type="training",
        repo_names=[repo_name],
        context=context,
    )
    return {"title": f"{repo_name} 培训文档", "content": content}
