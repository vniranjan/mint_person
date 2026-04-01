"""
Azure Storage Queue polling loop — full implementation (Story 2.2).

Polls the Azure Storage Queue for statement processing jobs and dispatches
them through the CSV parse → categorize → DB write pipeline.

Inter-container message protocol (App → Worker):
{
    "jobId": "uuid",
    "userId": "uuid",
    "blobUrl": "https://...",
    "statementId": "uuid",
    "uploadedAt": "ISO8601"
}

Job stage progression:
    QUEUED → UPLOADING → READING → CATEGORIZING → COMPLETE | FAILED

Poison-pill prevention: all exceptions are caught and logged; errors mark
the job FAILED rather than crashing the loop or re-queuing the message.
"""
import asyncio
import base64
import json
import logging
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from azure.storage.blob import BlobServiceClient
from azure.storage.queue import QueueServiceClient

from categorizer import categorize_transactions, normalize_merchant
from config import settings
from database import get_session
from dedup import is_duplicate_transaction
from job_status import update_job_stage
from models import CorrectionLog, Transaction
from parsers.registry import get_parser

logger = logging.getLogger(__name__)


# Common non-discriminative words that should not be used as prefixes
_PREFIX_STOPWORDS = frozenset({"the", "a", "an", "la", "le", "les"})


def _merchant_prefix(name: str) -> str:
    """
    Return the first meaningful word as a matching prefix for within-upload
    pattern application (Story 3.4 AC2).
    - Min 3 chars to avoid false matches (e.g. "BP")
    - Stopwords filtered to avoid cross-matching unrelated merchants (e.g. "THE ...")
    """
    parts = name.strip().split()
    if parts:
        first = parts[0].lower()
        if len(first) >= 3 and first not in _PREFIX_STOPWORDS:
            return first
    return ""


# ── Blob helpers ───────────────────────────────────────────────────────────

def _get_blob_client():
    return BlobServiceClient.from_connection_string(
        settings.azure_storage_connection_string
    )


def _download_blob_sync(blob_url: str) -> str:
    """Download blob content as a string (synchronous — wrapped in to_thread by caller)."""
    blob_client = _get_blob_client()
    # URL format: http(s)://{account}/{container}/{blob_path}
    parts = blob_url.split(f"/{settings.azure_blob_container_name}/", 1)
    if len(parts) != 2:
        raise ValueError(f"Cannot parse blob name from URL: {blob_url}")
    blob_name = parts[1]
    container = blob_client.get_container_client(settings.azure_blob_container_name)
    download = container.get_blob_client(blob_name).download_blob()
    # utf-8-sig transparently strips BOM (common in Windows bank CSV exports)
    return download.readall().decode("utf-8-sig")


def _delete_blob_sync(blob_url: str) -> None:
    """Delete blob (synchronous — wrapped in to_thread by caller)."""
    try:
        parts = blob_url.split(f"/{settings.azure_blob_container_name}/", 1)
        if len(parts) != 2:
            return
        blob_name = parts[1]
        container = _get_blob_client().get_container_client(settings.azure_blob_container_name)
        container.get_blob_client(blob_name).delete_blob()
        logger.info("Deleted blob: %s", blob_name)
    except Exception as e:
        logger.error("Failed to delete blob %s: %s", blob_url, e)


async def _download_blob(blob_url: str) -> str:
    """Download blob content, offloading blocking I/O to a thread."""
    return await asyncio.to_thread(_download_blob_sync, blob_url)


async def _delete_blob(blob_url: str) -> None:
    """Delete blob, offloading blocking I/O to a thread."""
    await asyncio.to_thread(_delete_blob_sync, blob_url)


# ── Core job processor ────────────────────────────────────────────────────

async def process_statement_job(message: dict) -> None:
    """
    Process a single statement job from the queue.

    Stages: QUEUED → UPLOADING → READING → CATEGORIZING → COMPLETE | FAILED
    All errors mark the job FAILED — no exception propagation (poison-pill prevention).
    """
    job_id_str = message.get("jobId", "unknown")
    blob_url: str | None = None
    blob_downloaded = False

    try:
        job_id = uuid.UUID(job_id_str)
        user_id = message["userId"]
        statement_id = message["statementId"]
        blob_url = message["blobUrl"]
    except (KeyError, ValueError) as e:
        logger.error("Malformed queue message — missing required fields: %s", e)
        return

    logger.info("Starting job %s for user %s", job_id_str, user_id)

    with get_session() as db:
        try:
            # ── Stage: UPLOADING ──────────────────────────────────────────
            update_job_stage(db, job_id, "UPLOADING")
            db.commit()

            csv_content = await _download_blob(blob_url)
            blob_downloaded = True

            # ── Stage: READING ────────────────────────────────────────────
            # get_parser raises ValueError if format is unrecognized
            parser = get_parser(csv_content)

            logger.info("Job %s: using %s parser", job_id_str, parser.bank_name)
            parsed = parser.parse(csv_content)
            update_job_stage(db, job_id, "READING", transaction_count=len(parsed))
            db.commit()

            if not parsed:
                raise ValueError("No transactions found in CSV — file may be empty or malformed")

            # ── Stage: CATEGORIZING ───────────────────────────────────────
            update_job_stage(db, job_id, "CATEGORIZING", transaction_count=len(parsed))
            db.commit()

            # Load user's correction log for few-shot examples + pre-matching (Story 3.4)
            corrections = db.query(CorrectionLog).filter(
                CorrectionLog.user_id == user_id
            ).all()
            user_correction_log = [
                {"merchant_raw": c.merchant_pattern, "corrected_category": c.corrected_category}
                for c in corrections
            ]

            # Categorize with LiteLLM (falls back to rule-based on LLM errors)
            txn_dicts = [{"id": str(uuid.uuid4()), "merchant_raw": t.merchant_raw, "amount": str(t.amount)} for t in parsed]
            categorized = await categorize_transactions(txn_dicts, user_correction_log=user_correction_log)

            # Map categorization results by temp id
            cat_by_id = {c["id"]: c for c in categorized}

            # ── Apply within-upload pattern matching (Story 3.4 AC2) ──────
            # Build prefix→category map from correction log
            prefix_map: dict[str, str] = {}
            for entry in user_correction_log:
                prefix = _merchant_prefix(normalize_merchant(entry["merchant_raw"]))
                if prefix:
                    prefix_map[prefix] = entry["corrected_category"]

            # Count how many transactions per prefix will be auto-corrected
            prefix_counts: dict[str, int] = {}
            if prefix_map:
                for t in parsed:
                    prefix = _merchant_prefix(normalize_merchant(t.merchant_raw))
                    if prefix in prefix_map:
                        prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1

            # ── Write transactions to DB ──────────────────────────────────
            written = 0
            for i, t in enumerate(parsed):
                txn_date = datetime.combine(t.date, datetime.min.time())
                cat_info = cat_by_id.get(txn_dicts[i]["id"], {})

                # Store None in DB when category is Uncategorized (AC3 spec)
                category_raw = cat_info.get("category")
                category = None if not category_raw or category_raw == "Uncategorized" else category_raw
                confidence = cat_info.get("confidence")
                is_flagged = cat_info.get("is_flagged", False)

                # Within-upload pattern override (Story 3.4)
                # Only applies when LLM confidence is < 0.95 (don't override high-confidence results)
                merchant_norm = normalize_merchant(t.merchant_raw)
                prefix = _merchant_prefix(merchant_norm)
                pattern_note: str | None = None
                if prefix and prefix in prefix_map and (confidence is None or confidence < 0.95):
                    category = prefix_map[prefix]
                    confidence = 0.95
                    is_flagged = False
                    n = prefix_counts.get(prefix, 1)
                    if n > 1:
                        pattern_note = f"Also applied to {n - 1} similar merchant{'s' if n - 1 > 1 else ''}"

                txn = Transaction(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    statement_id=statement_id,
                    date=txn_date,
                    merchant_raw=t.merchant_raw,
                    merchant_norm=merchant_norm,
                    amount=t.amount,
                    category=category,
                    confidence=confidence,
                    is_flagged=is_flagged,
                    pattern_applied_note=pattern_note,
                    is_duplicate=is_duplicate_transaction(db, user_id, t.date, t.amount, t.merchant_raw),
                )
                db.add(txn)
                db.flush()  # Make row visible to subsequent _is_duplicate queries (intra-batch)
                written += 1

            # ── Stage: COMPLETE ───────────────────────────────────────────
            update_job_stage(db, job_id, "COMPLETE", transaction_count=written)
            db.commit()
            logger.info("Job %s complete: %d transactions written", job_id_str, written)

        except Exception as exc:
            logger.error("Job %s failed: %s", job_id_str, exc, exc_info=True)
            try:
                db.rollback()
                update_job_stage(db, job_id, "FAILED", error_message=str(exc)[:500])
                db.commit()
            except Exception as inner:
                logger.error("Failed to mark job %s as FAILED: %s", job_id_str, inner)

        finally:
            # Always delete the blob (FR28) if it was downloaded, regardless of success/failure.
            if blob_downloaded and blob_url:
                await _delete_blob(blob_url)


# ── Queue polling loop ─────────────────────────────────────────────────────

async def start_queue_polling() -> None:
    """
    Start the Azure Storage Queue polling loop.

    Polls every 2 seconds. Visibility timeout of 120s prevents duplicate
    processing if the worker crashes mid-job. Messages are deleted only
    on successful (or explicitly-failed) processing.
    """
    logger.info("Starting queue polling — queue: %s", settings.azure_queue_name)

    queue_service = QueueServiceClient.from_connection_string(
        settings.azure_storage_connection_string
    )
    queue_client = queue_service.get_queue_client(settings.azure_queue_name)

    try:
        queue_client.create_queue()  # Idempotent
    except Exception as e:
        logger.warning("Queue create (idempotent): %s", e)

    while True:
        try:
            messages = queue_client.receive_messages(max_messages=1, visibility_timeout=120)
            for msg in messages:
                try:
                    raw = base64.b64decode(msg.content).decode("utf-8")
                    payload = json.loads(raw)
                except Exception as decode_err:
                    logger.error("Failed to decode queue message: %s", decode_err)
                    queue_client.delete_message(msg)
                    continue

                await process_statement_job(payload)
                queue_client.delete_message(msg)

        except Exception as poll_err:
            logger.error("Queue poll error (will retry): %s", poll_err)

        await asyncio.sleep(2)
