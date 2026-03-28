"""
Capital One CSV parser.

Expected headers (exact, order may vary):
    Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit

Debit = expense amount (positive), Credit = refund/payment (positive).
Net amount = Debit - Credit. Expenses are positive; credits are negative.

Sample:
    Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
    2026-01-15,2026-01-16,1234,AMAZON.COM,Shopping,89.99,
    2026-01-16,2026-01-17,1234,PAYMENT - THANK YOU,,, 500.00
"""
import io
from decimal import Decimal, InvalidOperation

import pandas as pd

from parsers.base import BaseStatementParser, ParsedTransaction


class CapitalOneParser(BaseStatementParser):
    """Parser for Capital One CSV exports."""

    REQUIRED_HEADERS = {"Transaction Date", "Description", "Debit", "Credit"}

    @property
    def bank_name(self) -> str:
        return "Capital One"

    def can_parse(self, csv_content: str) -> bool:
        try:
            df = pd.read_csv(io.StringIO(csv_content), nrows=0, dtype=str)
            return self.REQUIRED_HEADERS.issubset(set(df.columns))
        except Exception:
            return False

    def parse(self, csv_content: str) -> list[ParsedTransaction]:
        df = pd.read_csv(io.StringIO(csv_content), dtype=str)
        df.columns = df.columns.str.strip()

        transactions: list[ParsedTransaction] = []
        for _, row in df.iterrows():
            try:
                date = pd.to_datetime(str(row["Transaction Date"]), format="%Y-%m-%d").date()
                merchant_raw = str(row["Description"]).strip()

                debit_raw = str(row.get("Debit", "")).strip()
                credit_raw = str(row.get("Credit", "")).strip()

                debit = Decimal(debit_raw.replace(",", "")) if debit_raw and debit_raw not in ("nan", "") else Decimal("0")
                credit = Decimal(credit_raw.replace(",", "")) if credit_raw and credit_raw not in ("nan", "") else Decimal("0")

                # Net expense: positive = expense, negative = credit/refund
                amount = debit - credit
                if amount == Decimal("0"):
                    continue  # Skip zero-amount rows

                transactions.append(ParsedTransaction(
                    date=date,
                    merchant_raw=merchant_raw,
                    amount=amount,
                ))
            except (ValueError, InvalidOperation, KeyError):
                continue

        return transactions
