# Test Automation Summary

**Generated:** 2026-04-10
**Framework:** Vitest (API integration) + Playwright (E2E browser)

---

## Generated Tests

### API Integration Tests (Vitest)

- [x] `src/__tests__/rls-isolation.test.ts` — Cross-tenant RLS data isolation (Epic 1)
- [x] `src/__tests__/auth-register.test.ts` — User registration (Epic 1)
- [x] `src/__tests__/auth-reset.test.ts` — Password reset flow (Epic 1)
- [x] `src/__tests__/account-delete.test.ts` — Account deletion & data purge (Epic 1)
- [x] `src/__tests__/statements-upload.test.ts` — CSV statement upload (Epic 2)
- [x] `src/__tests__/job-status.test.ts` — Job status polling (Epic 2)
- [x] `src/__tests__/category-correction.test.ts` — Category correction & exclusion toggle (Epic 3)
- [x] `src/__tests__/monthly-summary.test.ts` — Monthly summary API (Epic 4)
- [x] `src/__tests__/transactions.test.ts` — Transaction list & search (Epic 4)
- [x] `src/__tests__/admin-users.test.ts` — Admin user CRUD (Epic 5)
- [x] `src/__tests__/admin-health.test.ts` — Admin health endpoint (Epic 5)

### E2E Browser Tests (Playwright — Chromium)

- [x] `src/e2e/auth.spec.ts` — Register, login, sign out, password reset
- [x] `src/e2e/dashboard.spec.ts` — KPI strip, month nav, search, chart structure
- [x] `src/e2e/categorization.spec.ts` — Review queue, transaction table, settings page
- [x] `src/e2e/admin.spec.ts` — Admin access control, user list, create user dialog, health section

---

## Coverage

| Area | API Tests | E2E Tests |
|------|-----------|-----------|
| Auth (register, login, reset, delete) | ✅ Full | ✅ Full |
| Multi-tenant RLS isolation | ✅ Full | — |
| CSV upload & job polling | ✅ Full | — |
| Category correction & exclusion | ✅ Full | ✅ Structural |
| Monthly summary (totals, pct, vsLastMonth) | ✅ Full | ✅ Structural |
| Transaction list & category filter | ✅ Full | ✅ Structural |
| Transaction search (merchant + amount) | ✅ Full | ✅ Structural |
| Month navigation | — | ✅ Full |
| Admin user CRUD | ✅ Full | ✅ Full* |
| Admin health endpoint | ✅ Full | ✅ Structural |

*Admin E2E tests skip if `E2E_ADMIN_EMAIL` env var is not set.

---

## How to Run

### API integration tests (requires PostgreSQL at `DATABASE_URL`)
```bash
# Run all API tests
cd apps/web && npm run test:api

# Run individual suites
npm run test:correction     # Epic 3
npm run test:summary        # Epic 4
npm run test:transactions   # Epic 4
npm run test:admin-users    # Epic 5
npm run test:admin-health   # Epic 5
```

### E2E browser tests (requires app running at localhost:3000)
```bash
# Start the app first
docker compose up

# Then run E2E tests
cd apps/web && npm run test:e2e

# Interactive UI mode (Playwright UI)
npm run test:e2e:ui

# With admin credentials for admin panel tests
E2E_ADMIN_EMAIL=admin@yourapp.com E2E_ADMIN_PASSWORD=yourpassword npm run test:e2e
```

---

## Notes

- API tests call route handlers directly against a real PostgreSQL DB — no mocks for DB layer
- Azure Blob/Queue are mocked in upload tests; real connections tested via docker-compose
- E2E admin tests are skipped when `E2E_ADMIN_EMAIL` is not set (requires a pre-seeded admin account)
- Run `npx playwright install chromium` once to download the browser binary