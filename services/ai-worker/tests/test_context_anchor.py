from chains.context_anchor import ContextAnchor, resolve_query


def test_resolve_query_replaces_pronoun_with_anchor():
    anchor = ContextAnchor(entity_type="service", entity_id="pay", entity_name="支付服务")
    resolved, kept = resolve_query("那它的下游依赖有哪些？", anchor)
    assert "支付服务" in resolved
    assert kept == anchor


def test_resolve_query_switches_topic():
    anchor = ContextAnchor(entity_type="service", entity_id="pay", entity_name="支付服务")
    resolved, new_anchor = resolve_query("换个问题，订单服务呢？", anchor)
    assert resolved.startswith("换个问题")
    assert new_anchor is not None
    assert "订单服务" in new_anchor.entity_name


def test_classify_intent_in_qa_router():
    from chains.intent_rules import classify_intent

    intents = classify_intent("支付服务的架构依赖是什么？")
    assert "architecture" in intents
