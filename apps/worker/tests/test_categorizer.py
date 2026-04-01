"""
Tests for LiteLLM categorizer — Story 3.1 full implementation.

Covers:
- rule_based_categorize: keyword matching for all 8 categories
- _fallback_batch: keyword match (confidence=0.60) and no-match (confidence=0.0)
- categorize_transactions: LLM happy path, low-confidence flagging,
  LiteLLMError fallback, JSON parse error fallback, correction log injection
"""
import json
from unittest.mock import MagicMock, patch

import pytest

from categorizer import (
    CATEGORY_TAXONOMY,
    _fallback_batch,
    categorize_transactions,
    rule_based_categorize,
)


# ── CATEGORY_TAXONOMY ─────────────────────────────────────────────────────

def test_category_taxonomy_has_8_categories():
    expected = {
        "Groceries", "Dining", "Transport", "Shopping",
        "Subscriptions", "Healthcare", "Entertainment", "Utilities",
    }
    assert set(CATEGORY_TAXONOMY) == expected


# ── rule_based_categorize ─────────────────────────────────────────────────

def test_rule_based_groceries():
    assert rule_based_categorize("WHOLE FOODS MARKET") == "Groceries"


def test_rule_based_dining():
    assert rule_based_categorize("STARBUCKS #1234") == "Dining"


def test_rule_based_transport():
    assert rule_based_categorize("UBER TRIP") == "Transport"


def test_rule_based_subscriptions():
    assert rule_based_categorize("NETFLIX.COM") == "Subscriptions"


def test_rule_based_utilities():
    assert rule_based_categorize("AT&T BILL PAYMENT") == "Utilities"


def test_rule_based_no_match():
    assert rule_based_categorize("MYSTERY STORE XYZ 9999") is None


def test_rule_based_case_insensitive():
    assert rule_based_categorize("mcdonald's") == "Dining"
    assert rule_based_categorize("MCDONALD'S") == "Dining"


def test_rule_based_uber_eats_before_uber():
    """'uber eats' is Dining; plain 'uber' is Transport — longest-first ordering."""
    assert rule_based_categorize("UBER EATS ORDER") == "Dining"
    assert rule_based_categorize("UBER TRIP") == "Transport"


# ── _fallback_batch ───────────────────────────────────────────────────────

def test_fallback_batch_keyword_match():
    batch = [{"id": "t1", "merchant_raw": "STARBUCKS #1234", "amount": "5.75"}]
    results = _fallback_batch(batch)
    assert results[0]["category"] == "Dining"
    assert results[0]["confidence"] == 0.60


def test_fallback_batch_no_match():
    batch = [{"id": "t2", "merchant_raw": "UNKNOWN SHOP", "amount": "12.00"}]
    results = _fallback_batch(batch)
    assert results[0]["category"] == "Uncategorized"
    assert results[0]["confidence"] == 0.0


def test_fallback_batch_preserves_ids():
    batch = [
        {"id": "id-1", "merchant_raw": "NETFLIX", "amount": "15.99"},
        {"id": "id-2", "merchant_raw": "MYSTERY SHOP", "amount": "9.99"},
    ]
    results = _fallback_batch(batch)
    assert results[0]["id"] == "id-1"
    assert results[1]["id"] == "id-2"


# ── categorize_transactions (async) ───────────────────────────────────────

def _make_mock_response(data: list[dict]) -> MagicMock:
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps(data)
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    return mock_response


@pytest.mark.asyncio
async def test_categorize_empty_returns_empty():
    result = await categorize_transactions([], user_correction_log=[])
    assert result == []


@pytest.mark.asyncio
async def test_categorize_llm_happy_path():
    transactions = [
        {"id": "t1", "merchant_raw": "WHOLE FOODS", "amount": "45.00"},
        {"id": "t2", "merchant_raw": "NETFLIX", "amount": "15.99"},
    ]
    mock_resp = _make_mock_response([
        {"id": "t1", "category": "Groceries", "confidence": 0.95},
        {"id": "t2", "category": "Subscriptions", "confidence": 0.92},
    ])
    with patch("categorizer.completion", return_value=mock_resp):
        results = await categorize_transactions(transactions, user_correction_log=[])

    assert len(results) == 2
    t1 = next(r for r in results if r["id"] == "t1")
    assert t1["category"] == "Groceries"
    assert t1["confidence"] == 0.95
    assert t1["is_flagged"] is False


@pytest.mark.asyncio
async def test_categorize_low_confidence_flagged():
    """confidence < 0.70 → is_flagged=True."""
    transactions = [{"id": "t1", "merchant_raw": "MYSTERY STORE", "amount": "9.99"}]
    mock_resp = _make_mock_response([{"id": "t1", "category": "Shopping", "confidence": 0.45}])
    with patch("categorizer.completion", return_value=mock_resp):
        results = await categorize_transactions(transactions, user_correction_log=[])

    assert results[0]["is_flagged"] is True
    assert results[0]["confidence"] == 0.45


@pytest.mark.asyncio
async def test_categorize_exactly_at_threshold_not_flagged():
    """confidence == 0.70 → is_flagged=False (threshold is exclusive)."""
    transactions = [{"id": "t1", "merchant_raw": "TARGET", "amount": "50.00"}]
    mock_resp = _make_mock_response([{"id": "t1", "category": "Shopping", "confidence": 0.70}])
    with patch("categorizer.completion", return_value=mock_resp):
        results = await categorize_transactions(transactions, user_correction_log=[])

    assert results[0]["is_flagged"] is False


@pytest.mark.asyncio
async def test_categorize_litellm_error_triggers_fallback():
    """LiteLLMError → rule-based fallback; job must not raise."""
    from litellm.exceptions import APIConnectionError

    transactions = [
        {"id": "t1", "merchant_raw": "WHOLE FOODS", "amount": "45.00"},
        {"id": "t2", "merchant_raw": "UNKNOWN SHOP", "amount": "9.99"},
    ]
    with patch("categorizer.completion", side_effect=APIConnectionError(
        message="Connection refused",
        llm_provider="anthropic",
        model="claude-haiku-4-5-20251001",
    )):
        results = await categorize_transactions(transactions, user_correction_log=[])

    assert len(results) == 2
    t1 = next(r for r in results if r["id"] == "t1")
    assert t1["category"] == "Groceries"
    assert t1["confidence"] == 0.60

    t2 = next(r for r in results if r["id"] == "t2")
    assert t2["category"] == "Uncategorized"
    assert t2["confidence"] == 0.0
    assert t2["is_flagged"] is True


@pytest.mark.asyncio
async def test_categorize_json_parse_error_triggers_fallback():
    """Malformed LLM JSON → fallback without crashing."""
    transactions = [{"id": "t1", "merchant_raw": "STARBUCKS", "amount": "6.75"}]
    mock_choice = MagicMock()
    mock_choice.message.content = "This is not valid JSON!"
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    with patch("categorizer.completion", return_value=mock_response):
        results = await categorize_transactions(transactions, user_correction_log=[])

    assert results[0]["category"] == "Dining"
    assert results[0]["confidence"] == 0.60


@pytest.mark.asyncio
async def test_categorize_correction_log_injected_into_system_prompt():
    """Correction log examples appear in the rendered system prompt for unmatched transactions."""
    # Use a transaction that does NOT match the correction log entry so it goes to LLM
    transactions = [{"id": "t1", "merchant_raw": "TARGET STORE", "amount": "45.00"}]
    correction_log = [{"merchant_raw": "Blue Bottle Coffee", "corrected_category": "Dining"}]
    mock_resp = _make_mock_response([{"id": "t1", "category": "Shopping", "confidence": 0.85}])

    captured_system: list[str] = []

    def capture_call(**kwargs):
        captured_system.append(kwargs["messages"][0]["content"])
        return mock_resp

    with patch("categorizer.completion", side_effect=capture_call):
        await categorize_transactions(transactions, user_correction_log=correction_log)

    assert captured_system, "LLM was not called"
    assert "Blue Bottle Coffee" in captured_system[0]
    assert "Dining" in captured_system[0]
