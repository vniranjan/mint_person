# Code Review Report — Story 5.2: Admin — Deactivate & Delete Users

**Reviewed:** 2026-04-06
**Layers:** Blind Hunter · Edge Case Hunter · Acceptance Auditor

---

## Patch — fix before merge

### 1. TOCTOU race allows deleting the last admin [CRITICAL]
**File:** `apps/web/src/app/api/admin/users/[id]/route.ts:134–152`
**Finding:** The admin count check (`prisma.user.count`) and `prisma.user.delete` are separate queries with no transaction. Two concurrent DELETE requests for the last two admins can both pass `adminCount <= 1`, then both delete, leaving zero admins and permanent lockout.
**Fix:** Wrap the count check and delete in `prisma.$transaction()` with serializable isolation, or use a raw SQL `DELETE ... WHERE (SELECT count(*) FROM "User" WHERE role='ADMIN') > 1`.

### 2. Session deletion and isActive update are not atomic [HIGH]
**File:** `apps/web/src/app/api/admin/users/[id]/route.ts:100–108`
**Finding:** `session.deleteMany` and `user.update` are two separate queries. Between them, the user's sessions are purged but `isActive` is still `true`. A concurrent request could create a new session in that window. Additionally, if the update fails after session deletion, the user is locked out with `isActive: true` — an inconsistent state.
**Fix:** Wrap both operations in `prisma.$transaction()`.

### 3. No guard prevents deactivating the last active admin [HIGH]
**File:** `apps/web/src/app/api/admin/users/[id]/route.ts:82–110`
**Finding:** The DELETE handler has a last-admin guard (`adminCount <= 1`), but the PATCH/deactivate handler does not. An admin can deactivate all other admin accounts, and if self-deactivation isn't blocked, can lock out the entire admin tier. Unlike deletion, deactivation leaves the accounts in the database but prevents all login.
**Fix:** Add an admin-count check before deactivation: if the target user is ADMIN and they are the last active admin, reject the request.

### 4. useState() misuse causes stale data on user selection change [HIGH]
**File:** `apps/web/src/app/(app)/admin/_components/user-detail-panel.tsx:51–58`
**Finding:** `useState(() => { fetch(...) })` abuses the lazy initializer to fire a side effect. While the initializer runs once on mount, it does **not** re-run when the `user` prop changes (component stays mounted, receives new props). Clicking a different user row shows stale `transactionCount` from the previously selected user.
**Fix:** Replace with `useEffect(() => { ... }, [user.id])` to re-fetch when the selected user changes.

---

## Defer — tech debt / hardening

### 5. No UUID validation on route params [MEDIUM]
**File:** `apps/web/src/app/api/admin/users/[id]/route.ts:20,70,123`
**Finding:** The `id` param is passed directly to Prisma without UUID format validation. Prisma returns `null` (→ 404), so no crash occurs, but invalid IDs hit the database unnecessarily. `UUID_REGEX` already exists in `middleware-helpers.ts` but is unused here.
**Recommendation:** Validate `id` against `UUID_REGEX` early and return 400 for malformed IDs.

### 6. Deactivated user may retain API access until auth middleware checks isActive [MEDIUM]
**File:** `apps/web/src/app/api/admin/users/[id]/route.ts:100–108`
**Finding:** Session records are deleted, but if auth middleware only validates session tokens (not `isActive`), the user retains access until their JWT/cookie expires. Effectiveness depends on the auth layer checking `isActive` on every request.
**Recommendation:** Verify that the auth callback in `auth.ts` checks `isActive` on every session validation, not just at login.

---

## Rejected — not a defect or out of scope

| # | Finding | Reason |
|---|---------|--------|
| R1 | User enumeration via 404 on /api/admin/users/:id | Admin-only endpoint; admins already have access to full user list |
| R2 | Reactivate fires without confirmation dialog (deactivate has one) | UX design choice — reactivation is non-destructive, no confirmation needed |
| R3 | Reactivate is idempotent (no-op on already-active user) | Correct behavior; idempotent PATCHes are a REST best practice |
| R4 | DELETE returns 200 instead of 204 | Style preference; response includes a message body, 200 is appropriate |
| R5 | Self-delete FORBIDDEN_RESPONSE spread overwrites error key | The spread `{ ...FORBIDDEN_RESPONSE, error: { ... } }` correctly replaces the error field; produces valid JSON |
| R6 | selectedUser holds stale object after background react-query refetch | Mitigated: `handleUpdated` and `handleDeleted` both call `setSelectedUser(null)` |

---

## Acceptance Criteria Verdicts

| AC | Verdict | Notes |
|----|---------|-------|
| AC1 — User detail | **PASS** | Click row → panel with Uploads, Transactions, Last Login. Amber "Financial data not accessible to admins" notice. Spec says "Last activity date" — implementation uses `lastLoginAt` which is the only activity timestamp tracked. |
| AC2 — Deactivate dialog | **PASS** | Copy: "Deactivate {email}? They will not be able to log in." Cancel + Deactivate destructive. Dialog uses Radix UI which provides Escape dismissal, backdrop click, and focus trapping by default. |
| AC3 — Deactivate action | **PASS** | PATCH sets `isActive: false`, `session.deleteMany` invalidates sessions. Row shows Inactive badge with `opacity-50`. |
| AC4 — Delete dialog | **PASS** | Copy: "Permanently delete {email}? All their transactions, statements, and history will be removed. This cannot be undone." Cancel + Delete destructive. |
| AC5 — Delete action | **PASS** | `prisma.user.delete` cascades all data. Last-admin guard + self-deletion guard. Row removed. Toast "User and all data permanently deleted". |
