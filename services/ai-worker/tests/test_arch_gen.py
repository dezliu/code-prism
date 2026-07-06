"""Tests for architecture diagram LLM generation."""

from __future__ import annotations

import json

from chains.arch_gen import (
    ARCH_GRAPH_SYSTEM_MESSAGE,
    build_arch_analysis_prompt,
    build_arch_graph_prompt,
    build_arch_repair_prompt,
    generate_arch_graph_json,
)


def test_build_arch_analysis_prompt_includes_repo() -> None:
    prompt = build_arch_analysis_prompt(
        repo_name="demo",
        repo_id="repo-1",
        url="https://example.com/demo.git",
        context="README",
    )
    assert "demo" in prompt
    assert "repo-1" in prompt


def test_build_arch_graph_prompt_requires_json() -> None:
    prompt = build_arch_graph_prompt(repo_name="demo", analysis="笔记", context="ctx")
    assert "JSON" in prompt
    assert "笔记" in prompt


def test_build_arch_repair_prompt_lists_errors() -> None:
    prompt = build_arch_repair_prompt(
        errors=["DANGLING_EDGE: e1 target=missing"],
        bad_json='{"nodes":[],"edges":[]}',
        analysis="分析",
    )
    assert "DANGLING_EDGE" in prompt


def test_arch_graph_system_message_defines_schema() -> None:
    assert "service|module|database" in ARCH_GRAPH_SYSTEM_MESSAGE


def test_placeholder_graph_is_valid_json() -> None:
    raw = generate_arch_graph_json(repo_name="Demo App", analysis="x", context="y")
    data = json.loads(raw)
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) >= 2
