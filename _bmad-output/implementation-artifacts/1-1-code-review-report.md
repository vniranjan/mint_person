# Code Review Report — Story 1-1: Project Scaffold & Design Foundation

**Date:** 2026-03-26
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/1-1-project-scaffold-and-design-foundation.md`
**Scope:** 70 new files, ~3,002 lines — greenfield scaffold

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Intent Gap | **1** |
| Bad Spec   | **3** |
| Patch      | **16** |
| Defer      | **6** |
| Rejected   | **13** |

---

## Intent Gaps

> These findings suggest the captured intent is incomplete. Consider clarifying intent before proceeding.

### 1. RLS `setRLSContext` transaction wrapping pattern unspecified
- **Source:** blind+edge
- **File:** `apps/web/src/lib/middleware-helpers.ts`
- **Detail:** `set_config('app.current_user_id', userId, true)` sets the config local to the current transaction. But the spec never defines how callers should wrap both `setRLSContext` and subsequent queries in the same `prisma.$transaction()`. Without that, Prisma's connection pool may run the `set_config` on one connection and the query on another, silently bypassing RLS. The spec marks this function as "fully implemented" but doesn't capture the critical usage contract.

---

## Bad Spec

> These findings suggest the spec should be amended. Consider regenerating or amending the spec with this context.

### 2. UX-DR1 token names collide with shadcn/ui reserved CSS variable names
- **Source:** auditor
- **File:** `apps/web/tailwind.config.ts`
- **Detail:** The spec mandates adding `text`, `accent`, `border`, `destructive`, and `success` keys under `extend.colors` with hardcoded hex values. But shadcn/ui already claims these exact keys for its HSL CSS variable system (e.g., `border: "hsl(var(--border))"`). The implementation can't satisfy both — the spec's hex values were overwritten by shadcn's mappings.
- **Suggested amendment:** Namespace UX-DR1 tokens (e.g., `mint-text`, `mint-accent`, `mint-border`) or define them as CSS custom properties that coexist with shadcn.

### 3. "All UUIDs" mandate contradicts T3 default `cuid()`
- **Source:** blind+edge+auditor
- **Files:** `apps/web/prisma/schema.prisma`, `apps/worker/models.py`
- **Detail:** The naming conventions say "All UUIDs — never integer IDs", but the Prisma schema uses `@default(cuid())` (the T3 default). CUIDs are string IDs but not UUIDs. Meanwhile, the SQLAlchemy worker models use `UUID(as_uuid=True)` with `uuid.uuid4`. These are incompatible types — the worker cannot read rows created by the web app.
- **Suggested amendment:** Decide on one ID strategy. If UUID: add `@default(uuid())` to Prisma and `@db.Uuid` column type. If CUID: update SQLAlchemy models to match.

### 4. Prisma default PascalCase table names vs architecture's snake_case plural convention
- **Source:** blind+edge
- **Files:** `apps/web/prisma/schema.prisma`, `apps/worker/models.py`
- **Detail:** The architecture says "DB tables: snake_case plural" (e.g., `users`, `transactions`). SQLAlchemy models use `__tablename__ = "users"`. But Prisma defaults `model User` to table `User` (PascalCase). Without `@@map("users")` directives, Prisma creates `User` and SQLAlchemy queries `users` — they'll never hit the same table.
- **Suggested amendment:** Add `@@map` directives to all Prisma models, or document that this is Story 1.2 scope.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 5. NextAuth `strategy: "database"` without PrismaAdapter — runtime crash
- **Source:** blind+edge
- **File:** `apps/web/src/lib/auth.ts`
- **Detail:** `session: { strategy: "database" }` requires an `adapter` property. `@auth/prisma-adapter` is in package.json but never imported. Any session operation will throw.
- **Fix:** Switch to `strategy: "jwt"` for the stub phase, or wire up the adapter.

### 6. Dockerfile copies `.next/standalone` but `next.config.js` lacks `output: "standalone"`
- **Source:** blind+edge
- **Files:** `apps/web/Dockerfile`, `apps/web/next.config.js`
- **Detail:** Dockerfile line 33 copies from `.next/standalone`, but `next.config.js` doesn't set `output: "standalone"`. Docker build will fail at the COPY step.
- **Fix:** Add `output: "standalone"` to next.config.js.

### 7. Jinja2 `autoescape=False` enables SSTI via CSV merchant names
- **Source:** blind+edge
- **File:** `apps/worker/prompts/prompts.py`
- **Detail:** Merchant names from user-uploaded CSVs are rendered via Jinja2 with no escaping. A merchant name like `{{ config.items() }}` would execute as template code.
- **Fix:** Use `SandboxedEnvironment` or enable autoescape.

### 8. `formatCurrency` returns `"NaN"` on non-numeric input
- **Source:** blind+edge
- **File:** `apps/web/src/lib/utils.ts`
- **Detail:** `parseFloat("abc")` returns `NaN`, which renders as `"NaN"` in the UI.
- **Fix:** Add a `Number.isNaN` guard returning `"$0.00"` or throw.

### 9. `next.config.js` sets `ignoreBuildErrors: true`
- **Source:** blind+edge
- **File:** `apps/web/next.config.js`
- **Detail:** Type errors pass Docker builds silently. CI runs `tsc` separately, but direct deploys bypass this.
- **Fix:** Remove `ignoreBuildErrors: true` or set to `false`.

### 10. Mutable default argument `context: dict = {}` in `load_prompt`
- **Source:** blind+edge
- **File:** `apps/worker/prompts/prompts.py`
- **Detail:** Classic Python bug. Mutations to `context` persist across calls.
- **Fix:** Use `context: dict | None = None` with `context = context or {}` inside.

### 11. `"uber"` keyword matches `"UBER EATS"` as Transport instead of Dining
- **Source:** blind+edge
- **File:** `apps/worker/categorizer.py`
- **Detail:** `"uber"` substring match fires before `"uber eats"` due to dict iteration order.
- **Fix:** Sort keywords longest-first, or check more specific matches first.

### 12. CI runs `npm ci` in `apps/web/` instead of monorepo root
- **Source:** blind+edge+auditor
- **File:** `.github/workflows/ci.yml`
- **Detail:** Workspace packages like `@mint/db` won't resolve when installing from a subdirectory.
- **Fix:** Run `npm ci` at root, then run checks in `apps/web`.

### 13. CI has no `push` trigger on main
- **Source:** blind
- **File:** `.github/workflows/ci.yml`
- **Detail:** Direct pushes/merges to main skip CI entirely.
- **Fix:** Add `push: branches: [main]`.

### 14. `formatMonthLabel` uses local timezone vs `formatMonth` using UTC
- **Source:** blind+edge
- **File:** `apps/web/src/lib/utils.ts`
- **Detail:** `new Date(year, month-1, 1)` is local time, but `formatMonth` uses `getUTCFullYear`. Timezone-boundary users see wrong month labels.
- **Fix:** Use UTC consistently.

### 15. `formatMonth`/`formatDate` crash on invalid date input
- **Source:** edge
- **File:** `apps/web/src/lib/utils.ts`
- **Detail:** `new Date("garbage")` produces `"NaN-NaN"`.
- **Fix:** Add validation or guard.

### 16. `parseMonthId` returns `NaN` on malformed input
- **Source:** edge
- **File:** `apps/web/src/lib/utils.ts`
- **Detail:** `NaN ?? 0` evaluates to `NaN` (nullish coalescing doesn't catch `NaN`).
- **Fix:** Use `|| 0` or explicit `Number.isNaN` check.

### 17. Worker Dockerfile: files copied as root, `USER worker` can't write
- **Source:** edge
- **File:** `apps/worker/Dockerfile`
- **Detail:** `COPY . .` runs as root before `USER worker`. Runtime writes (`__pycache__`, logs) get permission denied.
- **Fix:** Add `--chown=worker:worker` to COPY or `chown` after.

### 18. `docker-compose.override.yml` builds to `target: deps` — no source for `npm run dev`
- **Source:** edge
- **File:** `docker-compose.override.yml`
- **Detail:** The deps stage has only `node_modules`. Source is volume-mounted, but Prisma client isn't generated.
- **Fix:** Remove `target: deps` or add a `prisma generate` command.

### 19. Missing `packages/db/README.md`
- **Source:** auditor
- **Detail:** Spec Task 7 explicitly requires this file with content noting "Prisma schema lives in apps/web/prisma/; packages/db is reserved for shared DB types in future".
- **Fix:** Create the file with the specified content.

### 20. Web Dockerfile `npm ci` may fail without `package-lock.json`
- **Source:** edge
- **File:** `apps/web/Dockerfile`
- **Detail:** `COPY package-lock.json* ./` makes the lockfile optional, but `npm ci` strictly requires it.
- **Fix:** Remove the glob or ensure lockfile exists.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes). No action needed for Story 1-1.

### 21. `next-auth` pinned to beta `^5.0.0-beta.25`
- **Source:** blind+edge
- **File:** `apps/web/package.json`
- **Detail:** Caret range may pull breaking pre-release changes. Known constraint of NextAuth v5 timeline.

### 22. No CORS or rate limiting on worker FastAPI
- **Source:** blind
- **File:** `apps/worker/main.py`
- **Detail:** Worker port 8000 is published with no auth middleware. Relevant when job endpoints are added in Story 2.x.

### 23. `psycopg2-binary` not recommended for production
- **Source:** blind+edge
- **Files:** `apps/worker/requirements.txt`, `apps/worker/Dockerfile`
- **Detail:** Dockerfile installs `libpq-dev`/`gcc` (for non-binary) but requirements use `-binary`. Can address in Story 1.6 deployment.

### 24. Worker uses same DB credentials as web — no separate `worker_role`
- **Source:** blind
- **File:** `docker-compose.yml`
- **Detail:** Architecture claims RLS bypass for the worker, but both services use `mintuser`. Story 1.2 scope.

### 25. Health endpoints don't verify database connectivity
- **Source:** edge
- **Files:** `apps/web/src/app/api/health/route.ts`, `apps/worker/main.py`
- **Detail:** Both return 200 unconditionally. Container orchestrator can't detect DB outages.

### 26. `test_settings` may pick up local `.env` file
- **Source:** edge
- **File:** `apps/worker/tests/test_config.py`
- **Detail:** Pydantic-settings auto-loads `.env`, causing flaky tests on developer machines.

---

## Rejected Findings (13)

These were classified as noise, false positives, or intentional stubs within Story 1-1 scope:

- NextAuth `authorize()` always returns null — intentional stub (Story 1.3)
- Middleware exports nothing — intentional stub (Story 1.3)
- SQLAlchemy `declarative_base()` deprecated — stub file rewritten in Story 1.2
- `update_job_stage` no stage validation — stub, Story 1.2 scope
- `Settings.confidence_threshold` no range validation — stub, Story 3.1 scope
- `Settings.log_level` no enum validation — stub, Story 3.1 scope
- Docker Compose Postgres port exposed to host — standard local dev practice
- `docker-compose.yml` deprecated `version` key — cosmetic, no functional impact
- `categorize_transactions` KeyError on missing `id` — stub rewritten in Story 3.1
- docker-compose uses inline `environment` instead of `env_file` — functionally equivalent
- Hooks directory not in spec's project structure tree — harmless empty stubs, listed in file list
- Over-implementation in domain types — minor stubs, no behavioral impact
- Worker SQLAlchemy has no engine/session setup — explicitly deferred to Story 1.2