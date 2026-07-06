"""Template matching tests."""

from chains.template_match import match_templates


def test_match_templates_returns_arch_hint_for_architecture_question() -> None:
    hints = match_templates("请说明整体架构和模块依赖")
    assert len(hints) >= 1
    assert hints[0]["templateId"] == "arch-overview"


def test_match_templates_uses_db_templates_when_provided() -> None:
    hints = match_templates(
        "请说明支付服务架构",
        templates=[
            {
                "templateId": "custom-1",
                "name": "自定义架构",
                "preview": "自定义预览",
                "keywords": ["支付", "架构"],
                "priority": 10,
            }
        ],
    )
    assert len(hints) == 1
    assert hints[0]["templateId"] == "custom-1"
    assert hints[0]["name"] == "自定义架构"
