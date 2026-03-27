"""
Wells Fargo CSV parser.

Wells Fargo exports have no header row. Columns (by position):
    0: Date (MM/DD/YYYY)
    1: Amount (negative = expense)
    2: * (asterisk placeholder — ignore)
    3: * (asterisk placeholder — ignore)
    4: Description

Amount sign convention: negative = expense, positive = credit.
We flip sign so expenses are positive (net expense model).

Sample (no header):
    "01/15/2026","-45.23","*","*","WHOLEFDS #123 AUSTIN TX"
    "01/16/2026","500.00","*","*","ONLINE PAYMENT - THANK YOU"
"""
import io
from decimal import Decimal, InvalidOperation

import pandas as pd

from parsers.base import BaseStatementParser, ParsedTransaction


class WellsFargoParser(BaseStatementParser):
    """Parser for Wells Fargo CSV exports (no header row, positional columns)."""

    @property
    def bank_name(self) -> str:
        return "Wells Fargo"

    def can_parse(self, csv_content: str) -> bool:
        """
        Wells Fargo CSVs have no header. Detect by:
        - 5 columns
        - Columns 2 and 3 are asterisks ("*")
        - Column 0 looks like a date
        - Column 1 looks like a number
        """
        try:
            df = pd.read_csv(io.StringIO(csv_content), header=None, nrows=3)
            if df.shape[1] < 5:
                return False
            # Check asterisk columns
            if not all(str(v).strip() in ("*", "") for v in df.iloc[:, 2]):
                return False
            # Check date column
            pd.to_datetime(str(df.iloc[0, 0]))
            # Check amount column
            float(str(df.iloc[0, 1]).replace(",", ""))
            return True
        except Exception:
            return False

    def parse(self, csv_content: str) -> list[ParsedTransaction]:
        df = pd.read_csv(io.StringIO(csv_content), header=None)

        transactions: list[ParsedTransaction] = []
        for _, row in df.iterrows():
            try:
                date = pd.to_datetime(str(row.iloc[0])).date()
                amount_raw = str(row.iloc[1]).replace(",", "")
                merchant_raw = str(row.iloc[4]).strip()

                # Wells Fargo: negative = expense. Flip sign.
                amount = -Decimal(amount_raw)

                transactions.append(ParsedTransaction(
                    date=date,
                    merchant_raw=merchant_raw,
                    amount=amount,
                ))
            except (ValueError, InvalidOperation, IndexError):
                continue

        return transactions
