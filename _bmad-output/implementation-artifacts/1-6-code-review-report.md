# Code Review Report — Story 1-6: Azure Production Deployment & CI/CD

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/1-6-azure-production-deployment-and-cicd.md`
**Scope:** 3 files (1 modified, 2 new), ~220 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **7** |
| Defer      | **8** |
| Rejected   | **9** |

**Acceptance Auditor verdict:** All 6 acceptance criteria pass. No spec violations. Minor cosmetic difference: health endpoint uses synchronous `GET()` instead of `async GET()` — functionally identical.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Deploy workflows have no CI gate — broken code can reach production
- **Source:** blind+edge
- **Severity:** CRITICAL
- **File:** `.github/workflows/deploy-web.yml`, `.github/workflows/deploy-worker.yml`
- **Detail:** Both deploy workflows trigger on `push` to `main` with path filters. Neither has a dependency on the CI workflow (`needs:` or required status check). CI and deploy are independent workflows that race each other. A commit that fails tests is deployed to production before (or regardless of whether) CI completes.
- **Fix:** Option A: Make deploy workflows `workflow_run` triggers that fire only after CI succeeds. Option B: Combine CI and deploy into a single workflow with `deploy` jobs that `needs: [test]`. Option C: Configure branch protection rules requiring CI to pass before merge (prevents the push that triggers deploy). Option A or C is recommended — C is simplest if branch protection is available.

### 2. No concurrency controls — parallel deploys can clobber each other
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `.github/workflows/deploy-web.yml`, `.github/workflows/deploy-worker.yml`
- **Detail:** Neither workflow has a `concurrency:` block. Two rapid pushes to `main` run two deploys simultaneously. If the older commit's `az containerapp update` finishes after the newer commit's, production silently rolls back to the stale image.
- **Fix:** Add `concurrency:` at the workflow or job level:
  ```yaml
  concurrency:
    group: deploy-web
    cancel-in-progress: true
  ```

### 3. Unpinned GitHub Action versions — supply chain risk
- **Source:** blind
- **Severity:** HIGH
- **File:** `.github/workflows/ci.yml`, `.github/workflows/deploy-web.yml`, `.github/workflows/deploy-worker.yml`
- **Detail:** All actions use mutable tags: `actions/checkout@v4`, `actions/setup-node@v4`, `azure/login@v2`, etc. A compromised upstream action (or force-pushed tag) executes arbitrary code in the runner with access to OIDC tokens and all secrets. The Codecov supply chain attack of 2021 exploited this pattern.
- **Fix:** Pin to full SHA digests (e.g., `actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4`). Add a comment with the version for readability. Use Dependabot or Renovate to keep pins updated.

### 4. Secret values interpolated directly into shell `run:` commands
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `.github/workflows/deploy-web.yml`, `.github/workflows/deploy-worker.yml`
- **Detail:** `az acr login --name ${{ secrets.ACR_LOGIN_SERVER }}` and `az containerapp update` inline secrets directly into shell strings. If any secret value contains shell metacharacters, you get command injection or broken commands. GitHub masks exact secret strings in logs but partial matches or transformed values can leak.
- **Fix:** Assign secrets to environment variables first, then reference them in `run:`:
  ```yaml
  env:
    ACR_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
  run: az acr login --name "$ACR_SERVER"
  ```

### 5. CI workflow has no explicit `permissions:` — defaults may be too broad
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `.github/workflows/ci.yml`
- **Detail:** No top-level `permissions:` key. Default permissions depend on repository settings — for private repos with "Read and write" default, the CI token gets `contents: write`, `packages: write`, etc. A CI job that only runs tests needs zero write permissions.
- **Fix:** Add `permissions: { contents: read }` to the CI workflow.

### 6. `az acr login --name` expects registry name, not FQDN — deploys may fail
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `.github/workflows/deploy-web.yml` (line 36), `.github/workflows/deploy-worker.yml` (line 36)
- **Detail:** `az acr login --name ${{ secrets.ACR_LOGIN_SERVER }}` passes the secret to `--name`. The `--name` flag expects the registry *name* (e.g., `mintregistry`), not the FQDN (e.g., `mintregistry.azurecr.io`). But the image tag on line 40 uses `${{ secrets.ACR_LOGIN_SERVER }}/mint-web:...` which needs the FQDN. These two uses are incompatible — one will fail depending on the secret's value.
- **Fix:** Use two secrets: `ACR_NAME` (registry name, for `az acr login`) and `ACR_LOGIN_SERVER` (FQDN, for image tags). Or derive one from the other in a step.

### 7. Health endpoint may be statically cached by Next.js — defeating liveness probes
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/api/health/route.ts`
- **Detail:** The spec says "No dynamic rendering config needed." However, API routes that use no dynamic features may be statically rendered at build time by Next.js. A cached 200 response defeats liveness probing — Azure would report the container as healthy even during a crash/restart cycle.
- **Fix:** Add `export const dynamic = "force-dynamic";` to the health route to force per-request evaluation.

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 8. No post-deploy health check or rollback mechanism
- **Source:** blind+edge
- **Detail:** The final step is `az containerapp update`. There is no subsequent step verifying the new revision is healthy, and no rollback mechanism. `az containerapp update` returns success when the API accepts the request, not when the container is healthy. A crash-looping container sits in production until discovered externally. Adding a health check step (HTTP probe or `az containerapp revision list` query) and a rollback step on failure would require additional infrastructure design.

### 9. Database migrations not part of deploy pipeline
- **Source:** edge
- **Detail:** CI runs `prisma migrate deploy` against the ephemeral test database. Neither deploy workflow runs migrations against the production database. A new migration means the new container image starts against a schema that doesn't have the new columns/tables yet. Production migrations are currently manual — this is a common pattern but creates a coordination risk. Should be designed as part of a migration strategy in a future story.

### 10. No GitHub Environment protection rules
- **Source:** blind
- **Detail:** Neither deploy job declares `environment: production`. GitHub Environments provide required reviewers, wait timers, deployment branch restrictions, and secret scoping. Without them, anyone with push access to `main` triggers an unreviewed production deployment. OIDC secrets are available to every workflow in the repo rather than scoped to a protected environment.

### 11. Partial rollout — web and worker deploy independently with no coordination
- **Source:** blind+edge
- **Detail:** A single commit touching both `apps/web/` and `apps/worker/` fires both deploy workflows concurrently with no ordering. If the commit includes a breaking API contract change between web and worker, the deploy order is nondeterministic. One service may run the new code while the other runs the old. Requires a coordinated deployment strategy (e.g., a single deploy workflow that handles both, or API versioning).

### 12. 7-character SHA truncation — potential tag collision
- **Source:** blind+edge
- **Detail:** `${GITHUB_SHA::7}` gives 28 bits of entropy. In a long-lived repo with tens of thousands of commits, a prefix collision is statistically plausible. A collision overwrites an existing image tag in ACR, making rollback point to the wrong image. Using the full 40-character SHA eliminates this risk entirely with no downside.

### 13. OIDC token expiry during long Docker builds
- **Source:** edge
- **Detail:** `azure/login@v2` obtains an OIDC token early in the workflow. A large Docker build taking 30+ minutes could cause the ACR access token to expire before `docker push` completes, resulting in a mid-upload authentication failure. Adding `az acr login` closer to the push step or splitting build and push would mitigate this.

### 14. Missing or misconfigured secrets produce confusing failures
- **Source:** edge
- **Detail:** If any required secret is unset (repo forked, secret deleted, typo), it resolves to an empty string. `az acr login --name ""` fails with an opaque Azure CLI error. `docker build -t "/mint-web:abc1234"` produces a malformed tag. No pre-flight validation or early-exit check exists. Adding a validation step (`if: secrets.ACR_LOGIN_SERVER != ''`) would fail fast with a clear message.

### 15. Path filter blind spots on shared packages and root config
- **Source:** edge
- **Detail:** Deploy workflows only trigger on `apps/web/**` or `apps/worker/**`. Changes to shared packages (`packages/**`), root `package.json`/`package-lock.json`, or `tsconfig.json` won't trigger redeployment, leaving production containers running with stale shared code. This becomes critical once shared packages like `@mint/db` are actively used.

---

## Rejected Findings (9)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- Hardcoded CI database credentials (`mintuser`/`mintpassword`) — ephemeral service container, zero blast radius, standard CI practice
- Health endpoint uses `function GET()` instead of `async function GET()` — functionally identical for a synchronous return; Next.js handles both
- `az acr login` failure doesn't explicitly check exit code — GitHub Actions stops on step failure by default; implicit check is sufficient
- CI service container health check timing vs migration readiness — `pg_isready` + retry loop is adequate; Prisma `migrate deploy` step would fail independently on schema issues
- Path-filter bypass on simultaneous changes — covered by Defer #9 (partial rollout coordination)
- `SHORT_SHA` collision — covered by Defer #10 (7-char truncation)
- No `latest` tag or deployment manifest — valid concern but outside story scope; deployment tracking belongs in a monitoring/observability story
- ACR login failure before build step — safe by default (GitHub Actions stops on failure); hypothetical `continue-on-error` refactor is not a current issue
- CI test step migration error reporting — Prisma errors are clear enough; separate migration vs test failure reporting is an enhancement

---

## Priority Actions Before Merge

1. **Finding #1 (CRITICAL):** Add a CI gate to deploy workflows. Simplest: configure branch protection requiring CI to pass before merging to `main`. Alternative: use `workflow_run` triggers.
2. **Finding #2 (HIGH):** Add `concurrency:` blocks to both deploy workflows to prevent parallel deploy races.
3. **Finding #3 (HIGH):** Pin GitHub Action versions to full SHA digests to mitigate supply chain attacks.
4. **Finding #4 (MEDIUM):** Move secret interpolation to `env:` blocks instead of inline shell substitution.
5. **Finding #5 (MEDIUM):** Add explicit `permissions: { contents: read }` to `ci.yml`.
6. **Finding #6 (MEDIUM):** Fix `az acr login --name` vs FQDN mismatch — use separate secrets for registry name and login server.
7. **Finding #7 (MEDIUM):** Add `export const dynamic = "force-dynamic"` to health route to prevent static caching.