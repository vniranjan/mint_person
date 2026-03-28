# Code Review Report — Story 2-1: CSV Upload API & Azure Blob/Queue Integration

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/2-1-csv-upload-api-and-azure-blob-queue-integration.md`
**Scope:** 7 files (5 created, 2 modified), ~300 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **4** |
| Defer      | **5** |
| Rejected   | **6** |

**Acceptance Auditor verdict:** 5 of 6 ACs pass. **AC3 FAIL** — blob upload ordering is inverted (DB records created before blob, spec requires blob first).

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. AC3 violation — blob upload happens AFTER DB records, not before
- **Source:** acceptance
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/statements/upload/route.ts` (lines 57–70)
- **Detail:** AC3 states: "File is uploaded to Azure Blob Storage at path `{userId}/{statementId}/{filename}` **before** DB records are created." The implementation does the opposite — it creates Statement + JobStatus rows first (line 59–67), then uploads the blob (line 70). If blob upload fails, orphan DB rows remain with no cleanup. The spec ordering prevents orphan DB state.
- **Fix:** Move the `withRLS` transaction after `uploadStatementBlob`. Generate `statementId` via `cuid()` before the blob upload (as the spec suggests in Task 3), upload blob, then create DB records. If DB creation fails after blob upload, the blob auto-expires via Azure lifecycle policy (1hr TTL per azure-blob.ts comment).

### 2. Non-atomic multi-step pipeline with no rollback
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/statements/upload/route.ts` (lines 57–79)
- **Detail:** Three sequential operations (DB create → blob upload → queue enqueue) with no compensation logic. If step 2 (blob) fails, orphan DB rows persist. If step 3 (enqueue) fails, a blob exists with a QUEUED job that will never be processed. The user sees a 500 error but the DB shows a job stuck at QUEUED forever.
- **Fix:** Wrap in try/catch with cleanup: if blob upload fails, delete the DB rows (or make the blob upload first per AC3). If enqueue fails, delete the blob and mark the job FAILED. Alternatively, accept eventual consistency and add a background cleanup job for stale QUEUED jobs.

### 3. `uploadedAt` in queue message uses current time, not Statement's `uploadedAt`
- **Source:** edge+acceptance
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/api/statements/upload/route.ts` (line 78)
- **Detail:** AC4 specifies: "`uploadedAt` is the Statement's `uploadedAt` as ISO string." The implementation uses `new Date().toISOString()` which is the current time at enqueue, not the Statement row's `uploadedAt` (set by Prisma's `@default(now())`). These are typically milliseconds apart but are not the same value. If the DB and application server clocks drift, or if there's latency between DB write and enqueue, they diverge.
- **Fix:** Read `statement.uploadedAt` from the created Statement record and pass it to `enqueueStatementJob`. Requires the `withRLS` transaction to return the Statement's `uploadedAt`.

### 4. Filename not sanitized before use in blob path
- **Source:** blind
- **Severity:** LOW
- **File:** `apps/web/src/lib/azure-blob.ts` (line 42)
- **Detail:** `file.name` from the multipart upload is used directly in the blob path: `` `${userId}/${statementId}/${filename}` ``. While Azure Blob Storage treats paths as flat (no directory traversal), filenames with null bytes, extremely long names, unicode control characters, or characters like `?#` could cause issues with URL parsing downstream (the worker parses blob URLs to extract blob names). A filename like `test.csv?x=1` creates a blob whose URL is ambiguous.
- **Fix:** Sanitize the filename: strip path separators, limit length, remove URL-unsafe characters. Or use a generated name (e.g., `statement.csv`) since the original filename is stored in the DB.

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 5. No rate limiting on upload endpoint
- **Source:** blind
- **Detail:** Authenticated users can upload unlimited files with no throttle. A compromised or malicious account can fill Azure Blob Storage and create thousands of queue jobs. Rate limiting is typically infrastructure-level (Azure Front Door / WAF).

### 6. CSV content not validated — only extension checked
- **Source:** blind+edge
- **Detail:** The upload validates `.csv` extension and ≤10MB size but doesn't check whether the content is actually valid CSV. A user can upload a 10MB binary file renamed to `.csv`. The worker will fail during parsing and mark the job FAILED, but the blob is uploaded and queue message sent first, wasting resources.

### 7. No virus/malware scanning on uploaded files
- **Source:** blind
- **Detail:** Uploaded CSV files are stored in Azure Blob Storage without scanning. A malicious CSV could contain formulas (CSV injection) that execute when opened in Excel. The system only parses CSV content server-side (not in a browser), so the direct risk is low, but if users later download their uploaded files, the risk increases. Azure Defender for Storage or ClamAV scanning would mitigate this.

### 8. `AZURE_STORAGE_CONNECTION_STRING` creates new client on every call
- **Source:** edge
- **Detail:** Both `azure-blob.ts` and `azure-queue.ts` call `getBlobServiceClient()` / `getQueueServiceClient()` on every invocation, creating a new client from the connection string each time. Azure SDK clients are designed to be reused (connection pooling). For low-volume uploads this is fine, but at scale it creates unnecessary connection churn.

### 9. No CSRF protection on upload endpoint
- **Source:** blind
- **Detail:** Same systemic pattern as Stories 1.3–1.5. `SameSite` cookie setting provides meaningful defense. Custom header check would close the gap. Should be addressed across all API routes.

---

## Rejected Findings (6)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- Path traversal via filename in Azure Blob Storage — Azure Blob uses flat namespace; `../` is a literal blob name character, not directory traversal
- `formData.get("file")` could return string instead of File — checked with `instanceof File` at line 26; handled correctly
- `Buffer.from(await file.arrayBuffer())` loads entire file into memory — acceptable for 10MB limit; streaming would be premature optimization
- No `Content-Type` header check on the request — `formData()` parsing handles this; malformed requests caught by try/catch
- Empty file validation (size === 0) not in spec — spec says "≤10MB" which technically includes 0; the extra check is a UX improvement, not a violation
- `createIfNotExists()` called on every upload — idempotent and documented; Azure SDK handles this efficiently

---

## Priority Actions Before Merge

1. **Finding #1 (HIGH):** Reorder operations to upload blob before creating DB records, matching AC3 spec.
2. **Finding #2 (HIGH):** Add error handling/cleanup for the multi-step pipeline.
3. **Finding #3 (MEDIUM):** Use Statement's `uploadedAt` from DB instead of `new Date()` in queue message.