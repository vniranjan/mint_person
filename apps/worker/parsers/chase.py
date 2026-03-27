"""
Chase bank CSV parser.

Expected headers (exact, order may vary):
    Transaction Date, Post Date, Description, Category, Type, Amount, Memo

Amount sign convention: negative = expense (debit), positive = credit/refund.
We store expenses as positive amounts and credits as negative (net expense model).

Sample:
    Transaction Date,Post Date,Description,Category,Type,Amount,Memo
    01/15/2026,01/16/2026,NETFLIX.COM,Entertainment,Sale,-15.99,
"""
import io
from decimal import Decimal, InvalidOperation

import pandas as pd

from parsers.base import BaseStatementParser, ParsedTransaction


class ChaseParser(BaseStatementParser):
    """Parser for Chase bank CSV exports."""

    REQUIRED_HEADERS = {"Transaction Date", "Description", "Amount"}

    @property
    def bank_name(self) -> str:
        return "Chase"

    def can_parse(self, csv_content: str) -> bool:
        try:
            df = pd.read_csv(io.StringIO(csv_content), nrows=0)
            return self.REQUIRED_HEADERS.issubset(set(df.columns))
        except Exception:
            return False

    def parse(self, csv_content: str) -> list[ParsedTransaction]:
        df = pd.read_csv(io.StringIO(csv_content))
        df.columns = df.columns.str.strip()

        transactions: list[ParsedTransaction] = []
        for _, row in df.iterrows():
            try:
                date = pd.to_datetime(str(row["Transaction Date"])).date()
                merchant_raw = str(row["Description"]).strip()
                amount_raw = str(row["Amount"]).replace(",", "")
                # Chase: negative = expense. We flip sign so expenses are positive.
                amount = -Decimal(amount_raw)
                transactions.append(ParsedTransaction(
                    date=date,
                    merchant_raw=merchant_raw,
                    amount=amount,
                    description=str(row.get("Memo", "")).strip(),
                ))
            except (ValueError, InvalidOperation, KeyError):
                continue  # Skip malformed rows

        return transactions
