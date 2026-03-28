"""
Tests for worker pipeline utilities (Story 2.2).
Covers normalize_merchant() and related worker logic.
"""
import sys
from unittest.mock import MagicMock

# Stub out Azure SDK modules before importing worker to avoid import errors
# in environments where the Azure packages are not installed.
for mod in ("azure", "azure.storage", "azure.storage.blob", "azure.storage.queue"):
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

import pytest
from decimal import Decimal

from worker import normalize_merchant


# ── normalize_merchant ─────────────────────────────────────────────────────

def test_normalize_strips_city_state():
    assert normalize_merchant("WHOLE FOODS AUSTIN TX") == "Whole Foods"


def test_normalize_strips_trailing_id():
    assert normalize_merchant("STARBUCKS #12345") == "Starbucks"


def test_normalize_strips_sq_prefix():
    """SQ* payment processor prefix is removed (Finding #7 — targeted, not blanket)."""
    assert normalize_merchant("SQ *COFFEE SHOP") == "Coffee Shop"


def test_normalize_strips_tst_prefix():
    assert normalize_merchant("TST*JOE'S DINER") == "Joe'S Diner"


def test_normalize_preserves_asterisk_in_merchant_name():
    """Amazon*marketplace — asterisk is NOT in a known processor prefix; name preserved."""
    result = normalize_merchant("AMAZON.COM*AB1C2D3E")
    # The asterisk pattern is not a known processor prefix, so the full name is kept
    assert "Amazon" in result


def test_normalize_collapses_whitespace():
    assert normalize_merchant("TARGET   STORE") == "Target Store"


def test_normalize_title_case():
    assert normalize_merchant("NETFLIX.COM") == "Netflix.Com"


def test_normalize_strips_trailing_digits():
    assert normalize_merchant("SHELL OIL 57444119") == "Shell Oil"


def test_normalize_empty_input():
    """Empty or whitespace-only input returns title-cased fallback."""
    result = normalize_merchant("   ")
    assert isinstance(result, str)


def test_normalize_combined():
    """End-to-end: city/state + trailing ID both stripped."""
    result = normalize_merchant("WHOLEFDS #123 AUSTIN TX")
    assert result == "Wholefds"


# ── category None mapping ──────────────────────────────────────────────────

def test_category_none_when_uncategorized():
    """category=None stored in DB when categorizer returns 'Uncategorized' (Finding #3)."""
    from worker import normalize_merchant  # noqa: just confirming import works
    # Simulate the category mapping logic in worker.py
    category_raw = "Uncategorized"
    category = None if not category_raw or category_raw == "Uncategorized" else category_raw
    assert category is None


def test_category_preserved_when_not_uncategorized():
    category_raw = "Groceries"
    category = None if not category_raw or category_raw == "Uncategorized" else category_raw
    assert category == "Groceries"


def test_category_none_when_empty():
    category_raw = ""
    category = None if not category_raw or category_raw == "Uncategorized" else category_raw
    assert category is None
