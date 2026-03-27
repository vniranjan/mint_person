# Code Review Report — Story 1-5: Account Deletion & Full Data Purge

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/1-5-account-deletion-and-full-data-purge.md`
**Scope:** 7 files (3 modified, 4 new), ~438 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **3** |
| Defer      | **7** |
| Rejected   | **10** |

**Acceptance Auditor verdict:** All 4 acceptance criteria pass. All 5 task groups verified complete. No spec violations.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Unhandled Prisma error on double-delete / race condition
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/account/route.ts`
- **Detail:** `prisma.user.delete({ where: { id: session.user.id } })` is not wrapped in a try/catch. If the user row is already deleted (double-click, concurrent request from two tabs, stale session), Prisma throws `PrismaClientKnownRequestError` with code `P2025` ("Record to delete does not exist"). This bubbles up as an unhandled 500. The client shows "Failed to delete account. Please try again" — prompting retry of an already-completed deletion.
- **Fix:** Catch `P2025` and return 200 (or 404/410). The user's intent was to be deleted, and they are — treat it as idempotent:
  ```typescript
  try {
    await prisma.user.delete({ where: { id: session.user.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ data: { message: "Account deleted" } }, { status: 200 });
    }
    throw err;
  }
  ```

### 2. Admin can delete their own account — no sole-admin guard
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/account/route.ts`
- **Detail:** The DELETE handler performs no role check. An admin (or the only admin) can navigate to `/settings` and permanently destroy their account. The system loses all administrative access with no recovery path.
- **Fix:** Before deleting, check if the user has `role === "admin"`. If so, count remaining admins. If this is the last admin, return 403 with an error message. Alternatively, block admin self-deletion entirely and require another admin to deactivate/delete.

### 3. `res.json()` parsed without guarding for non-JSON responses
- **Source:** blind+edge
- **Severity:** LOW
- **File:** `apps/web/src/app/(app)/settings/DeleteAccountSection.tsx`
- **Detail:** On error, `const body = (await res.json()) as { error?: { message?: string } }`. If the server returns a non-JSON response (HTML 502 from a proxy, plain-text 500), `res.json()` throws and falls into the outer `catch` showing "Unable to connect" — misleading for what is a server error.
- **Fix:** Check `res.headers.get("content-type")?.includes("application/json")` before calling `res.json()`, or catch the JSON parse error separately with a more accurate message like "Server error. Please try again."

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 4. No server-side session invalidation — relies on client-side `signOut`
- **Source:** blind+edge
- **Detail:** The API returns 200 after deleting the user. The DB session row is cascade-deleted, but the session *cookie* persists in the browser until the client calls `signOut({ redirect: false })`. If the client-side call fails (network hiccup, tab closed, JS crash), the stale cookie is sent on every subsequent request. The NextAuth adapter will reject it (no matching DB row), but the cookie persists until expiry. Ideally, the API response would include a `Set-Cookie` header that clears the session cookie server-side. This is a NextAuth architectural limitation — the session cookie name and options are managed by the framework, not easily clearable from a custom API route.

### 5. No CSRF protection on DELETE endpoint
- **Source:** blind
- **Detail:** The client calls `fetch("/api/account", { method: "DELETE" })` with no CSRF token or custom header. `SameSite=strict` on the session cookie provides meaningful defense (blocks cross-origin cookie attachment), but is not formally complete CSRF protection. A single custom-header check (e.g., require `X-Requested-With`) would close this gap. Same systemic pattern as Stories 1.3 and 1.4 — should be addressed across all custom API routes.

### 6. No confirmation input / re-authentication before irreversible deletion
- **Source:** blind
- **Detail:** Two clicks destroy the account — no password re-entry, no "type your email to confirm." Industry standard for irreversible destructive actions (GitHub, AWS, Stripe) requires re-authentication or typed confirmation. The spec prescribes only the Dialog confirmation pattern. Could be added as a UX enhancement in a future story.

### 7. Hard delete with no soft-delete, grace period, or audit trail
- **Source:** blind
- **Detail:** `prisma.user.delete()` is immediate and irrecoverable. No `deletedAt` column, no 14-day grace period, no audit log of who deleted what and when. The spec explicitly requires "permanent delete" and "full data purge" — this is by design. However, regulatory compliance (GDPR Article 17 allows erasure but many regulations also require audit trails) and accidental-deletion recovery may warrant a grace period in a future iteration.

### 8. Deletion during active job processing leaves dangling background work
- **Source:** edge
- **Detail:** If a user triggers deletion while an async upload/parse/categorization job is in progress, the `job_status` and `transactions` rows are cascade-deleted mid-flight. The background worker still holds references to the deleted userId/statementId, producing foreign-key violations. Requires a "check for active jobs before deletion" guard or a job cancellation mechanism — architecture-level concern beyond this story.

### 9. Orphaned Azure Blob Storage files not cleaned up on deletion
- **Source:** blind
- **Detail:** The project includes `@azure/storage-blob` as a dependency, indicating uploaded statements may be stored in Azure Blob Storage. `prisma.user.delete()` cascades to DB rows but does not delete blobs in external storage. After account deletion, orphaned files remain in Azure indefinitely — a GDPR right-to-erasure compliance gap and a cost leak. Requires a blob cleanup step (either pre-delete query + blob delete, or a background cleanup job) — architecture-level concern beyond this story.

### 10. `/api/account` not covered by middleware matcher
- **Source:** blind+edge
- **Detail:** The middleware matcher covers `/dashboard`, `/statements`, `/admin`, `/settings` but not `/api/*`. The route's own `auth()` check handles authentication, so this is not directly exploitable. However, defense-in-depth suggests API routes should also be covered. Same systemic gap noted in Story 1.3 (Finding #10). Should be addressed with a negative matcher pattern across all API routes.

---

## Rejected Findings (10)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- No rate limiting on deletion endpoint — requires auth, single-use (account gone after first success), DoS via authenticated endpoint is a systemic concern not specific to this route
- Re-registration with same email after deletion — intentional; the email unique constraint is freed by hard delete; UUIDs prevent old/new user ID confusion
- Missing `GET` handler for account info — not in scope; settings page doesn't display account details in this story
- Cancel button disabled during pending state — UX improvement over spec, not a deviation
- Danger zone description has extra "This action cannot be undone" sentence — enhancement over spec template, not a deviation
- 5 tests instead of 4 mentioned in Dev Agent Record — more coverage than claimed, not a problem
- Cascade failure leaves partial data — PostgreSQL wraps cascade in a single transaction; atomicity guaranteed at DB level
- `res.json()` type assertion without runtime validation — acceptable for internal API responses with known shape
- No environment protection for deletion endpoint — same as "no rate limiting" systemic concern
- Test suite doesn't verify session invalidation — session invalidation is client-side (`signOut`); not testable in API integration tests without browser context

---

## Priority Actions Before Merge

1. **Finding #1 (HIGH):** Catch Prisma `P2025` on double-delete to avoid 500 errors — make deletion idempotent.
2. **Finding #2 (HIGH):** Add sole-admin guard to prevent loss of all administrative access.