# Story 5.2: Admin — Deactivate & Delete Users

**Status:** done
**Epic:** 5 — Platform Administration
**Created:** 2026-04-03

---

## Story

As an administrator, I want to deactivate or permanently delete user accounts, so that I can revoke access and purge data on request.

---

## Acceptance Criteria

**AC1 — User detail**: Clicking a user row shows operational metrics only: Upload count | Transaction count | Last activity date; "Financial data not accessible to admins" label visible.

**AC2 — Deactivate dialog**: "Deactivate [email]? They will not be able to log in." with [Cancel] + [Deactivate] destructive; Escape / backdrop = Cancel; focus trapped.

**AC3 — Deactivate action**: `PATCH /api/admin/users/:id` sets `isActive = false`; all sessions invalidated immediately; row grays out with Inactive badge.

**AC4 — Delete dialog**: "Permanently delete [email]? All their transactions, statements, and history will be removed. This cannot be undone." with [Cancel] + [Delete] destructive.

**AC5 — Delete action**: `DELETE /api/admin/users/:id` cascades to all user data; row removed; toast "User and all data permanently deleted".

---

## Tasks

- [x] Create `GET /api/admin/users/[id]` — operational metrics, no financial data values
- [x] Create `PATCH /api/admin/users/[id]` — deactivate/reactivate + session invalidation
- [x] Create `DELETE /api/admin/users/[id]` — cascade delete with last-admin guard
- [x] Create `UserDetailPanel` — metrics display + deactivate/delete action buttons
- [x] Create `ConfirmDialog` — reusable confirmation dialog (destructive variant)
