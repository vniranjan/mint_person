"""
American Express CSV parser.

Expected headers (exact, order may vary):
    Date, Description, Card Member, Account #, Amount

Amount sign convention: negative = expense, positive = refund.
We flip sign so expenses are positive (net expense model).

Sample:
    Date,Description,Card Member,Account #,Amount
    01/15/2026,AMAZON.COM*AB1C2D3E,JOHN DOE,-XXXXX4321,-89.99
"""
import io
from decimal import Decimal, InvalidOperation

import pandas as pd

from parsers.base import BaseStatementParser, ParsedTransaction


class AmexParser(BaseStatementParser):
    """Parser for American Express CSV exports."""

    REQUIRED_HEADERS = {"Date", "Description", "Amount"}

    @property
    def bank_name(self) -> str:
        return "Amex"

    def can_parse(self, csv_content: str) -> bool:
        try:
            df = pd.read_csv(io.StringIO(csv_content), nrows=0, dtype=str)
            headers = set(df.columns)
            # Must have Amex-specific fields; distinguish from other banks
            return (
                self.REQUIRED_HEADERS.issubset(headers)
                and "Card Member" in headers
                and "Transaction Date" not in headers  # Exclude Chase
            )
        except Exception:
            return False

    def parse(self, csv_content: str) -> list[ParsedTransaction]:
        df = pd.read_csv(io.StringIO(csv_content), dtype=str)
        df.columns = df.columns.str.strip()

        transactions: list[ParsedTransaction] = []
        for _, row in df.iterrows():
            try:
                date = pd.to_datetime(str(row["Date"]), format="%m/%d/%Y").date()
                merchant_raw = str(row["Description"]).strip()
                amount_raw = str(row["Amount"]).replace(",", "").strip()
                # Amex: negative = expense. Flip sign so expenses are positive.
                amount = -Decimal(amount_raw)
                transactions.append(ParsedTransaction(
                    date=date,
                    merchant_raw=merchant_raw,
                    amount=amount,
                ))
            except (ValueError, InvalidOperation, KeyError):
                continue

        return transactions
