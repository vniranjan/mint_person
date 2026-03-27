"""
Tests for parser base classes and registry.
Concrete parser tests → Story 2.2
"""
import pytest
from decimal import Decimal
from datetime import date

from parsers.base import BaseStatementParser, ParsedTransaction
from parsers.registry import get_parser, PARSER_REGISTRY


def test_parser_registry_is_empty_in_story_1_1():
    """
    Story 1.1: Parser registry has no parsers yet (stubs only).
    Story 2.2 will register: Chase, Amex, BoA, Capital One, Wells Fargo.
    """
    assert PARSER_REGISTRY == []


def test_get_parser_returns_none_when_no_parsers():
    """Registry returns None when no parsers are registered (Story 1.1 state)."""
    result = get_parser("Date,Description,Amount\n2026-03-01,Test,42.50")
    assert result is None


def test_parsed_transaction_dataclass():
    """ParsedTransaction dataclass works correctly."""
    tx = ParsedTransaction(
        date=date(2026, 3, 15),
        merchant_raw="STARBUCKS #1234",
        amount=Decimal("5.75"),
        description="Coffee",
    )
    assert tx.date == date(2026, 3, 15)
    assert tx.merchant_raw == "STARBUCKS #1234"
    assert tx.amount == Decimal("5.75")
    assert tx.description == "Coffee"


def test_parsed_transaction_default_description():
    """ParsedTransaction description defaults to empty string."""
    tx = ParsedTransaction(
        date=date(2026, 3, 15),
        merchant_raw="AMAZON",
        amount=Decimal("29.99"),
    )
    assert tx.description == ""
