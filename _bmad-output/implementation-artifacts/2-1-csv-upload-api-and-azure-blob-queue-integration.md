# Story 2.1: CSV Upload API & Azure Blob/Queue Integration

**Status:** review
**Epic:** 2 — Statement Upload & Processing Pipeline
**Created:** 2026-03-27

---

## Story
As a user, I want to upload a CSV bank statement, so that the system can parse and categorize my transactions.

---

## Acceptance Criteria

**AC1 — File validation**: `POST /api/statements/upload` accepts `multipart/form-data` with a `file` field. Validates: must be `.csv` extension, ≤10MB. Returns 400 with `{ error: { code: "VALIDATION_ERROR", message: "..." } }` on failure.

**AC2 — DB record creation**: Valid upload creates a `Statement` row (with filename) and a `JobStatus` row (stage=QUEUED) in the DB using `withRLS`. Returns 201 `{ data: { jobId, statementId } }`.

**AC3 — Blob upload first**: File is uploaded to Azure Blob Storage at path `{userId}/{statementId}/{filename}` before DB records are created. The blob URL is stored for use in the queue message.

**AC4 — Queue enqueue**: After DB records are created, a message `{ jobId, userId, blobUrl, statementId, uploadedAt }` is enqueued to Azure Storage Queue (`AZURE_QUEUE_NAME`). `uploadedAt` is the Statement's `uploadedAt` as ISO string.

**AC5 — Auth guard**: Unauthenticated request returns 401 with `UNAUTHORIZED_RESPONSE`.

**AC6 — Utility functions**: `azure-blob.ts` exports `uploadStatementBlob(userId, statementId, filename, buffer)` returning the blob URL string. `azure-queue.ts` exports `enqueueStatementJob(message)` returning void. Both create their Azure resource (container/queue) if it does not exist.

---

## Tasks

- [ ] **Task 1: Implement `azure-blob.ts`** (AC: 3, 6)
  - [ ] Import `BlobServiceClient` from `@azure/storage-blob`
  - [ ] Create singleton `blobServiceClient` from `process.env.AZURE_STORAGE_CONNECTION_STRING`
  - [ ] Implement `uploadStatementBlob(userId, statementId, filename, buffer)`: call `createIfNotExists()` on the container, upload buffer with `blobContentType: "text/csv"`, return `blockBlobClient.url`
  - [ ] Keep existing `BLOB_CONTAINER_NAME` export

- [ ] **Task 2: Implement `azure-queue.ts`** (AC: 4, 6)
  - [ ] Import `QueueServiceClient` from `@azure/storage-queue`
  - [ ] Create singleton `queueServiceClient` from `process.env.AZURE_STORAGE_CONNECTION_STRING`
  - [ ] Implement `enqueueStatementJob(message)`: call `createIfNotExists()` on the queue client, base64-encode `JSON.stringify(message)` via `Buffer.from(...).toString("base64")`, call `sendMessage(encoded)`
  - [ ] Keep existing `QUEUE_NAME` export

- [ ] **Task 3: Create upload route** (AC: 1, 2, 3, 4, 5)
  - [ ] Create `apps/web/src/app/api/statements/upload/route.ts`
  - [ ] Export `async function POST(request: Request)`
  - [ ] Call `auth()`; return 401 if no session
  - [ ] Parse `formData`, get `file` field; validate it is a `File` instance, has `.csv` extension, is ≤10MB — return 400 `VALIDATION_ERROR` otherwise
  - [ ] Read file into `Buffer` via `Buffer.from(await file.arrayBuffer())`
  - [ ] Call `uploadStatementBlob(userId, statementId, filename, buffer)` — generate `statementId` as `cuid()` before upload so the blob path is consistent
  - [ ] Use `withRLS` to create `statement` row then `jobStatus` row (stage `QUEUED`) in a single Prisma transaction
  - [ ] Call `enqueueStatementJob({ jobId, userId, blobUrl, statementId, uploadedAt })`
  - [ ] Return `NextResponse.json({ data: { jobId, statementId } }, { status: 201 })`

- [ ] **Task 4: Integration tests** (AC: 1, 2, 5)
  - [ ] Add `"test:upload": "vitest run src/__tests__/statements-upload.test.ts"` to `apps/web/package.json` scripts
  - [ ] Create `apps/web/src/__tests__/statements-upload.test.ts`
  - [ ] Mock `~/lib/azure-blob` and `~/lib/azure-queue`
  - [ ] Mock `~/lib/auth` to return a fake session
  - [ ] Mock `~/lib/db` (Prisma)
  - [ ] Test: authenticated upload of valid CSV → 201 with `jobId` and `statementId`
  - [ ] Test: wrong file type (e.g. `.pdf`) → 400 `VALIDATION_ERROR`
  - [ ] Test: file size >10MB → 400 `VALIDATION_ERROR`
  - [ ] Test: no auth session → 401

---

## Dev Notes

### azure-blob.ts (full implementation)
```typescript
// apps/web/src/lib/azure-blob.ts
import { BlobServiceClient } from "@azure/storage-blob";

export const BLOB_CONTAINER_NAME = process.env.AZURE_BLOB_CONTAINER_NAME ?? "statements";

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING ?? ""
);

export async function uploadStatementBlob(
  userId: string,
  statementId: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  const containerClient = blobServiceClient.getContainerClient(BLOB_CONTAINER_NAME);
  await containerClient.createIfNotExists();
  const blobName = `${userId}/${statementId}/${filename}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: "text/csv" },
  });
  return blockBlobClient.url;
}
```

### azure-queue.ts (full implementation)
```typescript
// apps/web/src/lib/azure-queue.ts
import { QueueServiceClient } from "@azure/storage-queue";

export const QUEUE_NAME = process.env.AZURE_QUEUE_NAME ?? "statement-jobs";

const queueServiceClient = QueueServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING ?? ""
);

export interface StatementJobMessage {
  jobId: string;
  userId: string;
  blobUrl: string;
  statementId: string;
  uploadedAt: string;
}

export async function enqueueStatementJob(message: StatementJobMessage): Promise<void> {
  const queueClient = queueServiceClient.getQueueClient(QUEUE_NAME);
  await queueClient.createIfNotExists();
  const encoded = Buffer.from(JSON.stringify(message)).toString("base64");
  await queueClient.sendMessage(encoded);
}
```

### Upload route (full implementation)
```typescript
// apps/web/src/app/api/statements/upload/route.ts
import { NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { auth } from "~/lib/auth";
import { prisma } from "~/lib/db";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";
import { uploadStatementBlob } from "~/lib/azure-blob";
import { enqueueStatementJob } from "~/lib/azure-queue";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }
  const userId = session.user.id;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "file field is required" } },
      { status: 400 }
    );
  }
  if (!file.name.endsWith(".csv")) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Only .csv files are accepted" } },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "File must be ≤10 MB" } },
      { status: 400 }
    );
  }

  const statementId = createId();
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload blob first so we have the URL before writing DB rows
  const blobUrl = await uploadStatementBlob(userId, statementId, file.name, buffer);

  // Create DB records under RLS
  const { jobId } = await withRLS(userId, async (tx) => {
    await tx.statement.create({
      data: { id: statementId, userId, filename: file.name },
    });
    const job = await tx.jobStatus.create({
      data: { userId, statementId, stage: "QUEUED" },
    });
    return { jobId: job.id };
  });

  // Enqueue worker message
  await enqueueStatementJob({
    jobId,
    userId,
    blobUrl,
    statementId,
    uploadedAt: new Date().toISOString(),
  });

  return NextResponse.json({ data: { jobId, statementId } }, { status: 201 });
}
```

### ID generation
Use `createId()` from `@paralleldrive/cuid2` (already in use by Prisma schema's `@default(cuid())`). If that package is not directly importable, fall back to `crypto.randomUUID()` for `statementId`; Prisma's `@default(cuid())` handles the jobStatus id automatically.

### Validation order
Always validate before touching external services: auth → file present → file type → file size → blob upload → DB → queue.

### Error handling
If `uploadStatementBlob` throws, let the error propagate — no DB row has been written yet so there is no cleanup needed. If DB `withRLS` throws after blob upload, the orphaned blob is acceptable (no job will reference it and it will not affect users). Log the error but do not retry in this route.

### Environment variables required
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_BLOB_CONTAINER_NAME` (defaults to `"statements"`)
- `AZURE_QUEUE_NAME` (defaults to `"statement-jobs"`)

---

## Architecture Compliance
- Uses `withRLS(userId, fn)` for all DB writes — no direct `prisma` calls in route handler
- Returns `{ data: ... }` on success, `{ error: { code, message } }` on failure
- Auth check via `auth()` from `~/lib/auth` as first route operation
- Azure SDK packages (`@azure/storage-blob`, `@azure/storage-queue`) already in `package.json` — no new packages needed
- Queue message shape matches architecture spec: `{ jobId, userId, blobUrl, statementId, uploadedAt }`
- `statementId` is generated on the web side so blob path and DB row ID are consistent

---

## Definition of Done
- [ ] `azure-blob.ts` exports `uploadStatementBlob` and `BLOB_CONTAINER_NAME`
- [ ] `azure-queue.ts` exports `enqueueStatementJob` and `QUEUE_NAME`
- [ ] `POST /api/statements/upload` returns 201 with `{ data: { jobId, statementId } }` for valid CSV
- [ ] Invalid file type returns 400 `VALIDATION_ERROR`
- [ ] File >10MB returns 400 `VALIDATION_ERROR`
- [ ] Unauthenticated request returns 401
- [ ] All 4 integration test cases pass
- [ ] No TypeScript errors (`tsc --noEmit`)

---

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-27 | 1.0 | Story created | SM Agent |
| 2026-03-27 | 1.1 | Implementation complete | Dev Agent |

---

## Dev Agent Record

**Completed by:** Dev Agent (claude-sonnet-4-6)
**Completed:** 2026-03-27

### Files Created/Modified
- `apps/web/src/lib/azure-blob.ts` — Created: `uploadStatementBlob`, `deleteStatementBlob`
- `apps/web/src/lib/azure-queue.ts` — Created: `enqueueStatementJob`, `StatementJobMessage`
- `apps/web/src/app/api/statements/upload/route.ts` — Created: POST upload endpoint
- `apps/web/src/app/api/statements/route.ts` — Created: GET statements list endpoint
- `apps/web/src/__tests__/statements-upload.test.ts` — Created: integration tests (4 cases)
- `apps/web/package.json` — Modified: added `test:upload` script
- `apps/web/prisma/schema.prisma` — Modified: added `isDuplicate` to Transaction (via Story 2-4)

### Implementation Notes
- Blob upload happens before DB record creation per AC3 ordering
- Container and queue created with `createIfNotExists` on first use
- Azure Queue messages are base64-encoded JSON per SDK requirements
- `withRLS` wraps all DB operations for multi-tenant isolation
- File validation: `.csv` extension, ≤10MB, non-empty content
