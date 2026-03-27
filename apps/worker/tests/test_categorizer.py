"""
Tests for the categorizer module.
LLM integration tests → Story 3.1 (will test actual LiteLLM calls)
"""
import pytest

from categorizer import CATEGORY_TAXONOMY, rule_based_categorize


def test_category_taxonomy_has_8_categories():
    """FR19: System provides exactly 8 default categories."""
    expected = {
        "Groceries", "Dining", "Transport", "Shopping",
        "Subscriptions", "Healthcare", "Entertainment", "Utilities"
    }
    assert set(CATEGORY_TAXONOMY) == expected


def test_rule_based_categorize_starbucks():
    """Rule-based fallback identifies Starbucks as Dining."""
    result = rule_based_categorize("STARBUCKS #1234")
    assert result == "Dining"


def test_rule_based_categorize_netflix():
    """Rule-based fallback identifies Netflix as Subscriptions."""
    result = rule_based_categorize("NETFLIX.COM")
    assert result == "Subscriptions"


def test_rule_based_categorize_uber():
    """Rule-based fallback identifies Uber as Transport."""
    result = rule_based_categorize("UBER TRIP")
    assert result == "Transport"


def test_rule_based_categorize_unknown_returns_none():
    """Rule-based fallback returns None for unknown merchants."""
    result = rule_based_categorize("MYSTERY STORE XYZ 9999")
    assert result is None


def test_rule_based_categorize_case_insensitive():
    """Rule-based matching is case-insensitive."""
    assert rule_based_categorize("McDonald's") == "Dining"
    assert rule_based_categorize("MCDONALD'S") == "Dining"


@pytest.mark.asyncio
async def test_categorize_transactions_stub_returns_uncategorized():
    """
    Story 1.1: categorize_transactions stub returns all as Uncategorized + flagged.
    Story 3.1: Will test actual LLM categorization.
    """
    from categorizer import categorize_transactions

    transactions = [
        {"id": "tx-1", "merchant_raw": "STARBUCKS", "amount": "5.75"},
        {"id": "tx-2", "merchant_raw": "AMAZON", "amount": "29.99"},
    ]
    result = await categorize_transactions(transactions, [])

    assert len(result) == 2
    for item in result:
        assert item["category"] == "Uncategorized"
        assert item["confidence"] == 0.0
        assert item["is_flagged"] is True
