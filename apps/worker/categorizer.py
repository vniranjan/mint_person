"""
LiteLLM categorizer stub.
Full implementation → Story 3.1

Architecture:
- LiteLLM provides a unified LLM interface — swap providers by changing LLM_MODEL env var
- Per-user correction log injected as few-shot examples into system prompt
- Config-driven: model params from pydantic-settings, prompts from YAML+Jinja2
- Fallback: rule-based keyword matching when LLM unavailable
- Failed transactions → review queue (never silent failure)
"""
import logging
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

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


async def categorize_transactions(
    transactions: list[dict],
    user_correction_log: list[dict],
) -> list[dict]:
    """
    Categorize a batch of transactions using LiteLLM.
    TODO Story 3.1: Implement full categorization pipeline:
    1. Load system prompt from prompts/categorize_system.yaml
    2. Inject user_correction_log as few-shot examples
    3. Batch transactions per LLM_BATCH_SIZE
    4. Call LiteLLM with LLM_MODEL
    5. Parse response, apply confidence threshold
    6. Flag low-confidence transactions (confidence < CONFIDENCE_THRESHOLD)
    7. On LiteLLMError: fallback to rule_based_categorize()
    8. On any other error: mark as Uncategorized + flagged

    Args:
        transactions: List of {id, merchant_raw, amount} dicts
        user_correction_log: List of {merchant_raw, corrected_category} for few-shot examples

    Returns:
        List of {id, category, confidence, is_flagged} dicts
    """
    logger.info(
        f"Categorize stub: {len(transactions)} transactions, "
        f"model={settings.llm_model} — TODO Story 3.1"
    )
    # Stub: return all as Uncategorized + flagged
    return [
        {
            "id": t["id"],
            "category": "Uncategorized",
            "confidence": 0.0,
            "is_flagged": True,
        }
        for t in transactions
    ]


def rule_based_categorize(merchant: str) -> Optional[str]:
    """
    Keyword-based fallback categorizer.
    Used when LLM API is unavailable.
    TODO Story 3.1: Expand keyword mappings.

    Returns category name or None if no match found.
    """
    merchant_lower = merchant.lower()

    # Basic keyword stubs — expand in Story 3.1
    # Keywords sorted longest-first within each list so specific phrases (e.g. "uber eats")
    # match before shorter substrings (e.g. "uber") that could trigger the wrong category.
    KEYWORD_MAP: dict[str, list[str]] = {
        "Groceries": ["walmart grocery", "whole foods", "trader joe", "safeway", "kroger"],
        "Dining": ["uber eats", "amazon fresh", "mcdonald", "starbucks", "chipotle", "doordash", "grubhub"],
        "Transport": ["transit", "parking", "uber", "lyft", "mta"],
        "Subscriptions": ["amazon prime", "disney+", "netflix", "spotify", "hulu"],
        "Utilities": ["gas company", "water bill", "electric", "at&t", "verizon"],
    }

    for category, keywords in KEYWORD_MAP.items():
        if any(kw in merchant_lower for kw in keywords):
            return category

    return None
