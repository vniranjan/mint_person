# Code Review Report — Story 3-1: LiteLLM Categorizer, Confidence Scoring & Low-Confidence Flagging

**Date:** 2026-03-30
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/3-1-litellm-categorizer-confidence-scoring-and-low-confidence-flagging.md`
**Scope:** 8 files (3 created, 5 modified), ~700 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **7** |
| Defer      | **3** |
| Rejected   | **8** |

**Acceptance Auditor verdict:** All 7 ACs pass.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Server-Side Template Injection via unsandboxed Jinja2
- **Source:** blind
- **Severity:** HIGH
- **File:** `apps/worker/categorizer.py` (line ~30, `_render_prompt()`)
- **Detail:** `Environment(loader=BaseLoader())` with no sandboxing renders user-controlled data (merchant names from CSV) through Jinja2 templates. A crafted merchant name like `{{ config.__class__.__init__.__globals__ }}` would be evaluated. While the risk is mitigated by the worker running in an isolated environment and merchant data coming from user CSVs (not arbitrary third parties), this is still a template injection vector.
- **Fix:** Replace `Environment(loader=BaseLoader())` with `SandboxedEnvironment(loader=BaseLoader())` from `jinja2.sandbox`. One-line change, zero behavior difference for legitimate data.

### 2. Synchronous LLM call inside async function blocks event loop
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/worker/categorizer.py` (`_call_llm_sync()` called from `categorize_transactions()`)
- **Detail:** `categorize_transactions()` is `async def` but calls `_call_llm_sync()` which uses synchronous `litellm.completion()`. This blocks the event loop for the entire LLM round-trip (potentially seconds). With single-worker architecture, queue polling stalls during categorization. Same issue flagged in Story 2-2 review for Azure SDK calls.
- **Fix:** Wrap `_call_llm_sync()` in `asyncio.to_thread()`, or use `litellm.acompletion()` for async native calls. Alternatively, document as acceptable for single-worker architecture.

### 3. No validation that LLM-returned categories are in CATEGORY_TAXONOMY
- **Source:** blind+edge
- **Severity:** MEDIUM
- **File:** `apps/worker/categorizer.py` (LLM response parsing section)
- **Detail:** The LLM can return any string as a category. The code parses the JSON response and uses the category value directly without checking it against `CATEGORY_TAXONOMY`. An LLM hallucination like `"Food"` instead of `"Dining & Restaurants"` would be stored as-is, creating inconsistent data. The PATCH endpoint (`transactions/[id]/route.ts`) validates categories on correction, but the initial categorization path does not.
- **Fix:** After parsing LLM response, validate each category against `CATEGORY_TAXONOMY`. If not found, fall back to `"Other"` or set `is_flagged=True`.

### 4. Dead `is_flagged` assignment in `_apply_correction_log`
- **Source:** blind+edge
- **Severity:** LOW
- **File:** `apps/worker/categorizer.py` (`_apply_correction_log()`)
- **Detail:** `_apply_correction_log()` sets `is_flagged=False` on matched transactions, but after returning, the main flow runs the confidence threshold check which overwrites `is_flagged` based on confidence alone. The assignment in `_apply_correction_log` is dead code — matched transactions return with `confidence=0.95` which passes the threshold, so the final result is correct, but the code is misleading.
- **Fix:** Remove the `is_flagged` assignment from `_apply_correction_log()` since the threshold check handles it, or restructure so correction-matched transactions skip the threshold check entirely.

### 5. Brittle code-fence stripping in LLM response parsing
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `apps/worker/categorizer.py` (response parsing)
- **Detail:** The code strips markdown code fences (` ```json `) from LLM responses via simple string replacement. If the LLM returns a response with nested code fences, partial fences, or fences with language tags like ` ```JSON ` (uppercase), the stripping may fail or produce invalid JSON. Different LLM models have different formatting habits.
- **Fix:** Use a regex to strip code fences: `re.sub(r'```(?:json)?\s*\n?', '', text, flags=re.IGNORECASE).strip()`.

### 6. `KEYWORD_MAP` rebuilt on every function call
- **Source:** blind
- **Severity:** LOW
- **File:** `apps/worker/categorizer.py` (rule-based fallback function)
- **Detail:** The keyword-to-category mapping dictionary is constructed inside the function body, meaning it's rebuilt on every call. With batches of 50 transactions and rule-based fallback as a hot path, this creates unnecessary allocations.
- **Fix:** Move `KEYWORD_MAP` to module level as a constant.

### 7. No confidence value clamping
- **Source:** blind+edge
- **Severity:** LOW
- **File:** `apps/worker/categorizer.py` (LLM response parsing)
- **Detail:** The LLM can return confidence values outside [0, 1] (e.g., `95` instead of `0.95`, or `-0.1`). The code casts to `float()` but doesn't clamp. An out-of-range value would be stored and the threshold check would produce unexpected flagging behavior.
- **Fix:** Add `confidence = max(0.0, min(1.0, confidence))` after parsing.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes).

### 1. Default development credentials in config.py
- **Source:** blind
- **Detail:** `apps/worker/config.py` contains the well-known Azurite development key as a default. This is standard for local dev but should have a guard preventing it from being used in production. Pre-existing from Epic 2.

### 2. Prompt templates not cached across calls
- **Source:** blind
- **Detail:** YAML prompt templates are loaded from disk on every categorization call. For production throughput this should be cached. Minor performance issue, not a correctness bug.

### 3. Correction log last-write-wins on duplicate merchants
- **Source:** blind
- **Detail:** If multiple correction log entries exist for the same normalized merchant (from different corrections over time), the dict construction in `_apply_correction_log` uses last-write-wins. This is arguably correct (most recent correction should win) but depends on query ordering. The query doesn't specify `ORDER BY created_at`. Pre-existing data model issue.

---

**7** patch, **0** intent_gap, **0** bad_spec, **3** defer findings. **8** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (SSTI) — Low effort, high defense-in-depth value
2. **Patch #3** (category validation) — Prevents data inconsistency from LLM hallucinations
3. **Patch #2** (async blocking) — Recurring pattern across worker; consider a single refactor pass
4. **Patch #5** (code fence stripping) — Quick regex fix prevents edge-case parse failures

These can be addressed in a follow-up implementation pass or manually.