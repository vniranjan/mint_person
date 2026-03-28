# Code Review Report — Story 2-5: Statement History & Upload Drop Zone

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/2-5-statement-history-and-upload-drop-zone.md`
**Scope:** 4 files (2 created, 2 modified), ~280 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **4** |
| Defer      | **4** |
| Rejected   | **6** |

**Acceptance Auditor verdict:** AC1 PASS, AC2 PASS, AC3 PASS, AC4 PASS, AC5 PASS, AC6 PASS. All 6 acceptance criteria met. Two architectural deviations: statements page uses client-side fetching instead of server-side; task checkboxes unchecked despite implementation being complete.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. `onFinished` called during render — same issue as Story 2-3
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/components/upload-pipeline.tsx` (lines 45–47)
- **Detail:** Cross-story issue. `StatementsClient` uses `UploadPipeline` with `onFinished={handleJobFinished}`. The `onFinished` callback fires during render (not in a `useEffect`), calling `setFinishedStage` in the parent on every re-render when the job is done. See Story 2-3 Finding #1 for full detail.
- **Fix:** Same as Story 2-3 — move to `useEffect`. Fix in `upload-pipeline.tsx` resolves this for both stories.

### 2. Statements page uses client-side fetching instead of server-side per spec
- **Source:** acceptance
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/(app)/statements/page.tsx`, `apps/web/src/app/(app)/statements/_components/statements-client.tsx`
- **Detail:** Task 2 specifies: "Fetch statements list server-side via `withRLS`" and "If empty → render empty state with full-page `UploadDropZone`." The spec shows `StatementsPage` as an async server component that queries the DB and passes `initialStatements` to the client component. The implementation has `StatementsPage` as a thin shell rendering `<StatementsClient />` with no props, and `StatementsClient` fetches data client-side via TanStack Query `useQuery`. This means: (1) no SSR — the page shows "Loading…" on initial render, (2) an extra network round-trip for the statements list, (3) the empty-state check happens client-side after the fetch instead of server-side.
- **Fix:** Update `statements/page.tsx` to fetch statements server-side via `withRLS` and pass `initialStatements` as a prop to `StatementsClient`. Use TanStack Query's `initialData` option to hydrate the client-side cache.

### 3. `onUploadStart` callback arity mismatch — `statementId` silently dropped
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/components/upload-drop-zone.tsx` (line 9, 90), `apps/web/src/app/(app)/statements/_components/statements-client.tsx` (line 63)
- **Detail:** `UploadDropZone` calls `onUploadStart(body.data.jobId, body.data.statementId)` with 2 arguments. `StatementsClient.handleUploadStart` accepts `(jobId: string)` — 1 argument. JavaScript silently ignores the extra argument. The `statementId` is computed and returned by the upload API but never captured by any consumer. Same issue in `DashboardClient`.
- **Fix:** Either update consumers to accept both arguments (if `statementId` is needed), or remove the second argument from the `onUploadStart` call. Per the spec, the callback should be `onUploadComplete(jobId)` with a single argument.

### 4. Task checkboxes all unchecked despite implementation being complete
- **Source:** acceptance
- **Severity:** LOW
- **File:** `_bmad-output/implementation-artifacts/2-5-statement-history-and-upload-drop-zone.md`
- **Detail:** All task checkboxes are `[ ]` (unchecked) despite the Dev Agent Record confirming implementation is complete. This is a documentation issue — the spec should reflect actual status.
- **Fix:** Update task checkboxes to `[x]`.

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 5. No pagination on `GET /api/statements` — returns all statements
- **Source:** blind+edge
- **Detail:** `statement.findMany` with no `take`/`skip` returns every statement for the user. A power user with hundreds of uploads gets an ever-growing response payload. The statements table currently renders all rows with no virtualization. Should add cursor-based or offset pagination in a future story.

### 6. Statement list shows stale data after upload completes
- **Source:** edge
- **Detail:** `useJobStatus` invalidates `["statements"]` on COMPLETE (from Story 2-3), and `StatementsClient.handleJobFinished` also calls `invalidateQueries` on COMPLETE (line 70–71). This double-invalidation is harmless but the newly uploaded statement may not appear immediately — TanStack Query refetches in the background, and the `initialStatements` prop (if server-side fetching is added per Finding #2) is stale. For reliable updates, the statements query should be managed entirely by TanStack Query (which is how the current client-side implementation works, but it conflicts with the server-side spec).

### 7. `formatDistanceToNow` gives imprecise timestamps for older uploads
- **Source:** edge
- **Detail:** `formatDistanceToNow(new Date(s.uploadedAt), { addSuffix: true })` shows "2 months ago" for older uploads. The spec Dev Notes show `format(new Date(s.uploadedAt), "MMM d, yyyy · h:mm a")` for precise timestamps. The implementation's relative timestamps are less informative for historical data. UX preference, not a bug.

### 8. No error handling for failed statements fetch in `StatementsClient`
- **Source:** blind
- **Detail:** The `isError` state shows "Failed to load statements. Please refresh." but there's no retry button or automatic retry. TanStack Query's default retry behavior (3 retries with exponential backoff) may resolve transient errors, but a persistent failure leaves the user stuck.

---

## Rejected Findings (6)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- `StatementsClient` is a default export, spec shows named export `StatementsClient` — both work; Next.js pages import default exports fine
- No `Separator` component between upload zone and table — implementation uses spacing instead of a visual separator; functionally equivalent
- `toLocaleString()` on transaction count — locale-aware number formatting is a UX improvement, not a deviation
- Statement rows show `—` for non-COMPLETE transaction counts — correct; count is only meaningful after processing completes
- No institution column in table header — institution is shown as subtitle under filename; layout choice, not missing data
- `UploadDropZone` not wrapped in error boundary — upload errors are caught in the component's try/catch; ErrorBoundary would only catch render-time errors which are unlikely

---

## Priority Actions Before Merge

1. **Finding #1 (HIGH):** Fix `onFinished` render-time side effect (shared fix with Story 2-3).
2. **Finding #2 (MEDIUM):** Add server-side data fetching to statements page per spec.
3. **Finding #3 (MEDIUM):** Fix `onUploadStart` callback arity mismatch.