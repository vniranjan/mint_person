# Story 1.5: Account Deletion & Full Data Purge

**Status:** review
**Epic:** 1 — Foundation, Infrastructure & Authentication
**Created:** 2026-03-27

---

## Story

As a user,
I want to permanently delete my account and all associated data,
So that I have full control over my personal information and can exercise my right to be forgotten.

---

## Acceptance Criteria

**AC1 — Confirmation dialog:**
Given I am on `/settings`, when I click "Delete account", a confirmation Dialog appears with the text "Delete your account? This will permanently remove all your transactions, statements, and history. This cannot be undone." and two buttons: [Cancel] and [Delete account] (destructive red styling).

**AC2 — Deletion cascade:**
Given I confirm deletion, the `users` row is deleted; cascade deletes automatically remove all `statements`, `transactions`, `correction_logs`, `job_status`, and `password_reset_tokens` rows; the current session cookie is cleared; I am redirected to `/login`.

**AC3 — Zero rows after deletion:**
Given the deletion is confirmed, when the database is inspected, zero rows exist for that `userId` across `statements`, `transactions`, `correction_logs`, `job_status`, and `password_reset_tokens` tables.

**AC4 — Settings page accessible:**
Given I am authenticated, I can navigate to `/settings` via a link in the app header. The page shows a "Danger zone" section with the delete account button.

---

## Tasks

- [x] **Task 1: Create account deletion API route** (AC: 2, 3)
  - [x] Create `apps/web/src/app/api/account/route.ts` — `DELETE` handler only
  - [x] Verify authenticated session with `await auth()`; return 401 if missing
  - [x] `prisma.user.delete({ where: { id: session.user.id } })` — cascade handles all child rows
  - [x] Return 200 `{ data: { message: "Account deleted" } }`

- [x] **Task 2: Create settings page with delete confirmation dialog** (AC: 1, 2, 4)
  - [x] Create `apps/web/src/app/(app)/settings/page.tsx`
  - [x] "Danger zone" section with heading and description text
  - [x] "Delete account" button (red/destructive styling) that opens a shadcn `Dialog`
  - [x] Dialog content: title "Delete your account?", body text matching AC1, [Cancel] and [Delete account] buttons
  - [x] On confirm: `DELETE /api/account` → on 200: `signOut({ redirect: false })` then `router.push("/login")`
  - [x] Loading spinner on the [Delete account] button during in-flight request
  - [x] On error: show error message inside dialog; keep dialog open

- [x] **Task 3: Add Settings link to app header** (AC: 4)
  - [x] Update `apps/web/src/app/(app)/layout.tsx` — add "Settings" link in the nav header
  - [x] Link to `/settings`

- [x] **Task 4: Add /settings to middleware matcher** (AC: 4)
  - [x] Update `apps/web/src/middleware.ts` — add `/settings/:path*` to the matcher array

- [x] **Task 5: Write integration tests** (AC: 2, 3)
  - [x] Create `apps/web/src/__tests__/account-delete.test.ts`
  - [x] Add `"test:account"` script to `package.json`
  - [x] Tests: authenticated DELETE returns 200, user row removed, all child rows cascade-deleted, unauthenticated DELETE returns 401

---

## Dev Notes

### CRITICAL: Cascade Delete Is Already in Schema

All application models have `onDelete: Cascade` referencing `User`. When `prisma.user.delete()` runs, PostgreSQL automatically removes:
- `statements` (via FK `userId → users.id CASCADE`)
- `transactions` (via FK `userId → users.id CASCADE`)
- `correction_logs` (via FK `userId → users.id CASCADE`)
- `job_status` (via FK `userId → users.id CASCADE`)
- `password_reset_tokens` (via FK `userId → users.id CASCADE` — added in Story 1.4)
- `sessions` (via FK `userId → users.id CASCADE` — NextAuth sessions)
- `accounts` (via FK `userId → users.id CASCADE` — NextAuth accounts)

**No additional deletion logic is needed** — a single `prisma.user.delete()` handles everything.

### CRITICAL: API Route Pattern

```typescript
// apps/web/src/app/api/account/route.ts
import { auth } from "~/lib/auth";
import { prisma } from "~/lib/db";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 },
    );
  }

  await prisma.user.delete({ where: { id: session.user.id } });

  return NextResponse.json({ data: { message: "Account deleted" } }, { status: 200 });
}
```

Note: `auth()` is from `~/lib/auth` (server-side), NOT from `next-auth/react`. The API route is a server route — use the server `auth()` function.

No `withRLS()` needed here — the `users` table has no RLS policy (only `statements`, `transactions`, `correction_logs`, `job_status` have RLS). We are deleting by the authenticated user's own id.

Do NOT import `NextRequest` — this route has no request body to parse, so the handler takes no parameters. The `DELETE` function signature is just `export async function DELETE()`.

### CRITICAL: Sign Out After Deletion

After the `DELETE /api/account` API responds 200, the client must clear the session cookie. The `sessions` table row is already gone (cascade deleted with the user), but the browser still has the session cookie.

```typescript
// In the client component (settings page):
import { signOut } from "next-auth/react";

const res = await fetch("/api/account", { method: "DELETE" });
if (res.ok) {
  // Clear the session cookie — redirectTo is ignored since session is gone
  await signOut({ redirect: false });
  router.push("/login");
}
```

`signOut({ redirect: false })` from `next-auth/react` will call NextAuth's signout endpoint which clears the cookie — even if the session DB row is gone, the cookie clearing still works.

### CRITICAL: Dialog Component

Use the shadcn `Dialog` component (already installed). Pattern:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
  <DialogTrigger asChild>
    <Button variant="destructive">Delete account</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete your account?</DialogTitle>
      <DialogDescription>
        This will permanently remove all your transactions, statements, and
        history. This cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setDialogOpen(false)}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete account"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

The shadcn Dialog is in `~/components/ui/dialog`. Check what's exported — it should include `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `DialogTrigger`.

### Settings Page Layout

The settings page is under `(app)/` so it has the auth guard and nav header from `(app)/layout.tsx`. It's a server component since it doesn't need client state itself — the dialog interaction is handled in a separate client component.

Split into:
- `apps/web/src/app/(app)/settings/page.tsx` — server page (minimal, just renders the form)
- `apps/web/src/app/(app)/settings/DeleteAccountSection.tsx` — client component with dialog + delete logic

```tsx
// page.tsx (server component — no "use client")
import DeleteAccountSection from "./DeleteAccountSection";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Settings</h1>
        <p className="mt-1 text-sm text-stone-500">Manage your account preferences.</p>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-sm text-red-700">
          Permanently delete your account and all associated data.
        </p>
        <div className="mt-4">
          <DeleteAccountSection />
        </div>
      </div>
    </div>
  );
}
```

### Update App Header (layout.tsx)

The current `(app)/layout.tsx` shows only "mint" and "Sign out". Add a "Settings" link:

```tsx
<nav className="flex items-center gap-4">
  <Link href="/settings" className="text-sm text-stone-500 hover:text-stone-900">
    Settings
  </Link>
  <form action={...}>
    <button type="submit" ...>Sign out</button>
  </form>
</nav>
```

Read the current file before editing so you don't break the sign-out server action pattern.

### Middleware Matcher

The current `middleware.ts` matches `/dashboard/:path*`, `/statements/:path*`, `/admin/:path*`. Add `/settings/:path*`:

```typescript
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/statements/:path*",
    "/admin/:path*",
    "/settings/:path*",
  ],
};
```

### Test Pattern

Tests call the DELETE handler directly. The challenge is that `auth()` is called inside the handler — in tests, there's no real session. Use a workaround: create a real user and session in the DB, then mock `auth()` to return that session.

However, mocking `auth()` in Vitest requires module mocking. A simpler approach is to test through the raw DB operations: verify that deleting a user in Prisma cascades correctly. The API route itself just calls `prisma.user.delete`, so the key behavior to test is:

1. **Auth check** — call DELETE with no session → 401 (need to mock `auth()`)
2. **Cascade delete** — insert user + child rows → delete user → verify child rows gone

For integration tests, mock `auth()` in the test file:

```typescript
import { vi } from "vitest";

// Mock the auth module
vi.mock("~/lib/auth", () => ({
  auth: vi.fn(),
  // other exports if needed
}));

import { auth } from "~/lib/auth";
const mockAuth = vi.mocked(auth);

// In test:
mockAuth.mockResolvedValue({ user: { id: userId, email: "..." } } as Session);
```

Actually, in the context of these integration tests hitting a real DB but mocking auth, the pattern works fine with Vitest's `vi.mock`. The important thing is the cascade behavior is tested against the real DB.

---

## Learnings from Previous Stories

**From Story 1.3 & 1.4:**
- `auth()` is server-side from `~/lib/auth`; `signOut` on client is from `next-auth/react`
- `import { type NextRequest, NextResponse }` — type-only NextRequest import (ESLint rule)
- When the route takes no request body, use `export async function DELETE()` with no parameters
- API response shape: `{ data: ... }` / `{ error: { code, message } }` always
- Dialog component from `~/components/ui/dialog` — already installed in Story 1.1
- `"use client"` only on components that need React state/hooks; server components are the default

**From Story 1.2 (cascade verification):**
- The RLS isolation test pattern verifies cross-table data — reuse that DELETE + check pattern
- Raw SQL via `prisma.$executeRaw` for setup; Prisma client for verification

---

## Architecture Compliance

- **Cascade deletes:** Handled at DB layer (FK ON DELETE CASCADE) — no application-level loop
- **Auth:** `auth()` server-side for API routes; `signOut` client-side for cookie clearing
- **No new dependencies** — shadcn Dialog already installed; no new packages needed
- **File locations:** All under `apps/web/src/` — no changes to `apps/worker/`
- **No schema changes** — cascade already designed in Stories 1.2 and 1.4

---

## Definition of Done

- [x] `DELETE /api/account` with valid session returns 200 and deletes user + all child data
- [x] `DELETE /api/account` without session returns 401
- [x] Settings page accessible at `/settings` with danger zone section and confirmation dialog
- [x] After deletion, session cookie cleared and user redirected to `/login`
- [x] `npm run typecheck` passes with no new errors
- [x] `npm run test:account` passes
- [x] `npm run test:rls` still passes (no regressions)

---

## Dev Agent Record

**Completed by:** Claude (dev-story workflow)
**Completed:** 2026-03-27

### Implementation Notes

- **Cascade delete**: Single `prisma.user.delete()` triggers PostgreSQL FK cascades on all 7 related tables. No application-level loops needed.
- **Mock typing**: `auth` in NextAuth v5 is overloaded (middleware + session function). Cast to `{ mockResolvedValue: (v: any) => void }` avoids complex type gymnastics while keeping tests typesafe for Vitest's `vi.mock`.
- **Server action in layout**: The sign-out server action pattern from Story 1.3 was preserved unchanged in layout.tsx.
- **Settings at root**: `/settings` is a top-level route under `(app)/` — no path nesting needed, just `/settings` in middleware matcher.

### File List

**Modified:**
- `apps/web/src/app/(app)/layout.tsx` — added Link import + Settings nav link
- `apps/web/src/middleware.ts` — added `/settings/:path*` to matcher
- `apps/web/package.json` — added `test:account` script

**Created:**
- `apps/web/src/app/api/account/route.ts` — DELETE handler
- `apps/web/src/app/(app)/settings/page.tsx` — server page with danger zone section
- `apps/web/src/app/(app)/settings/DeleteAccountSection.tsx` — client component with Dialog
- `apps/web/src/__tests__/account-delete.test.ts` — 4 integration tests

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-27 | 1.0 | Story created | SM Agent |
| 2026-03-27 | 1.1 | Implementation complete; status → review | Dev Agent |
