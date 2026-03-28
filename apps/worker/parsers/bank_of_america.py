"""
Bank of America CSV parser.

Expected headers (after skipping metadata rows):
    Posted Date, Reference Number, Payee, Address, Amount

BofA exports often include bank name / account info rows before the header.
We scan for the row starting with "Posted Date" to find the real header.

Amount sign convention: negative = expense, positive = credit.
We flip sign so expenses are positive (net expense model).

Sample (with metadata rows):
    Bank of America credit card account
    Account #: XXXX-XXXX-XXXX-1234
    Posted Date,Reference Number,Payee,Address,Amount
    01/15/2026,324567890123,WHOLE FOODS #123,AUSTIN TX,-45.23
"""
import io
from decimal import Decimal, InvalidOperation

import pandas as pd

from parsers.base import BaseStatementParser, ParsedTransaction


class BankOfAmericaParser(BaseStatementParser):
    """Parser for Bank of America CSV exports."""

    REQUIRED_HEADERS = {"Posted Date", "Payee", "Amount"}

    @property
    def bank_name(self) -> str:
        return "Bank of America"

    def can_parse(self, csv_content: str) -> bool:
        # BofA may have metadata rows — scan for the header line
        for line in csv_content.splitlines():
            if "Posted Date" in line and "Payee" in line and "Amount" in line:
                return True
        return False

    def _find_header_row(self, csv_content: str) -> int:
        """Return the 0-based line index of the real CSV header."""
        for i, line in enumerate(csv_content.splitlines()):
            if "Posted Date" in line and "Payee" in line:
                return i
        return 0

    def parse(self, csv_content: str) -> list[ParsedTransaction]:
        skip_rows = self._find_header_row(csv_content)
        df = pd.read_csv(io.StringIO(csv_content), skiprows=skip_rows, dtype=str)
        df.columns = df.columns.str.strip()

        transactions: list[ParsedTransaction] = []
        for _, row in df.iterrows():
            try:
                date = pd.to_datetime(str(row["Posted Date"]), format="%m/%d/%Y").date()
                merchant_raw = str(row["Payee"]).strip()
                amount_raw = str(row["Amount"]).replace(",", "").strip()
                # BofA: negative = expense. Flip sign so expenses are positive.
                amount = -Decimal(amount_raw)
                transactions.append(ParsedTransaction(
                    date=date,
                    merchant_raw=merchant_raw,
                    amount=amount,
                ))
            except (ValueError, InvalidOperation, KeyError):
                continue

        return transactions
