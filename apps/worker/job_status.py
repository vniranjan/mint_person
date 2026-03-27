"""
Job status table read/write helpers.

Used by the worker to update processing stage as it progresses through a job.
The frontend polls GET /api/jobs/:id/status every 2 seconds to display progress.

Job stage enum (exact values — frontend switches on these strings):
  QUEUED → UPLOADING → READING → CATEGORIZING → COMPLETE | FAILED

Architecture note: job_status rows are keyed by their own UUID (job_id), not by
statement_id. A job_status row may outlive its statement (statementId is nullable
with onDelete: SetNull) to preserve audit history.
"""
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from models import JobStatus

logger = logging.getLogger(__name__)

VALID_STAGES = frozenset(["QUEUED", "UPLOADING", "READING", "CATEGORIZING", "COMPLETE", "FAILED"])


def update_job_stage(
    db: Session,
    job_id: UUID,
    stage: str,
    transaction_count: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    """
    Update job_status record for a job.

    The worker calls this as it advances through processing stages.
    Changes are committed by the caller's session context (get_session() auto-commits).

    Args:
        db: SQLAlchemy session (worker connects as worker_role — BYPASSRLS)
        job_id: UUID of the JobStatus row
        stage: One of VALID_STAGES (exact string — frontend switches on this)
        transaction_count: Running count of parsed or categorized transactions
        error_message: Human-readable error detail; set on FAILED stage only

    Raises:
        ValueError: If stage is not a valid job stage string
    """
    if stage not in VALID_STAGES:
        raise ValueError(f"Invalid job stage: {stage!r}. Must be one of: {sorted(VALID_STAGES)}")

    job = db.query(JobStatus).filter(JobStatus.id == job_id).first()
    if not job:
        raise ValueError(f"JobStatus not found: {job_id}")

    job.stage = stage
    if transaction_count is not None:
        job.transaction_count = transaction_count
    if stage != "FAILED":
        job.error_message = None
    if error_message is not None:
        job.error_message = error_message

    logger.info(
        "Job %s: stage=%s transaction_count=%s",
        job_id,
        stage,
        job.transaction_count,
    )


def get_job_status(db: Session, job_id: UUID) -> Optional[dict]:
    """
    Read job status for the API polling endpoint.

    Returns a dict matching the API response shape `{ data: { stage, transactionCount, errorMessage } }`
    or None if the job is not found.

    The Next.js API route at GET /api/jobs/:id/status wraps this in { "data": ... }.

    Args:
        db: SQLAlchemy session
        job_id: UUID of the JobStatus row

    Returns:
        dict with stage, transactionCount, errorMessage keys, or None
    """
    job = db.query(JobStatus).filter(JobStatus.id == job_id).first()
    if not job:
        return None
    return {
        "stage": str(job.stage),
        "transactionCount": job.transaction_count,
        "errorMessage": job.error_message,
    }
