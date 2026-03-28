# Code Review Report — Story 2-3: Job Progress Polling & Upload Pipeline UI

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/2-3-job-progress-polling-and-upload-pipeline-ui.md`
**Scope:** 6 files (5 created, 1 rewritten), ~400 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **8** |
| Defer      | **4** |
| Rejected   | **8** |

**Acceptance Auditor verdict:** AC1 PASS. AC2 PARTIAL (invalidateQueries called repeatedly from refetchInterval callback). AC3 PARTIAL (prop name `onUploadStart` instead of `onUploadComplete`). AC4 PASS. AC5 PARTIAL (dashboard doesn't check for existing statements — always shows same layout).

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. `onFinished` called during render — violates React rules, causes redundant state updates
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/components/upload-pipeline.tsx` (lines 45–47)
- **Detail:** The `onFinished` callback is called directly in the render function body:
  ```typescript
  if (isDone && onFinished) {
    onFinished(stage as "COMPLETE" | "FAILED");
  }
  ```
  This runs on every render when `isDone` is true. `onFinished` calls `setFinishedStage` in the parent (`DashboardClient` or `StatementsClient`), which triggers a parent re-render, which re-renders `UploadPipeline`, which calls `onFinished` again. React's state batching prevents an infinite loop in practice, but this violates React's rule against side effects during render and causes unnecessary re-renders.
- **Fix:** Move the `onFinished` call into a `useEffect`:
  ```typescript
  useEffect(() => {
    if (isDone && onFinished) {
      onFinished(stage as "COMPLETE" | "FAILED");
    }
  }, [isDone, stage, onFinished]);
  ```

### 2. `invalidateQueries` called repeatedly from `refetchInterval` callback
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/hooks/use-job-status.ts` (lines 28–36)
- **Detail:** The `refetchInterval` callback is invoked by TanStack Query on every poll cycle to determine the next interval. When stage is `COMPLETE`, the callback calls `queryClient.invalidateQueries({ queryKey: ["statements"] })` and returns `false`. However, TanStack Query may call this function multiple times before the query is fully disabled (e.g., during React re-renders). Each invocation fires another `invalidateQueries`, potentially triggering cascading refetches of the statements list.
- **Fix:** Move the `invalidateQueries` call into a `useEffect` that watches the stage:
  ```typescript
  const stage = data?.data?.stage;
  useEffect(() => {
    if (stage === "COMPLETE") {
      void queryClient.invalidateQueries({ queryKey: ["statements"] });
    }
  }, [stage, queryClient]);
  ```
  Keep the `refetchInterval` callback as a pure function that only returns `false` or `2000`.

### 3. Integration tests completely missing — Task 6 not implemented
- **Source:** acceptance
- **Severity:** HIGH
- **File:** `apps/web/src/__tests__/job-status.test.ts` (missing)
- **Detail:** Task 6 requires creating `job-status.test.ts` with 3 tests (200 for valid job, 404 for nonexistent, 401 for unauthenticated) and a `"test:jobs"` script in `package.json`. Neither the test file nor the script exist. The Definition of Done includes "Integration tests for job status API pass."
- **Fix:** Create `apps/web/src/__tests__/job-status.test.ts` following the same pattern as `statements-upload.test.ts`. Add `"test:jobs"` script to `apps/web/package.json`.

### 4. `UploadDropZone` prop named `onUploadStart` instead of spec's `onUploadComplete`
- **Source:** acceptance
- **Severity:** MEDIUM
- **File:** `apps/web/src/components/upload-drop-zone.tsx` (line 9)
- **Detail:** AC3 specifies: "calls `onUploadComplete(jobId)` prop after POSTing." The implementation uses `onUploadStart: (jobId: string, statementId: string) => void` — different name and different arity (2 args vs 1). The name `onUploadStart` is semantically misleading — by the time this callback fires, the upload POST has already completed successfully. Consumers (`DashboardClient.handleUploadStart`, `StatementsClient.handleUploadStart`) only accept 1 arg, so `statementId` is silently dropped.
- **Fix:** Rename to `onUploadComplete` with a single `jobId` parameter to match the spec. If `statementId` is needed downstream, pass it as a separate prop or return an object.

### 5. Dashboard doesn't check for existing statements — no `hasStatements` differentiation
- **Source:** acceptance
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/(app)/dashboard/page.tsx`, `apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx`
- **Detail:** AC5 says: "No prior statements and no active job → full-page centered UploadDropZone." The spec Dev Notes show `DashboardPage` doing a server-side `withRLS` count and passing `hasStatements` to `DashboardClient`. The implementation has `DashboardPage` as a thin shell that passes no props, and `DashboardClient` always shows the same layout (card-wrapped upload zone) regardless of whether the user has prior statements. A new user sees the same view as a returning user.
- **Fix:** Update `dashboard/page.tsx` to query statement count server-side and pass `hasStatements` prop. Update `DashboardClient` to conditionally render full-page centered drop zone vs. compact layout.

### 6. `UploadPipeline` spec requires `onComplete` prop but implementation uses `onFinished`
- **Source:** acceptance
- **Severity:** LOW
- **File:** `apps/web/src/components/upload-pipeline.tsx` (line 10)
- **Detail:** The spec Dev Notes show `UploadPipeline` with an `onComplete` callback. The implementation uses `onFinished` which fires for both COMPLETE and FAILED. This is arguably better (handles both terminal states), but deviates from the spec interface. The spec's `DashboardClient` example calls `onComplete={() => setIsComplete(true)}`.
- **Fix:** Either rename to match spec, or document the deviation. The `onFinished` approach is more complete but consumers must handle both states.

### 7. Concurrent uploads possible via drag-and-drop — `onDrop` not guarded by uploading state
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/components/upload-drop-zone.tsx` (lines 98–103, 123)
- **Detail:** The click handler is guarded: `onClick={isUploading ? undefined : openFilePicker}`. However, `onDrop` is not guarded by the uploading state. A user can drop a second file while the first upload is in-flight. `handleDrop` calls `uploadFile` regardless of `dropState`. This starts a concurrent upload; whichever completes last wins (overwriting `activeJobId` via `onUploadStart`), potentially orphaning the first job.
- **Fix:** Guard `handleDrop` against the uploading state:
  ```typescript
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (dropState === "uploading") return;
    // ...
  }
  ```

### 8. No client-side file validation for drag-and-drop — `accept=".csv"` only applies to file picker
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/components/upload-drop-zone.tsx` (lines 98–103)
- **Detail:** The `accept=".csv"` attribute on the hidden `<input>` only filters the file picker dialog. It does not apply to drag-and-drop. A user can drag a `.pdf`, `.xlsx`, or oversized file onto the drop zone and the component will POST it directly to the server without any client-side validation. The server validates and returns 400, but the upload round-trip is wasted and the UX is poor (shows "Uploading…" then an error).
- **Fix:** Add client-side validation in `uploadFile` before the fetch:
  ```typescript
  if (!file.name.toLowerCase().endsWith('.csv')) {
    setError("Only CSV files are supported.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setError("File exceeds the 10 MB limit.");
    return;
  }
  ```

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 9. Job status polling has no exponential backoff or max retry
- **Source:** blind+edge
- **Detail:** `useJobStatus` polls every 2 seconds indefinitely until COMPLETE or FAILED. If the worker crashes and never updates the job, the client polls forever. There's no timeout, backoff, or max attempt count. After some threshold (e.g., 5 minutes), the UI should show a "taking longer than expected" message and reduce polling frequency.

### 10. Job ID in URL path is user-controlled — enumeration risk
- **Source:** blind
- **Detail:** `GET /api/jobs/[id]/status` takes a job ID from the URL. The `withRLS` + `findFirst({ where: { id, userId } })` prevents cross-tenant access (returns 404), but an attacker can probe job IDs to determine if they exist for other users (timing difference between found-but-wrong-user and not-found). Low risk given CUID identifiers.

### 11. No loading/error state in `UploadPipeline` when fetch fails
- **Source:** edge
- **Detail:** `UploadPipeline` reads `isError` from `useJobStatus` (line 38) and hides the progress bar when true (line 86), but shows no error message to the user. A network failure during polling silently freezes the progress display at the last known stage.

### 12. `UploadDropZone` doesn't prevent uploading during active job
- **Source:** edge
- **Detail:** The drop zone remains interactive while a job is processing (in `DashboardClient`, it's hidden when `activeJobId` is set, but in `StatementsClient` it's always visible). A user can start a second upload while the first is still processing. Both jobs will process independently, which is technically fine but could confuse users.

---

## Rejected Findings (8)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- No CSRF protection on job status GET — read-only endpoint, no state mutation; session cookie with SameSite provides sufficient protection
- `res.json()` called without Content-Type check in `useJobStatus` — internal API always returns JSON; non-JSON responses would throw and be caught by TanStack Query error handling
- Progress bar values are fixed per stage instead of calculated — spec says "indeterminate for READING, 0→100% for CATEGORIZING"; fixed percentages per stage is a reasonable simplification
- `UploadDropZone` uses state machine (`DropState`) instead of spec's separate `isDragOver`/`isUploading` booleans — single state enum prevents impossible states; better design
- `handleDrop` and `handleFileChange` are async event handlers — React handles async event handlers correctly; no risk of unhandled rejections
- No file type icon or preview in drop zone — UX enhancement not in spec
- `aria-busy` attribute on drop zone during upload — not in spec but improves accessibility; enhancement, not deviation
- `dragleave` fires on child elements causing border flicker — standard browser behavior; can be mitigated with `e.currentTarget.contains(e.relatedTarget)` but is cosmetic, not functional

---

## Priority Actions Before Merge

1. **Finding #1 (HIGH):** Move `onFinished` call into a `useEffect` to avoid side effects during render.
2. **Finding #2 (HIGH):** Move `invalidateQueries` into a `useEffect` watching stage, remove side effect from `refetchInterval`.
3. **Finding #3 (HIGH):** Create the missing `job-status.test.ts` integration tests.
4. **Finding #4 (MEDIUM):** Rename `onUploadStart` to `onUploadComplete` with single `jobId` arg per spec.
5. **Finding #5 (MEDIUM):** Add server-side statement count check to dashboard page.
6. **Finding #7 (MEDIUM):** Guard `handleDrop` against uploading state to prevent concurrent uploads.
7. **Finding #8 (MEDIUM):** Add client-side file type/size validation for drag-and-drop paths.