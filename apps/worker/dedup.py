"""
Duplicate transaction detection (Story 2.4).

Duplicate key: same userId + same calendar day + same amount + same merchantRaw.
Duplicates are stored with is_duplicate=True (not dropped) for user transparency.
"""
from datetime import date as date_type, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func

from models import Transaction


def is_duplicate_transaction(
    db,
    user_id: str,
    txn_date: date_type,
    amount: Decimal,
    merchant_raw: str,
) -> bool:
    """
    Return True if an identical transaction already exists for this user.

    Duplicate = same userId + same calendar day + same amount + same merchantRaw
    (case-insensitive merchant comparison to catch cross-statement variations).

    Note: db.flush() must be called after each db.add() in the caller so that
    intra-batch duplicates (same row appearing twice in one CSV) are detected.
    """
    day_start = datetime.combine(txn_date, datetime.min.time())
    day_end = day_start + timedelta(days=1)
    existing = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.date >= day_start,
        Transaction.date < day_end,
        Transaction.amount == amount,
        func.lower(Transaction.merchant_raw) == func.lower(merchant_raw),
    ).first()
    return existing is not None
