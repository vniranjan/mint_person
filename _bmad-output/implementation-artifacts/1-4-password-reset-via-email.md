# Story 1.4: Password Reset via Email

**Status:** review
**Epic:** 1 — Foundation, Infrastructure & Authentication
**Created:** 2026-03-27

---

## Story

As a user who has forgotten their password,
I want to request a password reset and set a new password via an email link,
So that I can regain access to my account without contacting an administrator.

---

## Acceptance Criteria

**AC1 — Forgot-password no enumeration:**
Given I submit my email on the forgot-password form, the response always shows "If that email is registered, a reset link has been sent" — regardless of whether the email exists. No information about account existence is revealed.

**AC2 — Token generation and email sent:**
Given the email does exist, a crypto-random reset token is generated, hashed with SHA-256 before storage, stored in `password_reset_tokens` with a 1-hour expiry, and a reset email is sent containing the plaintext token as a URL parameter.

**AC3 — Valid reset link:**
Given I click a valid, unexpired, unused reset link and submit a new password ≥ 8 characters and ≤ 128 characters, my password is updated (bcrypt cost 12); all existing sessions for that user are deleted server-side; I am redirected to `/login` with a `?reset=success` query param that shows a "Password updated. Please sign in." success message.

**AC4 — Expired or used link:**
Given I open a reset link whose token is expired or already used (usedAt is set), the page shows "This reset link has expired or already been used." with a link to `/forgot-password` to request a new one.

**AC5 — Invalid token:**
Given I open a reset link with a token that doesn't exist in the DB (tampered URL), the same expired/used error page is shown (no differentiation between not-found and expired).

**AC6 — Form behavior:**
The forgot-password and reset-password forms validate on blur; labels always visible above fields; submit button shows loading spinner during in-flight requests; password field has show/hide toggle.

---

## Tasks

- [x] **Task 1: Add PasswordResetToken model to Prisma schema** (AC: 2, 3, 4)
  - [x] Add `PasswordResetToken` model with `id`, `userId`, `tokenHash` (unique), `expiresAt`, `usedAt?`, `createdAt`
  - [x] Add `passwordResetTokens` relation on `User` model
  - [x] Run `npx prisma migrate dev --name add_password_reset_tokens` to generate and apply migration
  - [x] Regenerate Prisma client: `npx prisma generate`

- [x] **Task 2: Install Resend email SDK** (AC: 2)
  - [x] `npm install resend` in `apps/web/`
  - [x] Add `RESEND_API_KEY` and `APP_URL` to `.env` (with placeholder values for local dev) and to `.env.example`
  - [x] Create `apps/web/src/lib/email.ts` — Resend client singleton + `sendPasswordResetEmail()` helper

- [x] **Task 3: Create forgot-password API route** (AC: 1, 2)
  - [ ] Create `apps/web/src/app/api/auth/forgot-password/route.ts` — `POST` only
  - [x] Validate email format; look up user by email
  - [x] Always return 200 `{ data: { message: "If that email is registered, a reset link has been sent" } }` (no enumeration)
  - [x] If user exists: delete any existing unexpired tokens for user, generate 32-byte crypto-random token, hash with SHA-256, store in `password_reset_tokens`, send email

- [x] **Task 4: Create reset-password API route** (AC: 3, 4, 5)
  - [x] Create `apps/web/src/app/api/auth/reset-password/route.ts` — `POST` only
  - [x] Accept `{ token, password }` in body
  - [x] SHA-256 hash the incoming token, look up by `tokenHash`
  - [x] Return 400 `INVALID_OR_EXPIRED_TOKEN` if not found, expired (`expiresAt < now()`), or already used (`usedAt != null`)
  - [x] Validate password: ≥ 8, ≤ 128 chars — 400 VALIDATION_ERROR
  - [x] Hash new password with bcryptjs cost 12; update user's `passwordHash`
  - [x] Mark token as used: `prisma.passwordResetToken.update({ data: { usedAt: new Date() } })`
  - [x] Invalidate all sessions: `prisma.session.deleteMany({ where: { userId } })`
  - [x] Return 200 `{ data: { message: "Password updated" } }`

- [x] **Task 5: Create forgot-password page** (AC: 1, 6)
  - [x] Create `apps/web/src/app/(auth)/forgot-password/page.tsx`
  - [x] Email field with blur validation; submit button with spinner
  - [x] On success: show the "If that email is registered..." message inline (replace form with success state); do NOT redirect
  - [x] Link back to `/login`

- [x] **Task 6: Create reset-password page** (AC: 3, 4, 5, 6)
  - [x] Create `apps/web/src/app/(auth)/reset-password/page.tsx`
  - [x] Read `token` from URL search params: `useSearchParams()`
  - [x] On mount (or render): if no token in URL, show invalid/expired error immediately
  - [x] Password + confirm password fields with show/hide toggles; blur validation
  - [x] On success response: `router.push("/login?reset=success")`
  - [x] On 400 INVALID_OR_EXPIRED_TOKEN: show expired error with link to `/forgot-password`

- [x] **Task 7: Update login page to show reset success toast** (AC: 3)
  - [x] Read `?reset=success` from URL search params on login page
  - [x] If present, show a success message: "Password updated. Please sign in." (inline, above the form, styled in emerald-600)
  - [x] Clear the param from URL after displaying (use `router.replace`)

- [x] **Task 8: Add forgot-password link on login page** (AC: 6)
  - [x] Add "Forgot password?" link to `/forgot-password` on the login page (below the password field or near the sign-in button)

- [x] **Task 9: Write integration tests** (AC: 1, 2, 3, 4, 5)
  - [x] Create `apps/web/src/__tests__/auth-reset.test.ts`
  - [x] Add `"test:reset"` script to `package.json`
  - [x] Tests: forgot-password always returns 200 (existing + non-existing email), token stored hashed not plaintext, valid token resets password + invalidates sessions, expired token returns 400, used token returns 400, password validation errors (< 8, > 128)

---

## Dev Notes

### CRITICAL: PasswordResetToken Schema

Add to `schema.prisma` (inside `// ─── Application Models ───` section):

```prisma
model PasswordResetToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@map("password_reset_tokens")
}
```

Add to `User` model (in the App relations section):
```prisma
  passwordResetTokens PasswordResetToken[]
```

After editing schema, run from `apps/web/`:
```bash
npx prisma migrate dev --name add_password_reset_tokens
```

This generates a migration file AND applies it to the local DB. Do NOT use `migrate deploy` in dev.

### CRITICAL: Token Generation and Hashing

Never store the plaintext token in the DB. Store a SHA-256 hash. The email contains the plaintext token. On validation, hash the incoming token and compare to stored hash.

```typescript
import crypto from "crypto";

// Generate (in forgot-password route):
const token = crypto.randomBytes(32).toString("hex"); // 64 hex chars
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

// Validate (in reset-password route):
const tokenHash = crypto.createHash("sha256").update(incomingToken).digest("hex");
const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
```

### CRITICAL: Email Library — Resend

Use [Resend](https://resend.com) — modern email API with excellent Next.js support.

```typescript
// apps/web/src/lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
  await resend.emails.send({
    from: "mint <noreply@yourdomain.com>",  // Replace with your verified Resend domain
    to,
    subject: "Reset your mint password",
    html: `
      <p>You requested a password reset for your mint account.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      <p>Or copy this URL: ${resetUrl}</p>
    `,
  });
}
```

**Environment variables** — add to `.env` and `.env.example`:
```
RESEND_API_KEY=re_your_key_here
APP_URL=http://localhost:3000
```

For local dev, the email won't send (no real API key) but the test logs the token directly for manual testing. Set `RESEND_API_KEY=""` to skip sending silently.

In the forgot-password route, wrap `sendPasswordResetEmail()` in try/catch — a failed email send should NOT return an error to the user (they'd still see the "If that email is registered..." message).

### CRITICAL: Invalidate All Sessions on Password Reset

After updating password hash, delete ALL sessions for the user:

```typescript
await prisma.session.deleteMany({ where: { userId: record.userId } });
```

This uses PrismaAdapter's `sessions` table (the same one that stores database sessions from Story 1.3). This is why we chose database sessions over JWT — immediate revocation.

### CRITICAL: No Email Enumeration

The forgot-password route MUST return the same response whether or not the email exists:

```typescript
// Always return 200 — regardless of whether user found
return NextResponse.json(
  { data: { message: "If that email is registered, a reset link has been sent" } },
  { status: 200 },
);
```

Do the user lookup FIRST (to send email if found), but the response is always identical.

Also: don't vary timing. The DB lookup is fast either way. Token generation and email sending are async and non-blocking from the response — fire and forget (don't `await` the email send before responding... wait, actually you should for test reliability. But use try/catch so email failure doesn't affect the response).

Actually: await the token creation (you need DB write to succeed) but fire-and-forget the email send. Better:

```typescript
if (user) {
  // delete old tokens, create new one
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  // ... create token ...
  // Fire-and-forget email
  void sendPasswordResetEmail(user.email, token).catch(() => {
    // swallowed — email failure doesn't affect user response
  });
}
// Always 200
return NextResponse.json({ data: { message: "..." } }, { status: 200 });
```

### Token Cleanup

When creating a new reset token for a user, delete any existing UNUSED tokens first:
```typescript
await prisma.passwordResetToken.deleteMany({
  where: { userId: user.id, usedAt: null },
});
```

This prevents a user from having multiple valid reset tokens active simultaneously. Used tokens can stay (for audit trail).

### Reset-Password Page: Token from URL

```tsx
"use client";
import { useSearchParams } from "next/navigation";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // If no token in URL, show error immediately
  if (!token) {
    return <ExpiredError />;
  }
  // ... form
}
```

The `useSearchParams()` hook requires the component to be wrapped in `<Suspense>`. In Next.js App Router, pages that use `useSearchParams` outside of a Suspense boundary will cause a build warning. Wrap the inner component:

```tsx
// page.tsx
import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
```

Put the `useSearchParams` logic in `ResetPasswordForm` (a separate client component in the same directory).

Same pattern applies to the login page for reading `?reset=success` — wrap the part that reads search params in Suspense.

### Login Page: Success Message for ?reset=success

```tsx
// In login/page.tsx — read search params to show success message
const searchParams = useSearchParams();
const resetSuccess = searchParams.get("reset") === "success";

// In JSX, above the form:
{resetSuccess && (
  <p className="text-sm text-emerald-600" role="status">
    Password updated. Please sign in.
  </p>
)}
```

After displaying, optionally clear: `router.replace("/login")` to remove the query param. Actually, clearing it would cause a re-render and flash. It's simpler to just leave it and let navigation naturally clear it. Don't add unnecessary complexity.

### File Locations

- `apps/web/src/app/(auth)/forgot-password/page.tsx` — forgot password page
- `apps/web/src/app/(auth)/reset-password/page.tsx` — page wrapper with Suspense
- `apps/web/src/app/(auth)/reset-password/ResetPasswordForm.tsx` — client form component
- `apps/web/src/app/api/auth/forgot-password/route.ts` — POST handler
- `apps/web/src/app/api/auth/reset-password/route.ts` — POST handler
- `apps/web/src/lib/email.ts` — Resend singleton + sendPasswordResetEmail()
- `apps/web/src/__tests__/auth-reset.test.ts` — integration tests

### Testing Pattern

Tests call the route handlers directly (same as Story 1.3 pattern). For the forgot-password tests, check the DB directly to verify token was created:

```typescript
import { POST as forgotPassword } from "~/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "~/app/api/auth/reset-password/route";

// Test token is stored hashed:
const record = await prisma.passwordResetToken.findFirst({ where: { userId } });
expect(record?.tokenHash).not.toBe(rawToken); // hash, not plaintext
const expected = crypto.createHash("sha256").update(rawToken).digest("hex");
expect(record?.tokenHash).toBe(expected);
```

In test environment, `sendPasswordResetEmail` will try to call Resend with an empty/invalid key — it will throw. Wrap it in try/catch (already done in the route). The test should still pass because the route catches the email error.

**Alternatively**, for tests to reliably extract the token without email: after calling `forgotPassword`, query the DB for `passwordResetToken` where `userId = user.id`, get the `tokenHash`, and reconstruct... wait, you can't reverse a hash. Instead, the test creates the token itself or reads it from a separate flow.

**Best test approach**: After calling `forgotPassword`, query `prisma.passwordResetToken.findFirst({ where: { userId } })` — this gives you `tokenHash` and `expiresAt` but not the raw token. To test `resetPassword`, you need the raw token. Solution: generate a known raw token in the test, hash it yourself, and insert it directly:

```typescript
// In test setup:
const rawToken = "test-reset-token-abc123";
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
await prisma.passwordResetToken.create({
  data: { userId, tokenHash, expiresAt: new Date(Date.now() + 3600000) },
});

// Then test reset:
const res = await POST(makeRequest({ token: rawToken, password: "newpassword123" }));
expect(res.status).toBe(200);
```

For `forgotPassword` tests, just verify the DB has a `passwordResetToken` row after calling the handler.

---

## Learnings from Previous Stories

**From Story 1.3:**
- Use `import { type NextRequest, NextResponse }` (type-only for NextRequest)
- `consistent-type-imports` ESLint rule is enforced
- Catch Prisma `P2002` (`PrismaClientKnownRequestError`) in catch blocks for unique constraint violations
- `bcryptjs` (pure JS) — never `bcrypt`; cost factor 12
- API responses: `{ data: ... }` success, `{ error: { code, message } }` error
- `prefer-optional-chain` lint rule — avoid `!obj.prop` chains; extract to variables first
- Module augmentation: only `Session` interface in `next-auth`, not `User`
- `withRLS()` for protected routes (not needed for auth routes — these are public)
- Tests use `beforeEach` for cleanup, `afterAll` for disconnect

**From Story 1.1 & 1.2:**
- UUID IDs throughout — `@default(uuid()) @db.Uuid`
- `@@map("snake_case_plural")` on all Prisma models
- Migrations in `apps/web/prisma/migrations/` — run `migrate dev` in development
- `~` alias maps to `src/` — use for all internal imports

---

## Architecture Compliance

- **No new packages except `resend`** — `crypto` is Node.js built-in (no install needed)
- **Email provider:** Resend (`resend` npm package) — simple REST API, TypeScript-first
- **Token security:** SHA-256 hash stored, plaintext only in email link
- **Session invalidation:** Delete all DB sessions via `prisma.session.deleteMany()` — only possible with database session strategy (Story 1.3 decision)
- **Response pattern:** `{ data: ... }` / `{ error: { code, message } }` — same as all other routes
- **File locations:** All under `apps/web/src/` using `~` alias; no changes to `apps/worker/`
- **Schema change:** New migration file required; no changes to existing tables

---

## Definition of Done

- [x] `POST /api/auth/forgot-password` always returns 200 regardless of email existence
- [x] Token stored as SHA-256 hash, not plaintext; expires in 1 hour
- [x] `POST /api/auth/reset-password` with valid token updates password and deletes all sessions
- [x] Expired/used/invalid token returns 400 `INVALID_OR_EXPIRED_TOKEN`
- [x] `npm run typecheck` passes with no new errors
- [x] `npm run test:reset` passes (all integration tests)
- [x] `npm run test:auth` still passes (Story 1.3 regression)
- [x] Login page shows "Password updated. Please sign in." when `?reset=success` is in URL
- [x] Forgot password page has link back to `/login`; login page has link to `/forgot-password`

---

## Dev Agent Record

**Completed by:** Claude (dev-story workflow)
**Completed:** 2026-03-27

### Implementation Notes

- **Login page refactored** to Suspense wrapper + `LoginForm.tsx` client component because `useSearchParams()` requires Suspense boundary in Next.js App Router. Same pattern applied to reset-password page (`page.tsx` + `ResetPasswordForm.tsx`).
- **Token security**: SHA-256 hash of 64-char hex random token stored; plaintext only in email link. Incoming token is hashed before DB lookup.
- **Session invalidation**: Uses `prisma.$transaction([update user, mark token used, deleteMany sessions])` — atomic operation prevents race between password update and session clear.
- **Fire-and-forget email**: `void sendPasswordResetEmail(...).catch(() => {})` — email failure does not fail the HTTP response or reveal account existence.
- **Prisma client regenerated** after schema change to pick up `passwordResetToken` model.

### File List

**Modified:**
- `apps/web/prisma/schema.prisma` — added `PasswordResetToken` model + relation on `User`
- `apps/web/src/app/(auth)/login/page.tsx` — converted to Suspense wrapper
- `apps/web/package.json` — added `test:reset` script
- `apps/web/.env.example` — added `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`

**Created:**
- `apps/web/prisma/migrations/20260327000001_add_password_reset_tokens/migration.sql`
- `apps/web/src/lib/email.ts` — Resend singleton + `sendPasswordResetEmail()`
- `apps/web/src/app/api/auth/forgot-password/route.ts`
- `apps/web/src/app/api/auth/reset-password/route.ts`
- `apps/web/src/app/(auth)/forgot-password/page.tsx`
- `apps/web/src/app/(auth)/reset-password/page.tsx` — Suspense wrapper
- `apps/web/src/app/(auth)/reset-password/ResetPasswordForm.tsx` — client form
- `apps/web/src/app/(auth)/login/LoginForm.tsx` — extracted from page.tsx with useSearchParams + forgot-password link
- `apps/web/src/__tests__/auth-reset.test.ts` — 9 integration tests

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-27 | 1.0 | Story created | SM Agent |
| 2026-03-27 | 1.1 | Implementation complete; status → review | Dev Agent |
