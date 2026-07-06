"""Tests for role-aware knowledge document generation."""

from __future__ import annotations

from chains.doc_gen import (
    DOC_TYPE_PROFILES,
    analyze_code_context,
    build_analysis_prompt,
    build_doc_prompt,
    build_system_message,
    generate_doc_content,
    get_doc_profile,
)


def test_design_analysis_prompt_uses_architect_role() -> None:
    prompt = build_analysis_prompt(doc_type="design", repo_names=["demo"], context="README")
    assert "设计文档" in prompt
    assert "分层架构" in prompt


def test_training_analysis_prompt_differs_from_design() -> None:
    design = build_analysis_prompt(doc_type="design", repo_names=["demo"], context="ctx")
    training = build_analysis_prompt(doc_type="training", repo_names=["demo"], context="ctx")
    assert "环境搭建" in training or "快速" in training or "上手" in training
    assert design != training


def test_build_doc_prompt_sections_vary_by_type() -> None:
    design = build_doc_prompt(
        title="支付系统",
        doc_type="design",
        repo_names=["demo"],
        analysis="笔记",
        context="ctx",
    )
    training = build_doc_prompt(
        title="支付系统",
        doc_type="training",
        repo_names=["demo"],
        analysis="笔记",
        context="ctx",
    )
    ops = build_doc_prompt(
        title="支付系统",
        doc_type="ops",
        repo_names=["demo"],
        analysis="笔记",
        context="ctx",
    )

    assert "## 系统架构设计" in design
    assert "## 培训目标与学习路径" in training
    assert "## 发布与回滚流程" in ops
    assert "企业技术培训讲师" in build_system_message(get_doc_profile("training"))
    assert "资深 SRE" in build_system_message(get_doc_profile("ops"))


def test_generate_training_placeholder_has_training_sections() -> None:
    content = generate_doc_content(
        title="支付系统培训",
        doc_type="training",
        repo_names=["payment-service"],
        context="## 仓库：payment-service",
    )
    assert content.startswith("# 支付系统培训")
    assert "培训文档" in content
    assert "## 培训目标与学习路径" in content
    assert "## 常见问题与 FAQ" in content
    assert "## 系统架构设计" not in content


def test_generate_ops_placeholder_has_ops_sections() -> None:
    content = generate_doc_content(
        title="支付系统运维",
        doc_type="ops",
        repo_names=["payment-service"],
        context="docker-compose.yml",
    )
    assert "## 监控告警与日志" in content
    assert "## 故障排查与应急预案" in content


def test_analyze_code_context_placeholder_includes_role() -> None:
    analysis = analyze_code_context(
        doc_type="adr",
        repo_names=["demo"],
        context="sample code",
    )
    assert "架构师" in analysis or "ADR" in analysis or "架构决策" in analysis
    assert "sample code" in analysis


def test_all_doc_types_have_profiles() -> None:
    for doc_type in ("design", "adr", "ops", "training", "other"):
        profile = DOC_TYPE_PROFILES[doc_type]
        assert profile.role
        assert profile.background
        assert len(profile.sections) >= 4
