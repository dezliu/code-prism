"""ask_question MCP tool."""

from __future__ import annotations

import uuid
from typing import Any

from clients.lingprism_api import LingPrismApiClient

ASK_QUESTION_TOOL = {
    "name": "ask_question",
    "description": "自然语言智能问答（委托 ai-worker）",
    "inputSchema": {
        "type": "object",
        "properties": {
            "question": {"type": "string", "description": "用户问题"},
        },
        "required": ["question"],
    },
}


async def call_ask_question(arguments: dict[str, Any]) -> dict[str, Any]:
    question = str(arguments.get("question", "")).strip()
    if not question:
        return {"content": [{"type": "text", "text": "question 不能为空"}]}
    client = LingPrismApiClient()
    answer = await client.ask_question(question, stream_id=str(uuid.uuid4()))
    return {"content": [{"type": "text", "text": answer}]}
