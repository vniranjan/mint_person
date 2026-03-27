# Code Review Report — Story 1-3: User Registration & Login

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/1-3-user-registration-and-login.md`
**Scope:** 10 files (6 modified, 4 new), ~911 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **6** |
| Defer      | **5** |
| Rejected   | **12** |

**Acceptance Auditor verdict:** All 6 acceptance criteria met functionally. Minor structural deviations from Dev Notes code templates, all documented with rationale.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Credentials provider + database sessions — verify session rows are actually created
- **Source:** blind+edge
- **Severity:** CRITICAL (if broken)
- **File:** `apps/web/src/lib/auth.ts`
- **Detail:** `strategy: "database"` with the Credentials provider has been a known incompatibility in NextAuth v4 and some v5 betas. The PrismaAdapter may not trigger `createSession` for Credentials logins (only for OAuth flows). If sessions aren't written to the DB, `auth()` returns `null` server-side and users hit a redirect loop after login.
- **Fix:** Manually verify: log in, then check the `sessions` table for a new row. If absent, either add manual session creation in `authorize()`, use the `jwt` callback to handle Credentials sessions, or switch to `strategy: "jwt"`. This must be confirmed before merging.

### 2. Registration race condition — concurrent requests get 500 instead of 409
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/auth/register/route.ts` (lines 29-42)
- **Detail:** `findUnique` then `create` is a TOCTOU (time-of-check-to-time-of-use) gap. Two concurrent registrations with the same email both pass the `findUnique` check (both see no existing user), then both call `prisma.user.create`. One hits a Prisma `P2002` unique constraint error caught by the generic catch block, returning 500 `INTERNAL_ERROR` instead of the proper 409 `EMAIL_ALREADY_EXISTS`.
- **Fix:** Catch `PrismaClientKnownRequestError` with code `P2002` in the catch block and return 409. Example:
  ```typescript
  catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "..." } }, { status: 409 });
    }
    // ... existing 500 handler
  }
  ```

### 3. `lastLoginAt` update blocks login on failure
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/lib/auth.ts` (lines 52-56)
- **Detail:** Comment says "non-blocking (failure doesn't affect auth)" but the code uses `await prisma.user.update(...)` with no try/catch. If this update fails (DB write timeout, row locked, etc.), the `authorize()` function throws and login fails entirely — even though the password was valid. The comment contradicts the code.
- **Fix:** Wrap in try/catch to make it actually non-blocking:
  ```typescript
  try {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  } catch {
    // Non-critical — don't block login
  }
  ```

### 4. No maximum password length — bcrypt DoS and silent truncation
- **Source:** blind+edge
- **Severity:** MEDIUM
- **Files:** `apps/web/src/app/api/auth/register/route.ts`, `apps/web/src/lib/auth.ts`
- **Detail:** Only checks `password.length < 8`, no upper bound. A multi-megabyte password string consumes significant CPU on `bcryptjs.hash` at cost factor 12, creating a DoS vector. Additionally, bcrypt silently truncates input at 72 bytes — a user who sets a 200-character password believes the full string is their credential, but only the first 72 bytes are hashed.
- **Fix:** Add `password.length > 128` check returning 400 `VALIDATION_ERROR` in the registration route. Optionally add a similar check in `authorize()`.

### 5. Login page doesn't handle network errors
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/(auth)/login/page.tsx` (lines 73-89)
- **Detail:** `signIn("credentials", { redirect: false })` can throw on network failure. There is no `catch` block in `handleSubmit`. The spinner disappears, the form resets to idle, and the user sees no error feedback.
- **Fix:** Add try/catch around the `signIn` call, set a form error on catch:
  ```typescript
  try {
    const result = await signIn("credentials", { redirect: false, ... });
    // ... existing error handling
  } catch {
    setErrors({ form: "Unable to connect. Please try again." });
  } finally {
    setIsPending(false);
  }
  ```

### 6. Register auto-login failure: error set then immediately navigated away
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/web/src/app/(auth)/register/page.tsx` (lines 135-139)
- **Detail:** When registration succeeds (201) but auto-signIn fails, `setErrors({ form: "Account created. Please sign in." })` runs then `router.push("/login")` fires immediately. The state update and navigation are not sequenced — the user is redirected before they can see the message.
- **Fix:** Either don't navigate (let user see the message with a link to `/login`), or pass a query param: `router.push("/login?registered=true")` and show a success banner on the login page.

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 7. User enumeration via registration 409
- **Source:** blind
- **Detail:** Registration returns 409 `EMAIL_ALREADY_EXISTS`, confirming email existence to an attacker. The login page correctly uses a generic error. This is a common design tradeoff — the spec explicitly prescribes 409. Low risk for a personal finance app with no public user profiles.

### 8. No rate limiting on login or registration
- **Source:** blind
- **Detail:** Both endpoints are unprotected against brute-force and credential-stuffing. bcrypt cost 12 adds ~250ms per attempt, which slows but doesn't stop automated attacks. Rate limiting is typically infrastructure-level (Azure Front Door, nginx, Cloudflare) rather than application-level. Should be addressed in Story 1.6 (deployment).

### 9. No CSRF protection on registration endpoint
- **Source:** blind+edge
- **Detail:** `/api/auth/register` is a custom route with no CSRF token. NextAuth's own endpoints have built-in protection. Next.js App Router POST with `application/json` requires CORS preflight, providing some defense. Full CSRF protection would require a token mechanism. Low risk for an endpoint that only creates accounts.

### 10. Middleware whitelist approach — new routes unprotected by default
- **Source:** blind+edge
- **Detail:** Matcher only covers `/dashboard/:path*`, `/statements/:path*`, `/admin/:path*`. New routes under `(app)/` not matching these patterns are unprotected by middleware. The `(app)/layout.tsx` server-side `auth()` check provides backup protection. The spec explicitly prescribes this matcher. Could be improved to a negative matcher in a future story.

### 11. Deactivated user retains active sessions
- **Source:** blind+edge
- **Detail:** `isActive` is checked at login time but the `session` callback never re-checks it. If an admin deactivates a user, their existing database sessions remain valid until natural expiry. Proper fix requires re-checking `isActive` on every session validation — a session callback enhancement beyond Story 1.3 scope.

---

## Rejected Findings (12)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- No password complexity beyond length — spec explicitly prescribes only `>= 8 chars`, no complexity rules
- `validateConfirmPassword` stale closure — minor React state timing, handled by form submit validation
- `next-auth` beta pinning with caret range — already tracked in Story 1-1 deferred items
- Non-JSON request body returns 500 — acceptable for malformed requests, generic catch handles it
- Email regex too permissive — spec says "basic regex" and "full RFC validation is unnecessary complexity"
- Double-submit on registration — `isPending` guard + React state batching handles this adequately
- Missing separate `next-auth.d.ts` file — type augmentation inlined in `auth.ts`, works correctly, documented rationale (dual `@auth/core` type conflict)
- `authorize()` doesn't return `role` — compensated by session callback via PrismaAdapter's DB user lookup, documented rationale (lint errors)
- `name ?? null` instead of `?? undefined` — NextAuth accepts both, negligible
- Test cleanup uses `beforeEach` instead of `afterAll`-only — actually better for test isolation
- Test email domain pattern differs from spec — functionally equivalent, cosmetic
- No bcrypt cost factor assertion in tests — cost 12 set in code, hash verified as bcrypt format

---

## Priority Actions Before Merge

1. **Finding #1 (CRITICAL):** Verify Credentials + database sessions actually create session rows. Log in, check the `sessions` table. If empty, auth is fundamentally broken.
2. **Finding #2 (HIGH):** Catch Prisma `P2002` in registration catch block for proper 409.
3. **Finding #3 (HIGH):** Wrap `lastLoginAt` update in try/catch — currently blocks valid logins on DB failure.
4. **Finding #4 (MEDIUM):** Add max password length check to prevent bcrypt DoS.