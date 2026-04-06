# Code Review Report — Story 5.1: Admin — Create & List Users

**Reviewed:** 2026-04-06
**Layers:** Blind Hunter · Edge Case Hunter · Acceptance Auditor

---

## Patch — fix before merge

### 1. TOCTOU race on duplicate email creation [HIGH]
**File:** `apps/web/src/app/api/admin/users/route.ts:86–98`
**Finding:** `findUnique` followed by `create` is not atomic. Two concurrent POST requests with the same email can both pass the existence check. If the DB has a unique constraint the second throws an unhandled Prisma P2002 error (500 instead of 409). If no constraint exists, a duplicate row is created.
**Fix:** Wrap the create in a try-catch that maps Prisma `P2002` to a 409 response, or use a `$transaction` with serializable isolation.

---

## Defer — tech debt / hardening

### 2. No pagination on GET /api/admin/users [MEDIUM]
**File:** `apps/web/src/app/api/admin/users/route.ts:20–32`
**Finding:** `prisma.user.findMany` with no `take`/`skip` returns all users. At scale this will cause memory and latency issues.
**Recommendation:** Add `take: 100` default with cursor-based pagination when user count grows.

---

## Rejected — not a defect or out of scope

| # | Finding | Reason |
|---|---------|--------|
| R1 | Email regex overly permissive (`a@b.c` accepted) | Standard web validation; DB unique constraint prevents garbage at scale |
| R2 | No password complexity beyond 8-char minimum | Spec says temporary password ≥ 8 chars; forced-change-on-first-login is a separate feature |
| R3 | No CSRF protection on POST | Next.js + SameSite session cookies is the standard defense; no cross-origin fetch succeeds |
| R4 | Admin routes bypass RLS (use `prisma` not `withRLS`) | Intentional — admin queries span all tenants; `requireAdmin()` is the guard |
| R5 | Plaintext password in JS memory during bcrypt | Standard for all server-side web frameworks; not practically exploitable |
| R6 | No client-side duplicate email pre-check | Server handles conflict; client debounce is UX polish, not a defect |

---

## Acceptance Criteria Verdicts

| AC | Verdict | Notes |
|----|---------|-------|
| AC1 — Users table | **PASS** | Email, Last Login, Status (Active/Inactive), Uploads (statement count) columns. New User button present. GET uses `_count` subquery — never joins transactions/statements/correction_logs. Column label is "Uploads" vs spec "Storage Used" — data matches, label is a minor deviation. |
| AC2 — Create User form | **PASS** | Email, Temporary Password (show/hide), Confirm Password (show/hide), Create User, Cancel. Labels always visible via `<label>` elements. |
| AC3 — Successful creation | **PASS** | POST creates with `role: "USER"`, `bcryptjs.hash(password, 12)`. Returns 201. Toast "User created — tenant provisioned". Row appears with Active status, Last Login: Never. |
| AC4 — Duplicate email | **PASS** | 409 triggers inline error "A user with this email already exists". No row created. |
| AC5 — Empty state | **PASS** | "No users yet. Create the first account." with New User button. |
