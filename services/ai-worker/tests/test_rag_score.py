from workflow.nodes.rag import (
    _compute_rag_score,
    _keyword_overlap_count,
    _passes_rag_quality_gate,
)
from workflow.state import QaWorkflowState


def test_compute_rag_score_uses_top_hits_not_tail_average():
    hits = [
        {"type": "doc", "title": "A", "snippet": "s", "score": 0.9},
        {"type": "doc", "title": "B", "snippet": "s", "score": 0.8},
        {"type": "doc", "title": "C", "snippet": "s", "score": 0.05},
        {"type": "doc", "title": "D", "snippet": "s", "score": 0.04},
    ]
    score = _compute_rag_score(hits, [], "general")
    assert score >= 0.8


def test_compute_rag_score_doc_intent_boost():
    hits = [{"type": "doc", "title": "设计文档", "snippet": "s", "score": 0.5}]
    general = _compute_rag_score(hits, [], "general")
    doc = _compute_rag_score(hits, [], "doc")
    assert doc > general


def test_passes_rag_quality_gate_with_keyword_overlap():
    state = QaWorkflowState(
        message="git知识库设计是什么样的？",
        resolved_message="git知识库设计是什么样的？",
        rag_score=0.02,
        rag_hits=[
            {
                "type": "doc",
                "title": "git知识库设计",
                "snippet": "git知识库基于版本控制…",
                "score": 0.02,
            }
        ],
    )
    assert _passes_rag_quality_gate(state)


def test_passes_rag_quality_gate_with_multiple_hits():
    state = QaWorkflowState(
        message="payment flow",
        rag_score=0.2,
        rag_hits=[
            {"type": "doc", "title": "A", "snippet": "s", "score": 0.2},
            {"type": "doc", "title": "B", "snippet": "s", "score": 0.18},
        ],
    )
    assert _passes_rag_quality_gate(state)


def test_keyword_overlap_count_mixed_entity():
    hit = {"title": "git知识库设计", "snippet": "git 知识库架构说明"}
    count = _keyword_overlap_count("git知识库设计是什么样的？", hit)
    assert count >= 2
