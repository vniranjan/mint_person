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
import re
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from azure.storage.blob import BlobServiceClient
from azure.storage.queue import QueueServiceClient

from categorizer import categorize_transactions
from config import settings
from database import get_session
from dedup import is_duplicate_transaction
from job_status import update_job_stage
from models import Transaction
from parsers.registry import get_parser

logger = logging.getLogger(__name__)

# ── Merchant name normalization ────────────────────────────────────────────

# Patterns stripped from raw merchant names (applied in order)
_TRAILING_ID_RE = re.compile(r"\s+#[\w-]+$", re.IGNORECASE)
_TRAILING_DIGITS_RE = re.compile(r"\s+\d{3,}$")
# Target known payment processor prefixes only (SQ*, TST*, etc.)
# instead of a blanket asterisk strip that destroys meaningful names.
_PAYMENT_PREFIX_RE = re.compile(r"^(SQ\s*\*|TST\*|SP\s*\*|PP\s*\*)\s*", re.IGNORECASE)
_MULTI_SPACE_RE = re.compile(r"\s{2,}")
_CITY_STATE_RE = re.compile(r"\s+[A-Z]{2,}\s+[A-Z]{2}$")  # " AUSTIN TX"


def normalize_merchant(raw: str) -> str:
    """
    Normalize a raw merchant string for consistent matching and display.

    Steps:
    1. Strip surrounding whitespace
    2. Remove trailing city/state suffix
    3. Remove trailing #ID or long digit sequences
    4. Strip known payment processor prefixes (SQ*, TST*, SP*, PP*)
    5. Collapse multiple spaces
    6. Title-case the result
    """
    name = raw.strip()
    name = _CITY_STATE_RE.sub("", name)
    name = _TRAILING_ID_RE.sub("", name)
    name = _TRAILING_DIGITS_RE.sub("", name)
    name = _PAYMENT_PREFIX_RE.sub("", name)
    name = _MULTI_SPACE_RE.sub(" ", name).strip()
    return name.title() if name else raw.strip().title()


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

            # Call categorizer stub (Epic 3 will replace with real LLM)
            txn_dicts = [{"id": str(uuid.uuid4()), "merchant_raw": t.merchant_raw, "amount": str(t.amount)} for t in parsed]
            categorized = await categorize_transactions(txn_dicts, user_correction_log=[])

            # Map categorization results by index
            cat_by_id = {c["id"]: c for c in categorized}

            # ── Write transactions to DB ──────────────────────────────────
            written = 0
            for i, t in enumerate(parsed):
                txn_date = datetime.combine(t.date, datetime.min.time())
                cat_info = cat_by_id.get(txn_dicts[i]["id"], {})

                # Store None in DB when category is Uncategorized (AC3 spec)
                category_raw = cat_info.get("category")
                category = None if not category_raw or category_raw == "Uncategorized" else category_raw

                txn = Transaction(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    statement_id=statement_id,
                    date=txn_date,
                    merchant_raw=t.merchant_raw,
                    merchant_norm=normalize_merchant(t.merchant_raw),
                    amount=t.amount,
                    category=category,
                    confidence=cat_info.get("confidence"),
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
