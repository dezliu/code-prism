"""Internal HTTP server for chat SSE — consumed by services/api."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator

import redis
import uvicorn
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from chains.doc_gen import generate_doc_content
from chains.qa_router import stream_qa_with_rag
from infrastructure.config import load_env
from infrastructure.llm.streaming import is_cancelled, request_cancel

load_env()

app = FastAPI(title="LingPrism AI Worker", version="0.1.0")


class ChatStreamRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message: str = Field(min_length=1)
    stream_id: str = Field(alias="streamId")
    session_id: str | None = Field(default=None, alias="sessionId")
    user_id: str = Field(alias="userId")
    session_context: dict | None = Field(default=None, alias="sessionContext")


def _redis_client() -> redis.Redis:
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(url, decode_responses=False)


def _format_sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _event_stream(body: ChatStreamRequest) -> AsyncIterator[str]:
    client = _redis_client()

    def cancelled() -> bool:
        return is_cancelled(client, body.stream_id)

    async for event_name, data in stream_qa_with_rag(
        body.message,
        session_context=body.session_context,
        is_cancelled=cancelled,
    ):
        if data is None:
            continue
        yield _format_sse(event_name, data)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-worker"}


@app.post("/internal/chat/stream")
async def chat_stream(body: ChatStreamRequest) -> StreamingResponse:
    return StreamingResponse(
        _event_stream(body),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Stream-Id": body.stream_id,
        },
    )


class DocGenerateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1)
    doc_type: str = Field(default="training", alias="docType")
    repo_names: list[str] = Field(default_factory=list, alias="repoNames")
    context: str = ""


class StopRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    stream_id: str = Field(alias="streamId")


@app.post("/internal/doc/generate")
def doc_generate(body: DocGenerateRequest) -> dict[str, str]:
    content = generate_doc_content(
        title=body.title,
        doc_type=body.doc_type,
        repo_names=body.repo_names,
        context=body.context,
    )
    return {"content": content}


@app.post("/internal/chat/stop")
def chat_stop(body: StopRequest) -> dict[str, bool | str]:
    client = _redis_client()
    request_cancel(client, body.stream_id)
    return {"ok": True, "streamId": body.stream_id}


def main() -> None:
    port = int(os.getenv("AI_WORKER_HTTP_PORT", "8001"))
    uvicorn.run(
        "internal_http.server:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("NODE_ENV", "development") == "development",
    )


if __name__ == "__main__":
    main()
