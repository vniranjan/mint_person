"""
BaseStatementParser ABC (Abstract Base Class).
Full implementation with bank-specific parsers → Story 2.2

Architecture:
- Modular plugin architecture: each bank has its own parser
- Registry auto-detects bank format from CSV headers
- All parsers return normalized Transaction objects
"""
import io
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional


@dataclass
class ParsedTransaction:
    """Normalized transaction extracted from a bank CSV."""
    date: date
    merchant_raw: str
    amount: Decimal  # Positive = debit/expense; negative = credit/refund
    description: str = ""


class BaseStatementParser(ABC):
    """
    Abstract base class for bank-specific CSV parsers.
    Each bank subclass implements parse() for its specific CSV format.

    Usage (Story 2.2):
        parser = registry.get_parser(csv_content)
        transactions = parser.parse(csv_content)
    """

    @abstractmethod
    def can_parse(self, csv_content: str) -> bool:
        """
        Return True if this parser can handle the given CSV content.
        Used by registry for format auto-detection.
        Typically checks for bank-specific column headers.
        """
        ...

    @abstractmethod
    def parse(self, csv_content: str) -> list[ParsedTransaction]:
        """
        Parse CSV content and return normalized transactions.

        Args:
            csv_content: Raw CSV string from Azure Blob Storage

        Returns:
            List of ParsedTransaction objects

        Raises:
            ValueError: If CSV format is invalid or required columns are missing
        """
        ...

    @property
    @abstractmethod
    def bank_name(self) -> str:
        """Human-readable bank name (e.g., 'Chase', 'Amex')."""
        ...
