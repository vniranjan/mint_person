"""
Unit tests for SQLAlchemy models (models.py).

Verifies table names, column names, and key structural properties
without requiring a live PostgreSQL connection — uses model metadata only.
"""
import uuid

import pytest
from sqlalchemy import inspect as sa_inspect

from models import (
    Base,
    CorrectionLog,
    JobStatus,
    Statement,
    Transaction,
    User,
)


class TestTableNames:
    """Ensure @@map directives match across Prisma schema and SQLAlchemy."""

    def test_user_table_name(self) -> None:
        assert User.__tablename__ == "users"

    def test_statement_table_name(self) -> None:
        assert Statement.__tablename__ == "statements"

    def test_transaction_table_name(self) -> None:
        assert Transaction.__tablename__ == "transactions"

    def test_correction_log_table_name(self) -> None:
        assert CorrectionLog.__tablename__ == "correction_logs"

    def test_job_status_table_name(self) -> None:
        assert JobStatus.__tablename__ == "job_status"


class TestUserModel:
    def test_has_uuid_primary_key(self) -> None:
        col = User.__table__.c["id"]
        assert col.primary_key

    def test_email_is_unique(self) -> None:
        col = User.__table__.c["email"]
        assert col.unique

    def test_password_hash_column_name(self) -> None:
        # Must match the Prisma field name mapping for the DB column
        col_names = [c.name for c in User.__table__.c]
        assert "passwordHash" in col_names

    def test_role_column_exists(self) -> None:
        col_names = [c.name for c in User.__table__.c]
        assert "role" in col_names

    def test_is_active_column_name(self) -> None:
        col_names = [c.name for c in User.__table__.c]
        assert "isActive" in col_names


class TestTransactionModel:
    def test_amount_is_numeric(self) -> None:
        from sqlalchemy import Numeric
        col = Transaction.__table__.c["amount"]
        assert isinstance(col.type, Numeric)

    def test_category_is_nullable(self) -> None:
        col = Transaction.__table__.c["category"]
        assert col.nullable, "category must be nullable — set after LLM runs"

    def test_confidence_is_nullable(self) -> None:
        col = Transaction.__table__.c["confidence"]
        assert col.nullable, "confidence must be nullable — set after LLM runs"

    def test_merchant_raw_column_name(self) -> None:
        col_names = [c.name for c in Transaction.__table__.c]
        assert "merchantRaw" in col_names

    def test_merchant_norm_column_name(self) -> None:
        col_names = [c.name for c in Transaction.__table__.c]
        assert "merchantNorm" in col_names

    def test_is_excluded_column_name(self) -> None:
        col_names = [c.name for c in Transaction.__table__.c]
        assert "isExcluded" in col_names

    def test_is_reviewed_column_name(self) -> None:
        col_names = [c.name for c in Transaction.__table__.c]
        assert "isReviewed" in col_names

    def test_is_flagged_column(self) -> None:
        # isFlagged added in Story 3.1 — set True when confidence < threshold
        col_names = [c.name for c in Transaction.__table__.c]
        assert "isFlagged" in col_names


class TestCorrectionLogModel:
    def test_has_merchant_pattern_not_merchant_raw(self) -> None:
        col_names = [c.name for c in CorrectionLog.__table__.c]
        assert "merchantPattern" in col_names

    def test_no_transaction_id_column(self) -> None:
        # Architecture schema: CorrectionLog does NOT reference transactions
        col_names = [c.name for c in CorrectionLog.__table__.c]
        assert "transactionId" not in col_names
        assert "transaction_id" not in col_names

    def test_no_original_category_column(self) -> None:
        col_names = [c.name for c in CorrectionLog.__table__.c]
        assert "originalCategory" not in col_names
        assert "original_category" not in col_names


class TestJobStatusModel:
    def test_statement_id_is_nullable(self) -> None:
        col = JobStatus.__table__.c["statementId"]
        assert col.nullable, "statementId must be nullable — job_status survives statement deletion"

    def test_transaction_count_column_name(self) -> None:
        col_names = [c.name for c in JobStatus.__table__.c]
        assert "transactionCount" in col_names

    def test_error_message_column_name(self) -> None:
        col_names = [c.name for c in JobStatus.__table__.c]
        assert "errorMessage" in col_names

    def test_no_progress_column(self) -> None:
        # 'progress' was in the stub but is NOT in the architecture schema
        col_names = [c.name for c in JobStatus.__table__.c]
        assert "progress" not in col_names

    def test_no_message_column(self) -> None:
        # 'message' was in the stub but is NOT in the architecture schema
        col_names = [c.name for c in JobStatus.__table__.c]
        assert "message" not in col_names

    def test_user_id_is_not_nullable(self) -> None:
        col = JobStatus.__table__.c["userId"]
        assert not col.nullable
