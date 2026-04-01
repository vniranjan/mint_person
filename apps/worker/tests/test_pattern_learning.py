"""
Tests for cross-upload correction memory and within-upload pattern learning (Story 3.4).
Covers: correction log pre-matching, within-upload prefix application,
non-matching transactions unaffected, empty correction log.
"""
import json
from unittest.mock import MagicMock, patch

import pytest

from categorizer import _apply_correction_log


# ── _apply_correction_log ─────────────────────────────────────────────────

def test_correction_log_exact_match_gets_high_confidence():
    """Exact merchant_norm match → confidence=0.95, is_flagged=False."""
    transactions = [{"id": "t1", "merchant_raw": "STARBUCKS #1234", "amount": "5.75"}]
    correction_log = [{"merchant_raw": "Starbucks", "corrected_category": "Dining"}]

    matched, unmatched = _apply_correction_log(transactions, correction_log)

    assert len(matched) == 1
    assert matched[0]["id"] == "t1"
    assert matched[0]["category"] == "Dining"
    assert matched[0]["confidence"] == 0.95
    # is_flagged is set by the threshold check in categorize_transactions, not here
    assert "is_flagged" not in matched[0]
    assert len(unmatched) == 0


def test_correction_log_no_match_goes_to_llm():
    """Non-matching merchant → sent to LLM (unmatched)."""
    transactions = [{"id": "t2", "merchant_raw": "UNKNOWN SHOP", "amount": "12.00"}]
    correction_log = [{"merchant_raw": "Starbucks", "corrected_category": "Dining"}]

    matched, unmatched = _apply_correction_log(transactions, correction_log)

    assert len(matched) == 0
    assert len(unmatched) == 1
    assert unmatched[0]["id"] == "t2"


def test_empty_correction_log_all_go_to_llm():
    """Empty correction log → all transactions sent to LLM."""
    transactions = [
        {"id": "t1", "merchant_raw": "WHOLE FOODS", "amount": "45.00"},
        {"id": "t2", "merchant_raw": "NETFLIX", "amount": "15.99"},
    ]
    matched, unmatched = _apply_correction_log(transactions, [])

    assert len(matched) == 0
    assert len(unmatched) == 2


def test_correction_log_case_insensitive_match():
    """Normalization makes matching case-insensitive."""
    transactions = [{"id": "t1", "merchant_raw": "whole foods market", "amount": "45.00"}]
    correction_log = [{"merchant_raw": "WHOLE FOODS MARKET", "corrected_category": "Groceries"}]

    matched, unmatched = _apply_correction_log(transactions, correction_log)

    assert len(matched) == 1
    assert matched[0]["category"] == "Groceries"


def test_correction_log_partial_match():
    """Correction log uses normalized merchant — suffix variants still match."""
    transactions = [{"id": "t1", "merchant_raw": "NETFLIX.COM", "amount": "15.99"}]
    correction_log = [{"merchant_raw": "NETFLIX.COM", "corrected_category": "Subscriptions"}]

    matched, unmatched = _apply_correction_log(transactions, correction_log)

    assert len(matched) == 1
    assert matched[0]["category"] == "Subscriptions"


def test_correction_log_multiple_entries():
    """Multiple correction log entries each match correctly."""
    transactions = [
        {"id": "t1", "merchant_raw": "STARBUCKS #101", "amount": "5.75"},
        {"id": "t2", "merchant_raw": "NETFLIX.COM", "amount": "15.99"},
        {"id": "t3", "merchant_raw": "MYSTERY SHOP", "amount": "9.99"},
    ]
    correction_log = [
        {"merchant_raw": "Starbucks", "corrected_category": "Dining"},
        {"merchant_raw": "Netflix.Com", "corrected_category": "Subscriptions"},
    ]

    matched, unmatched = _apply_correction_log(transactions, correction_log)

    assert len(matched) == 2
    matched_ids = {m["id"] for m in matched}
    assert "t1" in matched_ids
    assert "t2" in matched_ids
    assert len(unmatched) == 1
    assert unmatched[0]["id"] == "t3"


# ── categorize_transactions with correction log ───────────────────────────

@pytest.mark.asyncio
async def test_categorize_uses_correction_log_before_llm():
    """Correction log match bypasses LLM — LLM should not be called for matched txn."""
    from categorizer import categorize_transactions

    transactions = [{"id": "t1", "merchant_raw": "STARBUCKS #1234", "amount": "5.75"}]
    correction_log = [{"merchant_raw": "Starbucks", "corrected_category": "Dining"}]

    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock()]
    mock_resp.choices[0].message.content = json.dumps([])  # LLM would return empty for 0 txns

    llm_called_with = []

    def capture(**kwargs):
        llm_called_with.append(kwargs.get("messages", []))
        return mock_resp

    with patch("categorizer.completion", side_effect=capture):
        results = await categorize_transactions(transactions, correction_log)

    assert len(results) == 1
    assert results[0]["category"] == "Dining"
    assert results[0]["confidence"] == 0.95
    # LLM should not have been called (0 unmatched txns)
    assert len(llm_called_with) == 0


@pytest.mark.asyncio
async def test_correction_log_injected_as_few_shot_examples():
    """Correction examples appear in the system prompt for unmatched transactions."""
    from categorizer import categorize_transactions

    transactions = [
        {"id": "t1", "merchant_raw": "STARBUCKS", "amount": "5.75"},   # matched by correction log
        {"id": "t2", "merchant_raw": "TARGET STORE", "amount": "50.00"},  # sent to LLM
    ]
    correction_log = [{"merchant_raw": "Starbucks", "corrected_category": "Dining"}]

    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock()]
    mock_resp.choices[0].message.content = json.dumps([
        {"id": "t2", "category": "Shopping", "confidence": 0.88},
    ])

    captured_system: list[str] = []

    def capture(**kwargs):
        captured_system.append(kwargs["messages"][0]["content"])
        return mock_resp

    with patch("categorizer.completion", side_effect=capture):
        results = await categorize_transactions(transactions, correction_log)

    # t1 → correction log match
    t1 = next(r for r in results if r["id"] == "t1")
    assert t1["category"] == "Dining"

    # t2 → LLM was called with correction examples in system prompt
    assert len(captured_system) == 1
    assert "Starbucks" in captured_system[0]
    assert "Dining" in captured_system[0]
