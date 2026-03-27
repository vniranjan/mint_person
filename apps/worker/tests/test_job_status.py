"""
Unit tests for job_status.py helpers.

Tests cover: valid stage transitions, invalid stage rejection,
and get_job_status return shape. Uses SQLite in-memory DB via
SQLAlchemy — no PostgreSQL required for unit tests.
"""
import uuid
from typing import Optional
from unittest.mock import MagicMock

import pytest

from job_status import VALID_STAGES, get_job_status, update_job_stage
from models import JobStatus


def _make_job(stage: str = "QUEUED") -> MagicMock:
    """Return a mock JobStatus object."""
    job = MagicMock(spec=JobStatus)
    job.id = uuid.uuid4()
    job.stage = stage
    job.transaction_count = 0
    job.error_message = None
    return job


def _make_db(job: Optional[MagicMock]) -> MagicMock:
    """Return a mock SQLAlchemy session that returns the given job."""
    db = MagicMock()
    query_chain = db.query.return_value.filter.return_value
    query_chain.first.return_value = job
    return db


class TestUpdateJobStage:
    def test_valid_stage_updates_job(self) -> None:
        job = _make_job("QUEUED")
        db = _make_db(job)

        update_job_stage(db, job.id, "READING")

        assert job.stage == "READING"

    def test_updates_transaction_count(self) -> None:
        job = _make_job("READING")
        db = _make_db(job)

        update_job_stage(db, job.id, "CATEGORIZING", transaction_count=150)

        assert job.transaction_count == 150

    def test_updates_error_message_on_failed(self) -> None:
        job = _make_job("READING")
        db = _make_db(job)

        update_job_stage(db, job.id, "FAILED", error_message="CSV parse error")

        assert job.stage == "FAILED"
        assert job.error_message == "CSV parse error"

    def test_does_not_overwrite_count_when_none(self) -> None:
        job = _make_job("READING")
        job.transaction_count = 42
        db = _make_db(job)

        update_job_stage(db, job.id, "CATEGORIZING")

        # transaction_count should remain 42 — not overwritten with None
        assert job.transaction_count == 42

    def test_clears_error_message_on_non_failed_transition(self) -> None:
        job = _make_job("FAILED")
        job.error_message = "previous error"
        db = _make_db(job)

        update_job_stage(db, job.id, "READING")

        assert job.stage == "READING"
        assert job.error_message is None

    def test_invalid_stage_raises_value_error(self) -> None:
        job = _make_job()
        db = _make_db(job)

        with pytest.raises(ValueError, match="Invalid job stage"):
            update_job_stage(db, job.id, "INVALID_STAGE")

    def test_job_not_found_raises_value_error(self) -> None:
        db = _make_db(None)  # no job found

        with pytest.raises(ValueError, match="not found"):
            update_job_stage(db, uuid.uuid4(), "READING")

    @pytest.mark.parametrize("stage", sorted(VALID_STAGES))
    def test_all_valid_stages_accepted(self, stage: str) -> None:
        job = _make_job()
        db = _make_db(job)

        update_job_stage(db, job.id, stage)
        assert job.stage == stage


class TestGetJobStatus:
    def test_returns_dict_for_existing_job(self) -> None:
        job = _make_job("COMPLETE")
        job.transaction_count = 87
        job.error_message = None
        db = _make_db(job)

        result = get_job_status(db, job.id)

        assert result is not None
        assert result["stage"] == "COMPLETE"
        assert result["transactionCount"] == 87
        assert result["errorMessage"] is None

    def test_returns_none_for_missing_job(self) -> None:
        db = _make_db(None)

        result = get_job_status(db, uuid.uuid4())

        assert result is None

    def test_includes_error_message_on_failed(self) -> None:
        job = _make_job("FAILED")
        job.transaction_count = 0
        job.error_message = "Parsing failed: unknown bank format"
        db = _make_db(job)

        result = get_job_status(db, job.id)

        assert result is not None
        assert result["errorMessage"] == "Parsing failed: unknown bank format"
