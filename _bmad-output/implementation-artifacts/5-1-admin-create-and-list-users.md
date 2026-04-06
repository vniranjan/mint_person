# Story 5.1: Admin — Create & List Users

**Status:** done
**Epic:** 5 — Platform Administration
**Created:** 2026-04-03

---

## Story

As an administrator, I want to create new user accounts and view a list of all users with their operational metrics, so that I can onboard new users and monitor platform usage without accessing anyone's financial data.

---

## Acceptance Criteria

**AC1 — Users table**: `/admin` shows Email | Last Login | Status (Active/Inactive) | Storage Used (statement count); [New User] primary button present; `GET /api/admin/users` never joins transactions, statements, or correction_logs tables.

**AC2 — Create User form**: Email | Temporary Password (show/hide toggle) | Confirm Password | [Create User] primary | [Cancel] secondary; labels always visible.

**AC3 — Successful creation**: `POST /api/admin/users` creates user with `role: USER`, bcrypt cost 12; new row appears with Status: Active, Last Login: Never; toast "User created — tenant provisioned".

**AC4 — Duplicate email**: Inline error "A user with this email already exists"; no row created.

**AC5 — Empty state**: "No users yet. Create the first account." with [New User] visible.

---

## Tasks

- [x] Add `requireAdmin()` helper to `middleware-helpers.ts`
- [x] Create `GET /api/admin/users` — list users, no financial data joins
- [x] Create `POST /api/admin/users` — create user, bcrypt cost 12
- [x] Create `/admin` page (server component — ADMIN role guard)
- [x] Create `AdminClient` — users table, new user button, create dialog
- [x] Create `CreateUserDialog` — form with email/password/confirm, show/hide toggle
- [x] Add "Admin" nav link to app layout (ADMIN users only)
