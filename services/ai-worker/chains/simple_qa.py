"""Simplified QA streaming chain — Batch 3 SSE demo (mock RAG)."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import Any

from infrastructure.llm.factory import PlaceholderChatModel, create_chat_model


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


async def _stream_placeholder(model: Any, message: str) -> AsyncIterator[str]:
    text = model.invoke(message)
    if asyncio.iscoroutine(text):
        text = await text
    if not isinstance(text, str):
        text = str(text)
    for char in text:
        yield char
        await asyncio.sleep(0)


async def stream_qa_tokens(
    message: str,
    *,
    is_cancelled: Any | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any] | None]]:
    """Yield (event_name, data) tuples for SSE encoding."""
    yield "status", {"phase": "understanding"}
    yield "status", {"phase": "generating"}

    model = create_chat_model("qa")

    if isinstance(model, PlaceholderChatModel):
        yield "error", {
            "code": "LLM_NOT_CONFIGURED",
            "message": (
                "未配置 LLM API Key。请在 infra/docker/.env 中设置 ZHIPU_API_KEY 后重启 ai-worker。"
            ),
        }
        yield "done", {
            "messageId": str(uuid.uuid4()),
            "interrupted": False,
        }
        return

    prompt = (
        "你是灵镜(LingPrism)企业知识助手。请简洁回答用户问题。\n\n"
        f"用户问题：{message}"
    )

    if hasattr(model, "astream"):
        async for chunk in model.astream(prompt):
            if is_cancelled and is_cancelled():
                yield "done", {
                    "messageId": str(uuid.uuid4()),
                    "interrupted": True,
                }
                return
            text = _extract_text(chunk)
            if text:
                yield "token", {"text": text}
    else:
        async for char in _stream_placeholder(model, prompt):
            if is_cancelled and is_cancelled():
                yield "done", {
                    "messageId": str(uuid.uuid4()),
                    "interrupted": True,
                }
                return
            yield "token", {"text": char}

    yield "done", {
        "messageId": str(uuid.uuid4()),
        "interrupted": False,
    }
