# Code Review Report — Story 2-2: Python Worker Bank CSV Parsers

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/2-2-python-worker-bank-csv-parsers.md`
**Scope:** 9 files (5 created, 4 modified), ~600 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **9** |
| Defer      | **8** |
| Rejected   | **13** |

**Acceptance Auditor verdict:** 4 of 6 ACs pass. AC2 PARTIAL (`get_parser()` returns `None` instead of raising `ValueError`; sign convention deviates from spec). AC3 PARTIAL (`category` stored as `"Uncategorized"` string instead of `None`).

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. `test_parsers.py` broken — asserts `PARSER_REGISTRY == []` which now fails
- **Source:** acceptance+edge
- **Severity:** HIGH
- **File:** `apps/worker/tests/test_parsers.py` (line 18)
- **Detail:** The test file was not updated for Story 2.2. It still contains the Story 1.1 stub test: `assert PARSER_REGISTRY == []`. With 5 parsers now registered, this test fails. The spec (Task 6) requires "one test per parser using fixture CSV strings." None of these tests exist.
- **Fix:** Rewrite `test_parsers.py`: remove the `PARSER_REGISTRY == []` assertion, add 5 tests (one per bank) using fixture CSV content that exercises `can_parse()` and `parse()` for each parser.

### 2. `test_worker.py` never created — no tests for core pipeline
- **Source:** acceptance
- **Severity:** HIGH
- **File:** `apps/worker/tests/test_worker.py` (missing)
- **Detail:** Task 6 requires `test_worker.py` with tests for `normalize_merchant()`, duplicate/non-duplicate path, and FAILED stage on bad CSV. This file does not exist. The worker pipeline has zero test coverage.
- **Fix:** Create `apps/worker/tests/test_worker.py` with the specified test cases.

### 3. `category` stored as `"Uncategorized"` instead of `None`
- **Source:** acceptance+edge
- **Severity:** MEDIUM
- **File:** `apps/worker/worker.py` (line 200)
- **Detail:** AC3 says category is set from the categorizer stub and should be `None`/`Uncategorized`. The spec Dev Notes (line 285) explicitly say: `category=cat_result.category if cat_result.category != "Uncategorized" else None` — i.e., store `None` in DB when result is `"Uncategorized"`. The implementation stores the literal string `"Uncategorized"` via `cat_info.get("category")`. The spec note at line 341 reinforces: "Store `category=None` in DB when result is `Uncategorized` to match schema."
- **Fix:** After line 200, add: `category = None if category == "Uncategorized" else category` before passing to the Transaction constructor.

### 4. `get_parser()` returns `None` instead of raising `ValueError` per spec
- **Source:** acceptance
- **Severity:** MEDIUM
- **File:** `apps/worker/parsers/registry.py` (line 44–45)
- **Detail:** Task 2 specifies: "raise `ValueError("Unsupported CSV format")` if none match." The implementation returns `None`. The worker compensates (worker.py line 164–165) by checking for `None` and raising its own error, but the registry's public API contract deviates from spec.
- **Fix:** Change `return None` to `raise ValueError("Unsupported CSV format — no matching parser found")` in `get_parser()`. Update worker.py to remove the redundant None check.

### 5. Blocking synchronous Azure SDK calls inside async function
- **Source:** blind+edge
- **Severity:** MEDIUM
- **File:** `apps/worker/worker.py` (lines 82–93, 96–107)
- **Detail:** `_download_blob()` and `_delete_blob()` use synchronous Azure SDK calls (`download_blob().readall()`, `delete_blob()`) inside the async `process_statement_job()`. These block the event loop for the duration of the I/O operation. With single-worker processing this causes queue polling to stall during blob operations. Large files (up to 10MB) could block for seconds.
- **Fix:** Wrap blocking calls in `asyncio.to_thread()` or use `loop.run_in_executor()`. Alternatively, accept the current design given single-worker architecture and document the limitation.

### 6. `float` → `str` → `Decimal` precision loss in amount parsing — financial data corruption
- **Source:** edge
- **Severity:** HIGH
- **File:** `apps/worker/parsers/chase.py` (line 47–49), and equivalent in all 5 parsers
- **Detail:** All parsers use `pd.read_csv()` without `dtype=str`, so pandas auto-converts the `Amount` column to `float64`. The code then does `str(row["Amount"]).replace(",", "")` → `Decimal(...)`. A CSV value like `"-1234.56"` may become float `-1234.5600000000002`, then `str()` produces `"-1234.5600000000002"`, and `Decimal("-1234.5600000000002")` stores a value not equal to `Decimal("-1234.56")`. PostgreSQL's `Numeric(12,2)` will round on storage, but the Python-side `Decimal` in `_is_duplicate()` retains full precision. The comparison `Transaction.amount == amount` can fail because the Python Decimal has more precision than the DB value, breaking duplicate detection and potentially causing off-by-one-cent discrepancies.
- **Fix:** Pass `dtype=str` to all `pd.read_csv()` calls to preserve raw string values, or switch to the stdlib `csv` module as the spec prescribes. This ensures `Decimal("1234.56")` is exact.

### 7. Asterisk regex destroys meaningful merchant names
- **Source:** edge
- **Severity:** HIGH
- **File:** `apps/worker/worker.py` (lines 48, 69)
- **Detail:** `_ASTERISK_RE = re.compile(r"\*.*$")` removes everything from the first asterisk to end-of-string. Many legitimate merchant names use asterisks as separators: `"AMAZON*Mktp US"` → `"Amazon"`, `"SQ *COFFEE SHOP"` → `"Sq"`, `"TST*JOE'S DINER"` → `"Tst"`. The meaningful part of the name is destroyed. The spec's `normalize_merchant` handles this differently — it targets only known payment processor prefixes (`sq\s*\*`, `tst\*`), not a blanket asterisk strip.
- **Fix:** Replace the blanket asterisk regex with targeted patterns for known payment processor prefixes (SQ*, TST*, etc.) as the spec prescribes. The current approach is far too aggressive and will mangle a large percentage of real merchant names.

### 8. `pd.to_datetime()` without explicit format — ambiguous date parsing
- **Source:** blind
- **Severity:** HIGH
- **File:** `apps/worker/parsers/chase.py` (line 45), and equivalent in all 5 parsers
- **Detail:** All parsers call `pd.to_datetime(str(row["Date"]))` without specifying `format=`. Pandas guesses the format, and its guessing is locale-dependent and ambiguous. The date `"01/02/2026"` could be January 2nd or February 1st depending on whether pandas infers `MM/DD` or `DD/MM`. Worse, pandas may infer differently across rows if the data is inconsistent — it could silently switch between date formats within the same file.
- **Fix:** Specify explicit `format=` for each parser based on that bank's known date format. E.g., Chase: `format="%m/%d/%Y"`, Capital One: `format="%Y-%m-%d"`.

### 9. Blob download uses `errors="replace"` — silently corrupts non-UTF-8 data
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/worker/worker.py` (line 93)
- **Detail:** `download.readall().decode("utf-8", errors="replace")` has two problems: (1) It silently replaces invalid bytes with `�`, corrupting merchant names in CSVs with non-UTF-8 encoding (common with Excel exports using Windows-1252). (2) It uses `utf-8` instead of `utf-8-sig`, so a BOM character (`\ufeff`) is prepended to the first header field. When pandas parses `\ufeffTransaction Date`, the column name doesn't match `"Transaction Date"`, and `can_parse()` returns `False` for every parser — the job fails with "Unrecognized bank CSV format" on a perfectly valid file. BOM-prefixed CSVs are common from Windows bank website exports.
- **Fix:** Use `utf-8-sig` to transparently strip the BOM. For non-UTF-8 encoding, consider `chardet` or fail explicitly with a clear error message instead of silent corruption.

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 7. Parsers silently skip malformed rows without logging
- **Source:** blind+edge
- **Detail:** Every parser catches `(ValueError, InvalidOperation, KeyError)` and `continue`s — no logging. If a CSV has 100 rows and 50 are malformed, the user gets 50 transactions with no indication that half were dropped. This is especially problematic for the Wells Fargo parser where column positions can shift.

### 8. Wells Fargo `can_parse()` false positive risk
- **Source:** edge
- **Detail:** The Wells Fargo parser (checked last as fallback) detects CSVs with 5+ columns where columns 2 and 3 are asterisks. Any non-bank CSV that happens to have this pattern would be misidentified. Since it's the last parser in the registry, false positives only occur for CSVs that don't match any other bank format.

### 9. BofA `_find_header_row` returns 0 on failure — silent misparse
- **Source:** edge
- **Detail:** If `_find_header_row()` doesn't find "Posted Date" + "Payee" in any line, it returns `0`. `pd.read_csv(..., skiprows=0)` then treats the first line as the header. This produces a DataFrame with wrong column names, causing all rows to be skipped by the exception handler — returning an empty list with no error.

### 10. No input size limit on blob download
- **Source:** blind
- **Detail:** `_download_blob()` calls `download_blob().readall()` which loads the entire blob into memory. The upload route enforces 10MB, but if the blob is modified in storage (or the limit changes), the worker could OOM.

### 11. Queue message deletion not guaranteed on process failure
- **Source:** edge
- **Detail:** In `start_queue_polling()`, `queue_client.delete_message(msg)` (line 262) runs after `process_statement_job()`. Since `process_statement_job` swallows all exceptions, this works in practice. But if the function ever raises (e.g., due to a bug in error handling at lines 214–219), the message is not deleted and becomes visible again after the visibility timeout, causing infinite retry loops.

### 12. Amount sign convention deviates from spec
- **Source:** acceptance+edge
- **Detail:** The spec says "negative values are charges (expenses). Store as-is" for Chase. The implementation flips signs: `amount = -Decimal(amount_raw)` so that expenses are positive. This is a deliberate design decision ("net expense model") consistently applied across all parsers. However, it contradicts the spec's "Store as-is" instruction. The downstream impact depends on whether the UI expects positive = expense.

### 13. `pandas` dependency adds ~40MB to worker image
- **Source:** blind
- **Detail:** All parsers use `pandas` for CSV parsing. The spec suggests `csv` + `io` stdlib modules. `pandas` is significantly heavier but provides more robust CSV handling (automatic type inference, handling of quoted fields, etc.). This is a tradeoff, not a bug.

### 14. Blob deleted on failure — unrecoverable data loss for failed jobs
- **Source:** blind
- **Detail:** The `finally` block in `process_statement_job()` deletes the blob whenever `blob_downloaded` is True, regardless of success or failure (per FR28). If parsing fails, the original uploaded file is permanently destroyed. The user cannot retry, support cannot investigate, and the data is gone. FR28 mandates this behavior, but retaining blobs for failed jobs would enable retry and debugging.

---

## Rejected Findings (13)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- Worker never explicitly sets QUEUED stage — QUEUED is the `server_default` set at row creation time by the upload route; worker correctly starts at UPLOADING
- Capital One skips zero-amount rows — correct behavior; zero-amount transactions (e.g., balance adjustments) carry no financial signal
- `normalize_merchant()` regex could strip valid merchant name parts — the patterns are conservative (trailing IDs, city/state); false positives are cosmetic, not data-loss
- Chase uses `REQUIRED_HEADERS = {"Transaction Date", "Description", "Amount"}` instead of full 7-column set — subset check is more resilient to bank format changes; `can_parse` doesn't need all columns
- `process_statement_job` generates `uuid.uuid4()` for transaction IDs — matches spec skeleton; Prisma's `cuid()` is TypeScript-side only
- `_is_duplicate` function inlined in `worker.py` instead of separate `dedup.py` — structural deviation from spec but functionally equivalent (covered in Story 2-4 review)
- No type hints on `message` parameter in `process_statement_job` — dict type is implicit from JSON parsing; adding TypedDict would be an enhancement
- `PARSER_REGISTRY` is a mutable list, not frozen — parsers are registered once at import time; runtime mutation is not a realistic concern
- BofA `_find_header_row` line-by-line scan uses `csv.reader` on full file then re-reads with `pd.read_csv` — double-read is inefficient but correct; the file is small (≤10MB) and the scan is O(n)
- `Decimal("NaN")` and `Decimal("Infinity")` not explicitly rejected — PostgreSQL `Numeric(12,2)` rejects these at commit time, marking the job FAILED; the error message is cryptic but the data path is safe
- `can_parse()` doesn't strip header whitespace but `parse()` does — pandas `read_csv` with `nrows=0` produces clean headers in practice; real bank CSVs don't have leading/trailing spaces in headers
- Blob URL from queue message not validated against expected storage account origin — the URL originates from the trusted web app via Azure Queue; the worker and web app share the same storage account connection string
- `user_id` and `statement_id` from queue message not validated as UUIDs upfront — DB will reject invalid values at commit time, marking the job FAILED; validation is defense-in-depth, not a correctness issue

---

## Priority Actions Before Merge

1. **Finding #1 (HIGH):** Rewrite `test_parsers.py` with per-parser fixture tests — the current file has broken assertions.
2. **Finding #2 (HIGH):** Create `test_worker.py` with tests for `normalize_merchant()`, pipeline stages, and error handling.
3. **Finding #6 (HIGH):** Pass `dtype=str` to `pd.read_csv()` in all parsers to prevent float precision loss on financial amounts.
4. **Finding #7 (HIGH):** Replace blanket asterisk regex with targeted payment processor prefix patterns per spec.
5. **Finding #8 (HIGH):** Specify explicit `format=` in all `pd.to_datetime()` calls to prevent ambiguous date parsing.
6. **Finding #3 (MEDIUM):** Store `category=None` instead of `"Uncategorized"` string to match spec and schema.
7. **Finding #4 (MEDIUM):** Change `get_parser()` to raise `ValueError` instead of returning `None`.