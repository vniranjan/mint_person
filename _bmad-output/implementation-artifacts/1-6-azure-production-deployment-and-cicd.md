# Story 1.6: Azure Production Deployment & CI/CD

**Status:** review
**Epic:** 1 — Foundation, Infrastructure & Authentication
**Created:** 2026-03-27

---

## Story

As a developer,
I want automated CI/CD pipelines that build, test, and deploy both containers to Azure Container Apps,
So that every merge to main produces a production-ready deployment with full test coverage gated in CI.

---

## Acceptance Criteria

**AC1 — Health endpoint (web):**
`GET /api/health` returns `200` with `{ "data": { "status": "ok" } }`. No auth required. The worker already has `/health` implemented.

**AC2 — CI runs all integration tests:**
The CI workflow (`ci.yml`) runs `test:auth`, `test:reset`, and `test:account` in addition to the existing `test:rls`. All tests run against the postgres service container. Any test failure fails the CI run.

**AC3 — Web deploy workflow:**
`.github/workflows/deploy-web.yml` triggers on push to `main`. It builds the Next.js Docker image, pushes to Azure Container Registry, and deploys to the Azure Container App for the web service. Requires GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `ACR_LOGIN_SERVER`, `WEB_CONTAINER_APP_NAME`, `RESOURCE_GROUP`.

**AC4 — Worker deploy workflow:**
`.github/workflows/deploy-worker.yml` triggers on push to `main`. It builds the Python worker Docker image, pushes to ACR, and deploys to the Azure Container App for the worker service. Requires the same secrets plus `WORKER_CONTAINER_APP_NAME`.

**AC5 — Workflows use OIDC (no stored credentials):**
Both deploy workflows authenticate to Azure via OIDC (`azure/login@v2` with `client-id`, `tenant-id`, `subscription-id`) — no service principal secrets stored in GitHub.

**AC6 — Image tagged with git SHA:**
Docker images are tagged with the short git SHA (`${{ github.sha }}` truncated to 7 chars) so every deployment is traceable to its commit.

---

## Tasks

- [x] **Task 1: Add `/api/health` route to Next.js** (AC: 1)
  - [x] Create `apps/web/src/app/api/health/route.ts`
  - [x] `GET` handler: no auth check, return `NextResponse.json({ data: { status: "ok" } }, { status: 200 })`
  - [x] No dynamic exports needed — this is a static response

- [x] **Task 2: Add missing integration tests to ci.yml** (AC: 2)
  - [x] Update `.github/workflows/ci.yml`
  - [x] After the existing `Cross-tenant RLS isolation test` step, add three new steps:
    - `Auth integration test` → `npm run test:auth`
    - `Password reset integration test` → `npm run test:reset`
    - `Account deletion integration test` → `npm run test:account`
  - [x] Each step has `working-directory: apps/web` and `env: DATABASE_URL: ${{ env.DATABASE_URL }}`
  - [x] Also add missing env vars for the new tests: `RESEND_API_KEY: ci-skip`, `RESEND_FROM_EMAIL: noreply@example.com`, `APP_URL: http://localhost:3000`

- [x] **Task 3: Create web deploy workflow** (AC: 3, 5, 6)
  - [x] Create `.github/workflows/deploy-web.yml`
  - [x] Trigger: `push` to `main`, path filter `apps/web/**` and `.github/workflows/deploy-web.yml`
  - [x] Steps: checkout → OIDC login → set short SHA → ACR login → docker build/push → az containerapp update

- [x] **Task 4: Create worker deploy workflow** (AC: 4, 5, 6)
  - [x] Create `.github/workflows/deploy-worker.yml`
  - [x] Trigger: `push` to `main`, path filter `apps/worker/**`
  - [x] Same OIDC auth pattern as web workflow
  - [x] Build image from `apps/worker/` with tag `${{ secrets.ACR_LOGIN_SERVER }}/mint-worker:${{ env.SHORT_SHA }}`
  - [x] Push and deploy to `${{ secrets.WORKER_CONTAINER_APP_NAME }}`

---

## Dev Notes

### Health Endpoint — Minimal Pattern

```typescript
// apps/web/src/app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ data: { status: "ok" } }, { status: 200 });
}
```

No dynamic rendering config needed — Next.js will treat this as a static API route. The worker already implements the same response shape at `/health` in `apps/worker/main.py`.

### CI env vars for new tests

The `test:auth` and `test:account` tests need no extra env vars beyond what CI already has.

The `test:reset` tests call `sendPasswordResetEmail()` which reads `RESEND_API_KEY`. The email is fire-and-forget; if the key is a dummy value the send will fail silently and the test will still pass (the test only verifies DB state, not email delivery). Set `RESEND_API_KEY=ci-skip` and `RESEND_FROM_EMAIL=noreply@example.com` and `APP_URL=http://localhost:3000` in the CI env block.

### OIDC Authentication Pattern

Use Workload Identity Federation so no long-lived secrets are stored in GitHub. The Azure side requires:
1. An Entra ID App Registration with Federated Credentials scoped to the repo + branch
2. The service principal assigned `AcrPush` on the Container Registry and `Contributor` on the Container Apps

GitHub secrets required (repository secrets, not environment secrets):
- `AZURE_CLIENT_ID` — App Registration client ID
- `AZURE_TENANT_ID` — Entra tenant ID
- `AZURE_SUBSCRIPTION_ID` — Azure subscription ID
- `ACR_LOGIN_SERVER` — e.g. `mintregistry.azurecr.io`
- `RESOURCE_GROUP` — resource group containing the Container Apps
- `WEB_CONTAINER_APP_NAME` — name of the web Container App
- `WORKER_CONTAINER_APP_NAME` — name of the worker Container App

### Deploy Workflow Pattern

```yaml
# Minimal deploy-web.yml structure
name: Deploy Web

on:
  push:
    branches: [main]
    paths:
      - "apps/web/**"
      - ".github/workflows/deploy-web.yml"

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Azure login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Set short SHA
        run: echo "SHORT_SHA=${GITHUB_SHA::7}" >> $GITHUB_ENV

      - name: Log in to ACR
        run: az acr login --name ${{ secrets.ACR_LOGIN_SERVER }}

      - name: Build and push Docker image
        run: |
          IMAGE=${{ secrets.ACR_LOGIN_SERVER }}/mint-web:${{ env.SHORT_SHA }}
          docker build -t $IMAGE apps/web/
          docker push $IMAGE

      - name: Deploy to Container App
        run: |
          az containerapp update \
            --name ${{ secrets.WEB_CONTAINER_APP_NAME }} \
            --resource-group ${{ secrets.RESOURCE_GROUP }} \
            --image ${{ secrets.ACR_LOGIN_SERVER }}/mint-web:${{ env.SHORT_SHA }}
```

### Path Filters

Use `paths:` to ensure the web workflow only runs when web files change, and the worker workflow only runs when worker files change. Both should also trigger on changes to their own workflow file so changes to the deploy process are exercised immediately.

### Existing Dockerfiles

Both `apps/web/Dockerfile` and `apps/worker/Dockerfile` are already complete from Story 1.1. No modifications needed — just reference them with `docker build -t <tag> apps/web/` (Docker uses the `Dockerfile` in that directory by default).

### No Schema Changes

This story touches only CI/CD configuration and a trivial API route. No schema changes, no Prisma changes, no new packages.

---

## Architecture Compliance

- **OIDC only** — no stored Azure credentials; Workload Identity Federation
- **ACR** for image storage — matches architecture decision
- **Azure Container Apps** — matches architecture decision (two independent containers)
- **Git SHA tagging** — every image traceable to its commit
- **Path filters** — avoid unnecessary deployments when only one service changes
- **Health endpoints** — both services expose `/health` or `/api/health` for Container Apps liveness probe

---

## Definition of Done

- [x] `GET /api/health` returns 200 `{ data: { status: "ok" } }` (curl or browser verifiable)
- [x] `npm run typecheck` passes with no new errors
- [x] CI workflow includes `test:auth`, `test:reset`, `test:account` steps
- [x] `.github/workflows/deploy-web.yml` exists and is syntactically valid YAML
- [x] `.github/workflows/deploy-worker.yml` exists and is syntactically valid YAML
- [x] Both deploy workflows use OIDC (no `client-secret` in secrets)
- [x] Images tagged with short git SHA

---

## Dev Agent Record

**Completed by:** Claude (dev-story workflow)
**Completed:** 2026-03-27

### Implementation Notes

- **Health route pre-existing**: `apps/web/src/app/api/health/route.ts` was already implemented from an earlier story. No changes needed — verified it matches AC1 response shape `{ data: { status: "ok" } }`.
- **CI env vars**: Added `RESEND_API_KEY=ci-skip`, `RESEND_FROM_EMAIL`, `APP_URL` to the job-level `env` block so the password-reset tests (which fire-and-forget email) don't error on missing env vars.
- **OIDC only**: Both deploy workflows use `azure/login@v2` with OIDC federation (`id-token: write` permission). No `client-secret` stored in GitHub.
- **Path filters**: Web workflow triggers on `apps/web/**`; worker on `apps/worker/**`. Each workflow also triggers on changes to its own file so CI changes are validated immediately.
- **Short SHA**: `${GITHUB_SHA::7}` via bash substring expansion written to `$GITHUB_ENV` before image tagging steps.

### File List

**Modified:**
- `.github/workflows/ci.yml` — added `RESEND_*`/`APP_URL` env vars; added `test:auth`, `test:reset`, `test:account` steps

**Created:**
- `apps/web/src/app/api/health/route.ts` — already existed; no change needed
- `.github/workflows/deploy-web.yml` — OIDC build+push+deploy for Next.js container
- `.github/workflows/deploy-worker.yml` — OIDC build+push+deploy for Python worker container

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-27 | 1.0 | Story created | SM Agent |
| 2026-03-27 | 1.1 | Implementation complete; status → review | Dev Agent |
