# Story 3.1: LiteLLM Categorizer, Confidence Scoring & Low-Confidence Flagging

**Status:** review
**Epic:** 3 — AI Categorization, Review & Correction Learning
**Created:** 2026-03-30

---

## Story

As the system, I want to categorize parsed transactions using LiteLLM with YAML prompts and confidence scoring, so that every transaction receives an automatic category assignment with uncertain ones flagged for user review instead of being silently wrong.

---

## Acceptance Criteria

**AC1 — LiteLLM batch categorization**: Transactions are batched in groups of 50. System prompt loaded from `apps/worker/prompts/categorize_system.yaml` and user prompt from `apps/worker/prompts/categorize_user.yaml` via Jinja2 rendering. `LLM_MODEL` env var drives the model — no model name hardcoded in Python source.

**AC2 — High-confidence save**: Transactions with `confidence >= 0.70` are saved with their assigned category, confidence value, and `is_flagged=False` / `is_reviewed=False`.

**AC3 — Low-confidence flagging**: Transactions with `confidence < 0.70` are saved with their assigned category and confidence value, but `is_flagged=True` so they surface in the review queue.

**AC4 — Rule-based fallback**: When a `LiteLLMError` is caught, `rule_based_categorize()` runs for all transactions in the batch. Keyword matches save with `confidence=0.60`. Unmatched transactions save with `confidence=0.0` and `is_flagged=True`. The job does not fail or requeue.

**AC5 — Blob deletion & COMPLETE**: After all transactions are categorized and written, the raw CSV blob is deleted from Azure Blob Storage. `job_status.stage` updates to COMPLETE with the final transaction count.

**AC6 — Model swap**: Changing `LLM_MODEL` to `gpt-4o-mini`, `anthropic/claude-haiku-4-5-20251001`, or any other LiteLLM-supported model requires zero code changes.

**AC7 — Tests**: `pytest tests/test_categorizer.py` passes; covers LLM happy path (mocked LiteLLM response), fallback path (LiteLLMError), low-confidence flagging, and empty batch.

---

## Tasks

- [ ] **Task 1: Implement full `categorize_transactions()` in `categorizer.py`** (AC: 1, 2, 3, 4)
  - [ ] Import `litellm`, `jinja2`, `yaml` — already in `requirements.txt`
  - [ ] Add `_load_prompt(filename)` helper: reads YAML file from `prompts/`, returns `prompt` key
  - [ ] Add `_render_prompt(template_str, **kwargs)` helper: Jinja2 `Environment.from_string().render()`
  - [ ] Implement `_call_llm(system_prompt, user_prompt) -> list[dict]`: calls `litellm.completion()`, parses JSON response, returns `[{id, category, confidence}]`
  - [ ] Batch transactions into chunks of `LLM_BATCH_SIZE` (default 50 from settings)
  - [ ] For each batch: render system/user prompts, call LLM, merge results
  - [ ] On `LiteLLMError`: call `rule_based_categorize()` per transaction, assign confidence=0.60 if matched, 0.0 + is_flagged if not
  - [ ] Apply `confidence < CONFIDENCE_THRESHOLD (0.70)` → set `is_flagged=True`

- [ ] **Task 2: Expand `rule_based_categorize()` keyword map** (AC: 4)
  - [ ] Expand keyword lists for all 8 categories with comprehensive keywords
  - [ ] Ensure longest-first ordering within each list (already in stub)

- [ ] **Task 3: Update `config.py` settings** (AC: 1, 6)
  - [ ] Add `llm_batch_size: int = 50`
  - [ ] Add `confidence_threshold: float = 0.70`
  - [ ] Add `prompts_dir: str` pointing to `apps/worker/prompts/`

- [ ] **Task 4: Update `worker.py` categorizer call** (AC: 1, 5)
  - [ ] Read `correction_logs` for the user before calling `categorize_transactions()`
  - [ ] Pass `user_correction_log` (list of `{merchant_raw, corrected_category}`) to `categorize_transactions()`
  - [ ] Write `is_flagged` from categorizer result to `Transaction` row (add `is_flagged` field to worker insert)

- [ ] **Task 5: Update `models.py`** (AC: 3)
  - [ ] Add `is_flagged` Boolean column to `Transaction` model (`server_default="false"`, name="isFlagged")
  - [ ] Ensure it matches the Prisma schema (see Dev Notes)

- [ ] **Task 6: Add `isFlagged` field to Prisma schema** (AC: 3)
  - [ ] Add `isFlagged Boolean @default(false)` to `Transaction` model in `schema.prisma`
  - [ ] Create migration: `npx prisma migrate dev --name add_transaction_is_flagged`
  - [ ] Run `npx prisma generate`

- [ ] **Task 7: Tests** (AC: 7)
  - [ ] Create `apps/worker/tests/test_categorizer.py`
  - [ ] Test: LLM happy path (mock `litellm.completion`, assert categories/confidence saved)
  - [ ] Test: `LiteLLMError` triggers fallback (keyword match → confidence=0.60, no match → confidence=0.0 + is_flagged)
  - [ ] Test: confidence < 0.70 → is_flagged=True
  - [ ] Test: empty transaction list returns empty list

---

## Dev Notes

### `isFlagged` Prisma migration

Add to `Transaction` model in `schema.prisma`:
```prisma
isFlagged    Boolean   @default(false)
```

This column drives the review queue (Story 3.2). SQLAlchemy `Transaction` model in `models.py` must also get:
```python
is_flagged = Column(Boolean, nullable=False, server_default="false", name="isFlagged")
```

### LiteLLM response format

The `categorize_user.yaml` prompt already instructs the LLM to return a JSON array like:
```json
[
  {"id": "uuid", "category": "Groceries", "confidence": 0.92},
  {"id": "uuid", "category": "Dining", "confidence": 0.55}
]
```

Parse with `json.loads(response.choices[0].message.content)`. Wrap in try/except `json.JSONDecodeError` — on parse failure treat the entire batch as fallback.

### Settings fields to add to `config.py`

```python
llm_batch_size: int = 50
confidence_threshold: float = 0.70
```

### Worker `correction_logs` query (preview for Story 3.4)

For now, pass `user_correction_log=[]` (Story 3.4 will populate this). The categorizer already accepts and uses it in the system prompt template.

### `is_flagged` in worker.py transaction write

```python
txn = Transaction(
    ...
    is_flagged=cat_info.get("is_flagged", False),
)
```

### Prompts directory path

`prompts/` is at `apps/worker/prompts/`. Use `pathlib.Path(__file__).parent / "prompts"` to resolve the absolute path robustly.

---

## Dev Agent Record

**Completed by:** Dev Agent (claude-sonnet-4-6)
**Completed:** 2026-03-30

### Files Created/Modified
- `apps/worker/categorizer.py` — Full LiteLLM implementation: `_load_prompt`, `_render_prompt`, `_call_llm_sync`, `_categorize_batch`, `_fallback_batch`, `categorize_transactions`, expanded `rule_based_categorize`
- `apps/worker/models.py` — Added `is_flagged` Boolean column to `Transaction`
- `apps/worker/worker.py` — Added `CorrectionLog` import, queries correction logs before categorization, writes `is_flagged` to Transaction
- `apps/web/prisma/schema.prisma` — Added `isFlagged Boolean @default(false)` to Transaction model
- `apps/web/prisma/migrations/20260330000001_add_transaction_is_flagged/migration.sql` — New migration
- `apps/worker/tests/test_categorizer.py` — 19 tests covering all AC paths

### Notes
- `config.py` already had `confidence_threshold=0.7` and `llm_batch_size=50` — no changes needed
- Prompts YAML files already existed with correct Jinja2 templates
- All 19 tests pass: LLM happy path, low-confidence flagging, LiteLLMError fallback, JSON parse error fallback, correction log injection
