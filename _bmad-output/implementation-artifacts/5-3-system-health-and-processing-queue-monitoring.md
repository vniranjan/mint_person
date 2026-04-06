# Story 5.3: System Health & Processing Queue Monitoring

**Status:** done
**Epic:** 5 — Platform Administration
**Created:** 2026-04-03

---

## Story

As an administrator, I want to monitor the health of the application and the statement processing queue, so that I can detect and respond to issues before they affect users.

---

## Acceptance Criteria

**AC1 — Health section**: Shows App container status | Worker container status | Queue depth | Failed jobs in last 24h.

**AC2 — Health API**: `GET /api/admin/health` returns `{ "data": { "app": "ok", "worker": "ok"|"unknown", "queueDepth": N, "failedJobsLast24h": N } }` within 200ms; returns HTTP 403 for non-admin users.

**AC3 — Failed jobs list**: Failed jobs show statementId | user email | failure timestamp | errorMessage; no financial data.

**AC4 — Container health**: App = "ok" (self-report since responding); Worker = ping `WORKER_HEALTH_URL` env var, fallback "unknown"; no secrets or financial data in logs.

---

## Tasks

- [x] Create `GET /api/admin/health` — app/worker status, queue depth, failed jobs last 24h
- [x] Create `HealthSection` component — status cards + failed jobs table
- [x] Wire HealthSection into AdminClient
