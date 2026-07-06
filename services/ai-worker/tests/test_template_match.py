"""Template matching tests."""

from chains.template_match import match_templates


def test_match_templates_returns_arch_hint_for_architecture_question() -> None:
    hints = match_templates("请说明整体架构和模块依赖")
    assert len(hints) >= 1
    assert hints[0]["templateId"] == "arch-overview"
