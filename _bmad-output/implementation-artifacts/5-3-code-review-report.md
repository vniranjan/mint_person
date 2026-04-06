# Code Review Report — Story 5.3: System Health & Processing Queue Monitoring

**Reviewed:** 2026-04-06
**Layers:** Blind Hunter · Edge Case Hunter · Acceptance Auditor

---

## Patch — fix before merge

### 1. failedJobsLast24h underreports when > 50 failures [MEDIUM]
**File:** `apps/web/src/app/api/admin/health/route.ts:61–75,90`
**Finding:** `failedJobsLast24h` is set to `failedJobs.length`, which is capped at `take: 50`. If there are 200 failed jobs in 24h, the API reports 50. The KPI card becomes misleading — admins think there are 50 failures when there are actually 200.
**Fix:** Run a separate `prisma.jobStatus.count({ where: { stage: "FAILED", updatedAt: { gte: since } } })` for the count, independent of the `take: 50` list query.

### 2. Queue unavailability silently reports depth as 0 [MEDIUM]
**File:** `apps/web/src/app/api/admin/health/route.ts:48–57`
**Finding:** When Azure Storage is unreachable (bad connection string, network issue), the catch block swallows the error and returns `queueDepth: 0`. Admins see "0 messages" when the queue is actually unknown/unreachable. This masks outages.
**Fix:** Return `queueDepth: null` (or add a `queue: "ok" | "unknown"` status) when the queue is unreachable, and render a warning badge in the UI.

---

## Bad Spec — spec requirement conflicts with implementation constraints

### 3. 200ms SLA conflicts with 3-second worker health timeout [MEDIUM]
**File:** `apps/web/src/app/api/admin/health/route.ts:38`
**Finding:** AC2 requires the health endpoint to return "within 200ms". The worker health ping uses `AbortSignal.timeout(3000)` — a 3-second timeout. If the worker is slow or unreachable, the endpoint will take up to 3 seconds, well beyond the 200ms SLA.
**Resolution:** Either lower the worker timeout to ~150ms (risks false "unknown"), move the worker ping to a background polling job with cached status, or revise the spec SLA to acknowledge the worker timeout.

---

## Defer — tech debt / hardening

### 4. Error messages in failed jobs may leak internal details [MEDIUM]
**File:** `apps/web/src/app/api/admin/health/route.ts:70,82` / `apps/web/src/app/(app)/admin/_components/health-section.tsx:131`
**Finding:** `errorMessage` from `jobStatus` is returned verbatim and displayed in the admin UI. Stack traces, connection strings, or internal file paths stored in error messages would be exposed. The UI has `max-w-xs truncate` but the full string is in the DOM.
**Recommendation:** Truncate error messages server-side (e.g., 200 chars) and consider sanitizing known-sensitive patterns before returning.

---

## Rejected — not a defect or out of scope

| # | Finding | Reason |
|---|---------|--------|
| R1 | SSRF via WORKER_HEALTH_URL env var | Env vars are set by ops/infrastructure, not user-controlled. Attacker would need CI/CD compromise — out of scope for app-level review |
| R2 | Health endpoint leaks user emails in failed job data | Admin-gated; email is an operational identifier needed for triage. Spec AC3 explicitly requires "user email" |
| R3 | QueueServiceClient instantiated per-request | Azure SDK handles connection pooling internally; no resource leak |
| R4 | Queue depth value unbounded (could show 1M) | A single integer renders fine; no memory concern. UI could add a "999+" cap as polish |

---

## Acceptance Criteria Verdicts

| AC | Verdict | Notes |
|----|---------|-------|
| AC1 — Health section | **PASS** | Four status cards: App Container, Worker Container, Queue Depth, Failed Jobs (24h). Polls every 60s via `refetchInterval`. |
| AC2 — Health API | **PARTIAL** | Response shape `{ data: { app, worker, queueDepth, failedJobsLast24h, failedJobs } }` matches. Returns 403 for non-admin (via `requireAdmin`). However, 200ms SLA is at risk — worker health timeout is 3s (see Bad Spec #3). |
| AC3 — Failed jobs list | **PASS** | Table shows User email, Statement ID (truncated), Failed At timestamp, Error message. No financial data exposed. |
| AC4 — Container health | **PASS** | App = "ok" (self-report). Worker = `fetch(WORKER_HEALTH_URL)` with 3s timeout, fallback "unknown". No secrets or financial data in response. |
