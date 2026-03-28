"""
Tests for bank CSV parsers (Story 2.2).
One test per bank format covering can_parse() and parse().
"""
import pytest
from decimal import Decimal
from datetime import date

from parsers.base import ParsedTransaction
from parsers.registry import get_parser, PARSER_REGISTRY
from parsers.chase import ChaseParser
from parsers.amex import AmexParser
from parsers.bank_of_america import BankOfAmericaParser
from parsers.capital_one import CapitalOneParser
from parsers.wells_fargo import WellsFargoParser


# ── Fixture CSV strings ────────────────────────────────────────────────────

CHASE_CSV = """\
Transaction Date,Post Date,Description,Category,Type,Amount,Memo
01/15/2026,01/16/2026,NETFLIX.COM,Entertainment,Sale,-15.99,
01/20/2026,01/21/2026,WHOLE FOODS #0350,Groceries,Sale,-87.43,
01/22/2026,01/23/2026,REFUND AMAZON,Shopping,Return,24.00,
"""

AMEX_CSV = """\
Date,Description,Card Member,Account #,Amount
01/15/2026,AMAZON.COM*AB1C2D3E,JOHN DOE,-XXXXX4321,-89.99
01/18/2026,STARBUCKS #12345,JOHN DOE,-XXXXX4321,-6.75
01/20/2026,PAYMENT RECEIVED,JOHN DOE,-XXXXX4321,200.00
"""

BOFA_CSV = """\
Bank of America credit card account
Account #: XXXX-XXXX-XXXX-1234
Posted Date,Reference Number,Payee,Address,Amount
01/15/2026,324567890123,WHOLE FOODS #123,AUSTIN TX,-45.23
01/18/2026,324567890124,NETFLIX.COM,,-15.99
"""

CAPITAL_ONE_CSV = """\
Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-01-15,2026-01-16,1234,AMAZON.COM,Shopping,89.99,
2026-01-16,2026-01-17,1234,PAYMENT - THANK YOU,,,500.00
2026-01-20,2026-01-21,1234,STARBUCKS,Dining,6.75,
"""

WELLS_FARGO_CSV = """\
"01/15/2026","-45.23","*","*","WHOLEFDS #123 AUSTIN TX"
"01/18/2026","500.00","*","*","ONLINE PAYMENT - THANK YOU"
"01/20/2026","-6.75","*","*","STARBUCKS #12345 SAN FRANCISCO CA"
"""


# ── Registry ───────────────────────────────────────────────────────────────

def test_parser_registry_has_five_parsers():
    assert len(PARSER_REGISTRY) == 5


def test_parsed_transaction_dataclass():
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
    tx = ParsedTransaction(
        date=date(2026, 3, 15),
        merchant_raw="AMAZON",
        amount=Decimal("29.99"),
    )
    assert tx.description == ""


# ── Chase ──────────────────────────────────────────────────────────────────

def test_chase_can_parse():
    parser = ChaseParser()
    assert parser.can_parse(CHASE_CSV) is True
    assert parser.can_parse(AMEX_CSV) is False
    assert parser.can_parse(WELLS_FARGO_CSV) is False


def test_chase_parse():
    parser = ChaseParser()
    txns = parser.parse(CHASE_CSV)
    assert len(txns) == 3

    # Expense: -15.99 flipped → positive
    netflix = txns[0]
    assert netflix.date == date(2026, 1, 15)
    assert netflix.merchant_raw == "NETFLIX.COM"
    assert netflix.amount == Decimal("15.99")

    # Credit/refund: +24.00 flipped → negative
    refund = txns[2]
    assert refund.amount == Decimal("-24.00")


def test_chase_amount_exact_decimal():
    """dtype=str prevents float precision loss (Finding #6)."""
    csv = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n01/01/2026,01/02/2026,TEST,,Sale,-1234.56,\n"
    parser = ChaseParser()
    txns = parser.parse(csv)
    assert txns[0].amount == Decimal("1234.56")


# ── Amex ───────────────────────────────────────────────────────────────────

def test_amex_can_parse():
    parser = AmexParser()
    assert parser.can_parse(AMEX_CSV) is True
    assert parser.can_parse(CHASE_CSV) is False
    assert parser.can_parse(CAPITAL_ONE_CSV) is False


def test_amex_parse():
    parser = AmexParser()
    txns = parser.parse(AMEX_CSV)
    assert len(txns) == 3

    assert txns[0].date == date(2026, 1, 15)
    assert txns[0].merchant_raw == "AMAZON.COM*AB1C2D3E"
    assert txns[0].amount == Decimal("89.99")

    # Payment (positive in CSV) flipped → negative
    assert txns[2].amount == Decimal("-200.00")


# ── Bank of America ────────────────────────────────────────────────────────

def test_bofa_can_parse():
    parser = BankOfAmericaParser()
    assert parser.can_parse(BOFA_CSV) is True
    assert parser.can_parse(CHASE_CSV) is False


def test_bofa_parse_skips_metadata_rows():
    """Parser must skip the 2 metadata lines before the CSV header."""
    parser = BankOfAmericaParser()
    txns = parser.parse(BOFA_CSV)
    assert len(txns) == 2
    assert txns[0].date == date(2026, 1, 15)
    assert txns[0].merchant_raw == "WHOLE FOODS #123"
    assert txns[0].amount == Decimal("45.23")


# ── Capital One ────────────────────────────────────────────────────────────

def test_capital_one_can_parse():
    parser = CapitalOneParser()
    assert parser.can_parse(CAPITAL_ONE_CSV) is True
    assert parser.can_parse(CHASE_CSV) is False  # Chase lacks Debit/Credit cols


def test_capital_one_parse():
    parser = CapitalOneParser()
    txns = parser.parse(CAPITAL_ONE_CSV)
    # Payment row (credit only) should be negative; zero-amount rows skipped
    assert len(txns) == 3

    assert txns[0].date == date(2026, 1, 15)
    assert txns[0].merchant_raw == "AMAZON.COM"
    assert txns[0].amount == Decimal("89.99")

    # Payment credit: Debit=0, Credit=500 → amount = -500
    assert txns[1].amount == Decimal("-500.00")


def test_capital_one_detected_before_chase():
    """Capital One must be first in registry to avoid Chase false-positive."""
    parser = get_parser(CAPITAL_ONE_CSV)
    assert parser.bank_name == "Capital One"


# ── Wells Fargo ────────────────────────────────────────────────────────────

def test_wells_fargo_can_parse():
    parser = WellsFargoParser()
    assert parser.can_parse(WELLS_FARGO_CSV) is True
    assert parser.can_parse(CHASE_CSV) is False


def test_wells_fargo_parse():
    parser = WellsFargoParser()
    txns = parser.parse(WELLS_FARGO_CSV)
    assert len(txns) == 3

    assert txns[0].date == date(2026, 1, 15)
    assert txns[0].merchant_raw == "WHOLEFDS #123 AUSTIN TX"
    assert txns[0].amount == Decimal("45.23")

    # Credit: +500 flipped → -500
    assert txns[1].amount == Decimal("-500.00")


# ── Registry auto-detection ────────────────────────────────────────────────

def test_get_parser_chase():
    assert get_parser(CHASE_CSV).bank_name == "Chase"


def test_get_parser_amex():
    assert get_parser(AMEX_CSV).bank_name == "Amex"


def test_get_parser_bofa():
    assert get_parser(BOFA_CSV).bank_name == "Bank of America"


def test_get_parser_wells_fargo():
    assert get_parser(WELLS_FARGO_CSV).bank_name == "Wells Fargo"


def test_get_parser_unknown_raises():
    with pytest.raises(ValueError, match="Unsupported CSV format"):
        get_parser("col1,col2,col3\n1,2,3\n")


def test_bom_stripped_from_csv():
    """utf-8-sig BOM at start of file must not break header detection (Finding #9)."""
    bom_csv = "\ufeff" + CHASE_CSV
    parser = ChaseParser()
    # BOM is stripped by utf-8-sig decoding before parsing; can_parse should work
    # Here we test that parse() handles a BOM-prefixed string gracefully
    txns = parser.parse(bom_csv)
    assert len(txns) == 3
