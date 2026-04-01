"""
LiteLLM categorizer — Story 3.1 full implementation.

Architecture:
- LiteLLM provides a unified LLM interface — swap providers by changing LLM_MODEL env var
- Per-user correction log injected as few-shot examples into system prompt (Story 3.4)
- Config-driven: model from settings, prompts from YAML + Jinja2
- Fallback: rule-based keyword matching when LLM unavailable (LiteLLMError)
- Low-confidence threshold: transactions below 0.70 flagged for review
"""
import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Optional

import yaml
from jinja2.sandbox import SandboxedEnvironment
from jinja2 import BaseLoader
from litellm import completion
from litellm.exceptions import APIError, APIConnectionError, RateLimitError, AuthenticationError

from config import settings

logger = logging.getLogger(__name__)


# ── Merchant name normalization ────────────────────────────────────────────
# (Canonical definition — worker.py imports from here to avoid circular deps)

_TRAILING_ID_RE = re.compile(r"\s+#[\w-]+$", re.IGNORECASE)
_TRAILING_DIGITS_RE = re.compile(r"\s+\d{3,}$")
_PAYMENT_PREFIX_RE = re.compile(r"^(SQ\s*\*|TST\*|SP\s*\*|PP\s*\*)\s*", re.IGNORECASE)
_MULTI_SPACE_RE = re.compile(r"\s{2,}")
_CITY_STATE_RE = re.compile(r"\s+[A-Z]{2,}\s+[A-Z]{2}$")
# Used for code-fence stripping in LLM responses
_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*\n?", re.IGNORECASE)


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


# The 8 fixed categories (FR19)
CATEGORY_TAXONOMY = [
    "Groceries",
    "Dining",
    "Transport",
    "Shopping",
    "Subscriptions",
    "Healthcare",
    "Entertainment",
    "Utilities",
]
_CATEGORY_SET = set(CATEGORY_TAXONOMY)

# Treat any of these as a LiteLLM connectivity/rate error → trigger fallback
_LITELLM_ERRORS = (APIError, APIConnectionError, RateLimitError, AuthenticationError)

_PROMPTS_DIR = Path(__file__).parent / "prompts"

# Module-level keyword map — built once, not per-call
KEYWORD_MAP: dict[str, list[str]] = {
    "Groceries": [
        "walmart grocery", "whole foods", "trader joe", "safeway", "kroger",
        "publix", "wegmans", "aldi", "costco", "sam's club", "sprouts",
        "fresh market", "market basket", "stop & shop", "giant food",
    ],
    "Dining": [
        "doordash", "grubhub", "uber eats", "seamless", "instacart",
        "mcdonald", "starbucks", "chipotle", "subway", "domino",
        "pizza hut", "taco bell", "wendy's", "burger king", "chick-fil",
        "panera", "dunkin", "five guys", "shake shack", "cheesecake factory",
    ],
    "Transport": [
        "uber", "lyft", "mta", "transit", "parking", "exxon", "shell oil",
        "bp gas", "chevron", "citgo", "speedway", "sunoco", "marathon",
        "enterprise rent", "hertz", "avis", "amtrak", "greyhound",
    ],
    "Shopping": [
        "amazon.com", "walmart.com", "target", "best buy", "home depot",
        "lowe's", "wayfair", "etsy", "ebay", "nordstrom", "macy's",
        "gap", "h&m", "zara", "uniqlo", "old navy", "tj maxx", "marshalls",
    ],
    "Subscriptions": [
        "netflix", "spotify", "hulu", "disney+", "apple.com/bill",
        "amazon prime", "youtube premium", "hbo max", "peacock",
        "paramount+", "adobe", "microsoft 365", "dropbox", "icloud",
    ],
    "Healthcare": [
        "cvs pharmacy", "walgreens", "rite aid", "urgent care",
        "labcorp", "quest diagnostics", "hospital", "medical center",
        "dental", "vision", "optometry", "therapy", "pharmacy",
    ],
    "Entertainment": [
        "amc theatre", "regal cinema", "ticketmaster", "eventbrite",
        "stubhub", "gamestop", "steam", "playstation", "xbox",
        "bowling", "golf", "museum", "concert", "sports",
    ],
    "Utilities": [
        "gas company", "water bill", "electric", "at&t", "verizon",
        "t-mobile", "comcast", "xfinity", "spectrum", "cox",
        "con edison", "pg&e", "duke energy", "national grid",
    ],
}


# ── Prompt helpers ─────────────────────────────────────────────────────────

def _load_prompt(filename: str) -> str:
    """Load a YAML prompt file and return its 'prompt' key as a string."""
    path = _PROMPTS_DIR / filename
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data["prompt"]


def _render_prompt(template_str: str, **kwargs) -> str:
    """Render a Jinja2 prompt template with the given variables (sandboxed)."""
    env = SandboxedEnvironment(loader=BaseLoader())
    template = env.from_string(template_str)
    return template.render(**kwargs)


# ── LLM call ──────────────────────────────────────────────────────────────

def _call_llm_sync(system_prompt: str, user_prompt: str) -> list[dict]:
    """
    Call LiteLLM synchronously and parse the JSON response.

    Returns a list of {id, category, confidence} dicts.
    Raises a _LITELLM_ERRORS exception on connectivity / rate-limit issues.
    Raises ValueError on JSON parse failure (treated as parse error → fallback).
    """
    response = completion(
        model=settings.llm_model,
        api_key=settings.llm_api_key or None,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=settings.llm_max_tokens,
        temperature=settings.llm_temperature,
    )
    content = response.choices[0].message.content.strip()
    # Strip markdown code fences (handles ```json, ```JSON, ``` variants)
    content = _CODE_FENCE_RE.sub("", content).strip()
    return json.loads(content)


# ── Main categorization entry point ───────────────────────────────────────

async def categorize_transactions(
    transactions: list[dict],
    user_correction_log: list[dict],
) -> list[dict]:
    """
    Categorize a batch of transactions using LiteLLM.

    Each input transaction dict: {id, merchant_raw, amount}
    Each output dict: {id, category, confidence, is_flagged}

    Flow:
    1. Pre-apply correction log matches (confidence=0.95, no LLM call) — Story 3.4
    2. Send remaining transactions to LLM in batches of LLM_BATCH_SIZE
    3. On LiteLLMError: run rule_based_categorize() for that batch
    4. Apply confidence threshold: confidence < 0.70 → is_flagged=True

    Args:
        transactions: List of {id, merchant_raw, amount} dicts
        user_correction_log: List of {merchant_raw, corrected_category} for few-shot examples
    """
    if not transactions:
        return []

    # Step 1: Pre-apply correction log (Story 3.4 — cross-upload learning)
    pre_matched, to_llm = _apply_correction_log(transactions, user_correction_log)

    system_template = _load_prompt("categorize_system.yaml")
    user_template = _load_prompt("categorize_user.yaml")

    system_prompt = _render_prompt(
        system_template,
        categories=", ".join(CATEGORY_TAXONOMY),
        confidence_threshold=settings.confidence_threshold,
        correction_examples=user_correction_log,
    )

    # Step 2: Send unmatched transactions to LLM (offload blocking I/O to thread)
    llm_results: list[dict] = []
    batch_size = settings.llm_batch_size

    for batch_start in range(0, len(to_llm), batch_size):
        batch = to_llm[batch_start : batch_start + batch_size]
        batch_results = await asyncio.to_thread(_categorize_batch, batch, system_prompt, user_template)
        llm_results.extend(batch_results)

    # Merge pre-matched and LLM results, preserving original order
    results_by_id = {r["id"]: r for r in pre_matched + llm_results}
    results = [results_by_id[t["id"]] for t in transactions if t["id"] in results_by_id]

    # Step 3: Apply confidence threshold
    threshold = settings.confidence_threshold
    for r in results:
        r["is_flagged"] = r.get("confidence", 0.0) < threshold

    logger.info(
        "Categorized %d transactions (%d from correction log, %d from LLM); %d flagged",
        len(results),
        len(pre_matched),
        len(llm_results),
        sum(1 for r in results if r["is_flagged"]),
    )
    return results


def _apply_correction_log(
    transactions: list[dict],
    correction_log: list[dict],
) -> tuple[list[dict], list[dict]]:
    """
    Pre-apply exact merchant_norm matches from correction log before LLM call.
    Returns (matched_results, unmatched_transactions).
    Matched transactions get confidence=0.95; is_flagged is set by threshold check in caller.
    """
    log_map: dict[str, str] = {}
    for entry in correction_log:
        key = normalize_merchant(entry["merchant_raw"]).lower()
        log_map[key] = entry["corrected_category"]

    matched: list[dict] = []
    unmatched: list[dict] = []

    for txn in transactions:
        key = normalize_merchant(txn["merchant_raw"]).lower()
        if key in log_map:
            matched.append({
                "id": txn["id"],
                "category": log_map[key],
                "confidence": 0.95,
            })
        else:
            unmatched.append(txn)

    return matched, unmatched


def _categorize_batch(
    batch: list[dict],
    system_prompt: str,
    user_template: str,
) -> list[dict]:
    """
    Categorize a single batch via LLM. Falls back to rule-based on LiteLLM errors.
    Returns list of {id, category, confidence} dicts (is_flagged not yet applied).
    """
    user_prompt = _render_prompt(user_template, transactions=batch)

    try:
        llm_results = _call_llm_sync(system_prompt, user_prompt)
        # Build result map by id
        result_by_id = {r["id"]: r for r in llm_results if "id" in r}

        results = []
        for txn in batch:
            if txn["id"] in result_by_id:
                r = result_by_id[txn["id"]]
                raw_category = r.get("category", "Uncategorized")
                # Validate LLM-returned category against taxonomy; fall back to Uncategorized
                category = raw_category if raw_category in _CATEGORY_SET else "Uncategorized"
                raw_confidence = float(r.get("confidence", 0.0))
                confidence = max(0.0, min(1.0, raw_confidence))
                results.append({
                    "id": txn["id"],
                    "category": category,
                    "confidence": confidence,
                })
            else:
                # LLM didn't return a result for this transaction
                results.append({
                    "id": txn["id"],
                    "category": "Uncategorized",
                    "confidence": 0.0,
                })
        return results

    except _LITELLM_ERRORS as e:
        logger.warning("LiteLLM error — falling back to rule-based categorizer: %s", e)
        return _fallback_batch(batch)

    except (json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning("LLM response parse error — falling back to rule-based: %s", e)
        return _fallback_batch(batch)


def _fallback_batch(batch: list[dict]) -> list[dict]:
    """Apply rule-based categorization for a batch (LLM unavailable)."""
    results = []
    for txn in batch:
        category = rule_based_categorize(txn["merchant_raw"])
        if category:
            results.append({
                "id": txn["id"],
                "category": category,
                "confidence": 0.60,  # Rule-based confidence (Story 3.1 AC4)
            })
        else:
            results.append({
                "id": txn["id"],
                "category": "Uncategorized",
                "confidence": 0.0,
            })
    return results


# ── Rule-based fallback ───────────────────────────────────────────────────

def rule_based_categorize(merchant: str) -> Optional[str]:
    """
    Keyword-based fallback categorizer.
    Used when LLM API is unavailable.

    Keywords sorted longest-first within each list so specific phrases
    (e.g. "uber eats") match before shorter substrings (e.g. "uber").

    Returns category name or None if no match found.
    """
    merchant_lower = merchant.lower()
    for category, keywords in KEYWORD_MAP.items():
        if any(kw in merchant_lower for kw in keywords):
            return category
    return None
