"""
Parser registry — auto-detects bank format and dispatches to correct parser.

AR12: Modular CSV parser plugin architecture with BaseStatementParser ABC.
Supported banks: Chase, Amex, Bank of America, Capital One, Wells Fargo

Detection order matters: more specific parsers (Capital One) before more general ones.
"""
import logging
from typing import Optional

from parsers.base import BaseStatementParser
from parsers.chase import ChaseParser
from parsers.amex import AmexParser
from parsers.bank_of_america import BankOfAmericaParser
from parsers.capital_one import CapitalOneParser
from parsers.wells_fargo import WellsFargoParser

logger = logging.getLogger(__name__)

# Registry of available parsers — tried in order, first match wins.
# Capital One must come before Chase (both have "Transaction Date").
PARSER_REGISTRY: list[BaseStatementParser] = [
    CapitalOneParser(),   # Has Debit/Credit columns — distinguishes from Chase
    ChaseParser(),
    AmexParser(),
    BankOfAmericaParser(),
    WellsFargoParser(),   # No-header format — checked last as fallback
]


def get_parser(csv_content: str) -> Optional[BaseStatementParser]:
    """
    Auto-detect bank format and return the matching parser.

    Returns None if no parser can handle the format.
    In that case the job will be marked FAILED by the worker.
    """
    for parser in PARSER_REGISTRY:
        if parser.can_parse(csv_content):
            logger.info("Detected bank format: %s", parser.bank_name)
            return parser

    logger.warning("No parser found for CSV content — unknown bank format")
    return None
