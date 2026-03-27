# Code Review Report — Story 1-4: Password Reset via Email

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/1-4-password-reset-via-email.md`
**Scope:** 13 files (4 modified, 9 new), ~1383 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **7** |
| Defer      | **6** |
| Rejected   | **12** |

**Acceptance Auditor verdict:** All ACs pass. 1 minor spec deviation: `router.replace` to clear `?reset=success` query param is not implemented (Task 7 checkbox). Functionally non-blocking — the stale param causes no harm on refresh.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. TOCTOU race on token redemption — concurrent requests both consume the same token
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/auth/reset-password/route.ts`
- **Detail:** The token `findUnique` lookup (checking `usedAt === null`) happens *outside* the `$transaction` block. Two concurrent requests with the same valid token can both pass the validity check before either marks it used. Both execute the transaction — password set twice (potentially to different values), sessions deleted twice. The Prisma batch `$transaction` does not provide a `SELECT ... FOR UPDATE` lock on the token row.
- **Fix:** Use an atomic approach: inside the transaction, use `updateMany` with `WHERE tokenHash = ? AND usedAt IS NULL` and check `count === 0` to reject stale attempts. Or use an interactive Prisma transaction with a `findFirst` + `FOR UPDATE` lock.

### 2. Timing oracle on forgot-password leaks email existence
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/auth/forgot-password/route.ts`
- **Detail:** When a user exists: `findUnique` + `deleteMany` + `randomBytes` + `create` + email API call. When user doesn't exist: `findUnique` returns null, skip to response. The response message is identical, but the wall-clock time is measurably different. The code comments show awareness ("avoid timing-based email enumeration") but no constant-time padding is applied. A statistical attacker sending 50–100 requests per email can distinguish "user exists" from "user not found."
- **Fix:** Add fake work on the miss path (e.g., `await randomBytes(32)` + a small delay) to normalize response time. Or queue all email sends asynchronously behind a fixed-delay response.

### 3. Fire-and-forget email swallows all errors with zero observability
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/auth/forgot-password/route.ts` (line 45)
- **Detail:** `void sendPasswordResetEmail(...).catch(() => {})` — the empty catch means a dead Resend API key, network partition, or rate limit produces absolute silence. Users see "check your inbox" but no email arrives. Operators have no way to detect this.
- **Fix:** Add `console.error` (or structured logging) inside the `.catch()` block. This preserves the fire-and-forget pattern while making failures observable.

### 4. Resend client initialized with empty string when API key is missing
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `apps/web/src/lib/email.ts` (line 7)
- **Detail:** `new Resend(process.env.RESEND_API_KEY ?? "")` — an empty string doesn't throw at construction, only at `send()` time, and that error is swallowed (Finding #3). In production, a missing env var silently breaks all password resets.
- **Fix:** Throw at startup if `RESEND_API_KEY` is falsy, or log a warning on module load.

### 5. Missing `@@index([userId])` on `password_reset_tokens` table
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `apps/web/prisma/schema.prisma` (PasswordResetToken model)
- **Detail:** The `forgot-password` handler does `deleteMany({ where: { userId, usedAt: null } })` — a sequential scan without an index. Every other model (`Statement`, `Transaction`, `CorrectionLog`, `JobStatus`) has `@@index([userId])`. This table is the odd one out.
- **Fix:** Add `@@index([userId])` to the `PasswordResetToken` model.

### 6. Deactivated user can consume a previously-issued reset token
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/api/auth/reset-password/route.ts`
- **Detail:** The reset-password route looks up the token and its associated user but never checks `user.isActive`. An admin deactivates a user after they requested a reset but before they click the link — the deactivated user successfully resets their password. If `isActive` is later re-enabled, the attacker-chosen password is live.
- **Fix:** After finding the token record, check `record.user.isActive` (requires including the user relation in the query) and reject if false.

### 7. `?reset=success` query param never cleared from login URL
- **Source:** acceptance
- **Severity:** LOW
- **File:** `apps/web/src/app/(auth)/login/LoginForm.tsx`
- **Detail:** Task 7 spec says "Clear the param from URL after displaying (use `router.replace`)" but the implementation never calls `router.replace("/login")`. The Dev Notes discuss this tradeoff ("it's simpler to just leave it"), but the task checkbox is marked complete. Refreshing the login page re-shows the stale "Password updated" banner.
- **Fix:** Add `router.replace("/login", { scroll: false })` in a `useEffect` that fires when `resetSuccess` is true.

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 8. No rate limiting on forgot-password or reset-password endpoints
- **Source:** blind+edge
- **Detail:** Unlimited requests to forgot-password enable mailbox bombing (Resend bill inflation) and email spam. Reset-password has 256-bit token entropy making brute-force infeasible, but unlimited attempts are a volumetric DoS vector against the database. Rate limiting is typically infrastructure-level (Azure Front Door / WAF) — should be addressed in a deployment hardening story.

### 9. Token exposed in URL query string
- **Source:** blind
- **Detail:** The reset token is a `?token=` query parameter, logged by web servers, proxies, CDNs, browser history, and `Referer` headers. This is the standard pattern used by most frameworks (NextAuth, Django, Rails) and the spec explicitly prescribes it. URL fragments (`#token=`) would avoid server-side logging but break the `useSearchParams` pattern. Low risk given 1-hour expiry and single-use enforcement.

### 10. No CSRF protection on POST endpoints
- **Source:** blind+edge
- **Detail:** Both endpoints accept `POST` with `Content-Type: application/json` and no CSRF token. `application/json` requires CORS preflight which blocks simple cross-origin form submissions. `SameSite` cookie settings provide additional defense. The forgot-password endpoint is low-risk (just sends an email). The reset-password endpoint requires possession of the token. Same pattern as Story 1.3 — systemic, not story-specific.

### 11. Expired tokens accumulate in the database forever
- **Source:** edge
- **Detail:** The `forgot-password` route only deletes unused tokens for the current user when a new request arrives. Used tokens and tokens for users who never request again are never cleaned up. Requires a periodic cleanup job or database TTL policy — out of scope for this story.

### 12. Concurrent forgot-password requests can create duplicate tokens
- **Source:** edge
- **Detail:** Two rapid requests for the same email both execute `deleteMany` then `create` concurrently, leaving two valid tokens. Only one email link will work after the other is used. Benign side effect — the invariant violation doesn't create a security issue. A serializable transaction would fix it but adds complexity for a low-impact race.

### 13. HTML injection risk in email template via `APP_URL`
- **Source:** blind
- **Detail:** `APP_URL` from environment is interpolated directly into the HTML email body without encoding. If `APP_URL` is compromised (environment variable injection in CI/container), arbitrary HTML/JS can be injected into all password reset emails. Low likelihood — requires infrastructure compromise — but the fix is trivial (`encodeURI(appUrl)`).

---

## Rejected Findings (12)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- Password complexity is length-only (8–128) — spec explicitly prescribes this; NIST 800-63B dictionary checks are an enhancement, not a bug
- Token not URL-encoded — token is hex-only (`randomBytes.toString("hex")`), always URL-safe; future-proofing concern only
- `catch` blocks discard error context — generic catch returns 200 (forgot-password) or 500 (reset-password) as designed; server-side logging is a separate concern (covered by Finding #3)
- Whitespace-only password accepted — `"        "` passes length check; same behavior as registration (Story 1.3), spec prescribes length-only validation
- Timing side-channel on reset-password (bcrypt cost difference) — requires valid token possession, making the oracle useless to an attacker who doesn't already have access
- Test file uses placeholder bcrypt hash — test only verifies cascade behavior, never checks old password; valid test shortcut
- Stale browser tab submits used token — correctly returns `INVALID_OR_EXPIRED_TOKEN` and renders `ExpiredError` component; handled
- No `Content-Type` check before `req.json()` — malformed requests get caught by generic catch block, returning appropriate error
- `password.trim()` not called — consistent with registration (Story 1.3); intentional to avoid silently modifying user input
- Old tokens for inactive users not cleaned — covered by Defer #11 (expired token accumulation)
- No re-authentication before password change — the reset token *is* the authentication factor; user has proven email ownership
- `forgotPassword` returns 200 on database errors — intentional to prevent error-based email enumeration; correct security tradeoff

---

## Priority Actions Before Merge

1. **Finding #1 (HIGH):** Fix TOCTOU race on token redemption — use atomic `updateMany` with `WHERE usedAt IS NULL` check inside the transaction.
2. **Finding #2 (HIGH):** Add fake work on the miss path in forgot-password to mitigate timing oracle.
3. **Finding #3 (HIGH):** Add `console.error` inside the email `.catch()` block for observability.
4. **Finding #5 (MEDIUM):** Add `@@index([userId])` to `PasswordResetToken` model.
5. **Finding #6 (MEDIUM):** Check `user.isActive` before allowing token redemption.