from chains.rag_retrieval import (
    build_search_variants,
    expand_query_with_llm,
    extract_keywords,
    is_meaningful_hit,
    merge_hits,
    retrieve_context,
)
from infrastructure.llm.factory import PlaceholderChatModel
import asyncio


def test_is_meaningful_hit_filters_placeholder():
    assert not is_meaningful_hit(
        {
            "type": "code",
            "title": "代码检索结果",
            "snippet": "未找到精确匹配，建议缩小问题范围后重试。查询：nl-hermes",
        }
    )
    assert is_meaningful_hit(
        {
            "type": "doc",
            "title": "nl-hermes 设计文档",
            "snippet": "nl-hermes 是消息网关模块…",
            "ref": "doc-1",
        }
    )


def test_extract_keywords_from_mixed_query():
    keywords = extract_keywords("我想了解 nl-hermes的具体设计")
    assert "nl-hermes" in keywords
    assert "nl_hermes" in keywords


def test_extract_keywords_git_knowledge_base():
    keywords = extract_keywords("git知识库设计是什么样的？")
    assert "git知识库" in keywords or "git" in keywords
    assert "知识库" in keywords
    assert "git 知识库" in keywords


def test_build_search_variants_includes_entity_queries():
    variants = build_search_variants("我想了解 nl-hermes的具体设计")
    assert "我想了解 nl-hermes的具体设计" in variants
    assert "nl-hermes" in variants
    assert "nl-hermes 架构" in variants
    assert "nl-hermes design" in variants


def test_merge_hits_dedupes_and_sorts_by_score():
    merged = merge_hits(
        [
            [
                {"type": "code", "title": "A", "snippet": "s1", "score": 0.2},
                {"type": "doc", "title": "B", "snippet": "s2", "score": 0.9},
            ],
            [
                {"type": "doc", "title": "B", "snippet": "s2 dup", "score": 0.1},
                {"type": "code", "title": "C", "snippet": "s3", "score": 0.5},
            ],
        ]
    )
    assert [h["title"] for h in merged] == ["B", "C", "A"]


def test_expand_query_with_llm_placeholder_returns_empty():
    model = PlaceholderChatModel(config=object())

    async def run():
        return await expand_query_with_llm("nl-hermes 设计", model)

    assert asyncio.run(run()) == []


class _FakeSearchClient:
    def __init__(self, responses: dict[str, list[dict]]):
        self.responses = responses
        self.queries: list[str] = []

    async def search(self, query: str, repo_ids=None):
        self.queries.append(query)
        return self.responses.get(query, [])


def test_retrieve_context_retries_with_keyword_variant():
    client = _FakeSearchClient(
        {
            "我想了解 nl-hermes的具体设计": [
                {
                    "type": "code",
                    "title": "代码检索结果",
                    "snippet": "未找到精确匹配，建议缩小问题范围后重试。",
                }
            ],
            "nl-hermes": [
                {
                    "type": "doc",
                    "title": "nl-hermes 架构说明",
                    "snippet": "nl-hermes 负责消息路由…",
                    "ref": "doc-42",
                    "score": 0.8,
                }
            ],
        }
    )

    async def run():
        return await retrieve_context(client, "我想了解 nl-hermes的具体设计")

    hits, log = asyncio.run(run())
    assert len(hits) == 1
    assert hits[0]["title"] == "nl-hermes 架构说明"
    assert "nl-hermes" in client.queries
    assert any(entry["strategy"] == "keyword" for entry in log)


def test_retrieve_context_uses_llm_expand_when_keywords_miss():
    class _ExpandModel:
        async def ainvoke(self, _prompt):
            class _Result:
                content = "nl-hermes gateway architecture\nnl-hermes 消息网关设计"

            return _Result()

    client = _FakeSearchClient(
        {
            "payment flow": [
                {
                    "type": "code",
                    "title": "代码检索结果",
                    "snippet": "未找到精确匹配",
                }
            ],
            "nl-hermes gateway architecture": [
                {
                    "type": "code",
                    "title": "Gateway",
                    "snippet": "gateway module",
                    "ref": "src/gateway.rs",
                    "score": 0.7,
                }
            ],
        }
    )

    async def run():
        return await retrieve_context(
            client,
            "payment flow",
            expand_model=_ExpandModel(),
            max_attempts=15,
        )

    hits, log = asyncio.run(run())
    assert len(hits) == 1
    assert any(entry["strategy"] == "llm_expand" for entry in log)


def test_retrieve_context_respects_max_attempts():
    class _AlwaysEmptyClient:
        def __init__(self) -> None:
            self.queries: list[str] = []

        async def search(self, query: str, repo_ids=None):
            self.queries.append(query)
            return [
                {
                    "type": "code",
                    "title": "代码检索结果",
                    "snippet": "未找到精确匹配",
                }
            ]

    client = _AlwaysEmptyClient()

    async def run():
        return await retrieve_context(
            client,
            "我想了解 nl-hermes的具体设计",
            max_attempts=3,
        )

    hits, log = asyncio.run(run())
    assert hits == []
    assert len(log) == 3
    assert len(client.queries) == 3
