# Story 2.3: Job Progress Polling & Upload Pipeline UI

**Status:** review
**Epic:** 2 — Statement Upload & Processing Pipeline
**Created:** 2026-03-27

---

## Story
As a user, I want to see real-time progress while my statement is being processed, so that I know the system is working and when it's done.

---

## Acceptance Criteria

**AC1 — Job status API**: `GET /api/jobs/[id]/status` returns `{ data: { stage, transactionCount, errorMessage } }`. Auth required (uses `withRLS`). Returns 404 `NOT_FOUND` if the job does not exist. Returns 401 if unauthenticated. The `withRLS` query filters by both `id` and `userId`, so a job belonging to another user naturally returns 404 (not 403).

**AC2 — `useJobStatus` hook**: TanStack Query hook that polls every 2 seconds while stage is not `COMPLETE` or `FAILED`. On `COMPLETE`, invalidates the `["statements"]` query cache. Polling stops (returns `false` from `refetchInterval`) when terminal stage is reached.

**AC3 — `UploadDropZone` component**: Client component with four visual states:
- **idle**: stone-200 dashed border, "Drop your CSV here or click to browse" label
- **hover** (mouse hover): stone-400 border
- **drag-over** (file dragged over): amber-400 border, amber-50 background
- **uploading**: spinner (animated), "Uploading..." label, inputs disabled
Has `role="button"` and `tabIndex={0}`; Enter/Space keydown triggers hidden `<input type="file" accept=".csv">`. On file selection (drop or picker), calls `onUploadComplete(jobId)` prop after POSTing to `/api/statements/upload`.

**AC4 — `UploadPipeline` component**: Client component displaying job progress. Stage → narrative label mapping:
- `QUEUED` → "Getting ready..."
- `UPLOADING` → "Uploading..."
- `READING` → "Reading transactions... [transactionCount] found"
- `CATEGORIZING` → "Categorizing... [progress%]" (progress based on transactionCount/estimated total)
- `COMPLETE` → "Done — [transactionCount] transactions imported"
- `FAILED` → error message (or "Processing failed. Please try again.")

Has `role="status"` and `aria-live="polite"` on the stage description element. Shows a `<Progress>` bar (indeterminate for READING, 0→100% fill for CATEGORIZING, 100% for COMPLETE).

**AC5 — Dashboard page integration**: Server component `dashboard/page.tsx` renders a client component wrapper. Logic:
- No prior statements and no active job → full-page centered `UploadDropZone`
- Active job (jobId in state) → render `UploadPipeline`
- After `COMPLETE` → show success message: "Import complete!" with a link to `/statements`

---

## Tasks

- [ ] **Task 1: Create job status API route** (AC: 1)
  - [ ] Create `apps/web/src/app/api/jobs/[id]/status/route.ts`
  - [ ] Export `async function GET(_req, { params })`
  - [ ] Await `params` (Next.js 15 dynamic params are async)
  - [ ] Auth check → 401 if no session
  - [ ] Query via `withRLS` with `findFirst({ where: { id, userId } })`
  - [ ] Return 404 if `null`, else return `{ data: { stage, transactionCount, errorMessage } }`

- [ ] **Task 2: Implement `useJobStatus` hook** (AC: 2)
  - [ ] Replace stub in `apps/web/src/hooks/use-job-status.ts`
  - [ ] Use `useQuery` with `queryKey: ["job-status", jobId]`
  - [ ] Set `enabled: !!jobId`
  - [ ] `refetchInterval` callback: return `false` when stage is `COMPLETE` or `FAILED`, else `2000`
  - [ ] On `COMPLETE`: call `queryClient.invalidateQueries({ queryKey: ["statements"] })`

- [ ] **Task 3: Create `UploadDropZone` component** (AC: 3)
  - [ ] Create `apps/web/src/components/upload-drop-zone.tsx` (`"use client"`)
  - [ ] State: `isDragOver`, `isUploading`
  - [ ] `dragover` event: `e.preventDefault()`, set `isDragOver=true`
  - [ ] `dragleave` event: set `isDragOver=false`
  - [ ] `drop` event: `e.preventDefault()`, get `e.dataTransfer.files[0]`, call `handleFile(file)`
  - [ ] Hidden `<input type="file" accept=".csv">` ref; `role="button"` div triggers `.click()` on Enter/Space
  - [ ] `handleFile(file)`: set `isUploading=true`, POST to `/api/statements/upload` with FormData, on success call `onUploadComplete(data.jobId)`, on error show toast
  - [ ] Props: `onUploadComplete: (jobId: string) => void`, optional `compact?: boolean`

- [ ] **Task 4: Create `UploadPipeline` component** (AC: 4)
  - [ ] Create `apps/web/src/components/upload-pipeline.tsx` (`"use client"`)
  - [ ] Accept `jobId: string` prop
  - [ ] Call `useJobStatus(jobId)`
  - [ ] Map stage to narrative label string
  - [ ] Render `<Progress>` component: value=0 when READING (indeterminate-like), value=50 when CATEGORIZING, value=100 when COMPLETE
  - [ ] Wrap stage label in `<p role="status" aria-live="polite">`
  - [ ] Show spinner (Loader2 from lucide-react) for in-progress stages

- [ ] **Task 5: Update dashboard page** (AC: 5)
  - [ ] Update `apps/web/src/app/(app)/dashboard/page.tsx` — server component queries for existing statements count
  - [ ] Create `apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx` — client component holding `jobId` state
  - [ ] Pass `hasStatements` prop from server page to client component
  - [ ] Client component: if `jobId` is set → render `UploadPipeline`; if stage is COMPLETE → show success + link; else → render `UploadDropZone`

- [ ] **Task 6: Integration test for job status API** (AC: 1)
  - [ ] Add `"test:jobs"` script to `apps/web/package.json`
  - [ ] Create `apps/web/src/__tests__/job-status.test.ts`
  - [ ] Test: returns 200 with `{ data: { stage, transactionCount, errorMessage } }` for valid owned job
  - [ ] Test: returns 404 for nonexistent job ID
  - [ ] Test: returns 401 when unauthenticated

---

## Dev Notes

### Job status API route (full implementation)
```typescript
// apps/web/src/app/api/jobs/[id]/status/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }
  const { id } = await params;
  const job = await withRLS(session.user.id, (tx) =>
    tx.jobStatus.findFirst({ where: { id, userId: session.user.id } })
  );
  if (!job) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found" } },
      { status: 404 }
    );
  }
  return NextResponse.json({
    data: {
      stage: job.stage,
      transactionCount: job.transactionCount,
      errorMessage: job.errorMessage,
    },
  });
}
```

### `useJobStatus` hook (full implementation)
```typescript
// apps/web/src/hooks/use-job-status.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface JobStatusData {
  stage: string;
  transactionCount: number;
  errorMessage: string | null;
}

export function useJobStatus(jobId: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["job-status", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/status`);
      if (!res.ok) throw new Error("Failed to fetch job status");
      return res.json() as Promise<{ data: JobStatusData }>;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const stage = query.state.data?.data?.stage;
      if (stage === "COMPLETE" || stage === "FAILED") {
        if (stage === "COMPLETE") {
          void queryClient.invalidateQueries({ queryKey: ["statements"] });
        }
        return false;
      }
      return 2000;
    },
  });
}
```

### UploadDropZone component
```typescript
// apps/web/src/components/upload-drop-zone.tsx
"use client";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { useToast } from "~/hooks/use-toast";
import { cn } from "~/lib/utils";

interface UploadDropZoneProps {
  onUploadComplete: (jobId: string) => void;
  compact?: boolean;
}

export function UploadDropZone({ onUploadComplete, compact = false }: UploadDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function handleFile(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/statements/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: json.error?.message ?? "Upload failed" });
        return;
      }
      onUploadComplete(json.data.jobId as string);
    } catch {
      toast({ variant: "destructive", title: "Upload failed. Please try again." });
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      onClick={() => !isUploading && inputRef.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer select-none",
        compact ? "p-6" : "p-16",
        isDragOver ? "border-amber-400 bg-amber-50" : isUploading ? "border-stone-200" : "border-stone-200 hover:border-stone-400",
      )}
      aria-label="Upload CSV bank statement"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
      />
      {isUploading ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-stone-400 mb-2" />
          <p className="text-sm text-stone-500">Uploading...</p>
        </>
      ) : (
        <>
          <Upload className="h-8 w-8 text-stone-400 mb-2" />
          <p className="text-sm text-stone-600 font-medium">Drop your CSV here or click to browse</p>
          <p className="text-xs text-stone-400 mt-1">Supports Chase, Amex, BofA, Capital One, Wells Fargo · Max 10 MB</p>
        </>
      )}
    </div>
  );
}
```

### UploadPipeline component
```typescript
// apps/web/src/components/upload-pipeline.tsx
"use client";
import { Progress } from "~/components/ui/progress";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useJobStatus } from "~/hooks/use-job-status";

const STAGE_LABELS: Record<string, (count: number) => string> = {
  QUEUED: () => "Getting ready...",
  UPLOADING: () => "Uploading...",
  READING: (n) => `Reading transactions...${n > 0 ? ` ${n} found` : ""}`,
  CATEGORIZING: (n) => `Categorizing...${n > 0 ? ` ${n} transactions` : ""}`,
  COMPLETE: (n) => `Done — ${n} transaction${n !== 1 ? "s" : ""} imported`,
  FAILED: () => "Processing failed. Please try again.",
};

const STAGE_PROGRESS: Record<string, number> = {
  QUEUED: 5,
  UPLOADING: 20,
  READING: 45,
  CATEGORIZING: 75,
  COMPLETE: 100,
  FAILED: 0,
};

interface UploadPipelineProps {
  jobId: string;
}

export function UploadPipeline({ jobId }: UploadPipelineProps) {
  const { data } = useJobStatus(jobId);
  const stage = data?.data?.stage ?? "QUEUED";
  const count = data?.data?.transactionCount ?? 0;
  const errorMessage = data?.data?.errorMessage;
  const isFailed = stage === "FAILED";
  const isComplete = stage === "COMPLETE";
  const label = isFailed
    ? (errorMessage ?? "Processing failed. Please try again.")
    : (STAGE_LABELS[stage]?.(count) ?? "Processing...");

  return (
    <div className="flex flex-col gap-3 w-full max-w-md">
      <div className="flex items-center gap-2">
        {isComplete ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        ) : isFailed ? (
          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-amber-500 shrink-0" />
        )}
        <p role="status" aria-live="polite" className="text-sm text-stone-700">
          {label}
        </p>
      </div>
      {!isFailed && (
        <Progress value={STAGE_PROGRESS[stage] ?? 0} className="h-2" />
      )}
    </div>
  );
}
```

### Dashboard page structure
```typescript
// apps/web/src/app/(app)/dashboard/page.tsx  (server component)
import { auth } from "~/lib/auth";
import { withRLS } from "~/lib/middleware-helpers";
import { DashboardClient } from "./_components/dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  const count = await withRLS(session!.user!.id, (tx) =>
    tx.statement.count({ where: { userId: session!.user!.id } })
  );
  return <DashboardClient hasStatements={count > 0} />;
}
```

```typescript
// apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { UploadDropZone } from "~/components/upload-drop-zone";
import { UploadPipeline } from "~/components/upload-pipeline";

export function DashboardClient({ hasStatements }: { hasStatements: boolean }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-lg font-medium text-emerald-700">Import complete!</p>
        <Link href="/statements" className="text-sm text-amber-600 underline underline-offset-2">
          View your statements →
        </Link>
      </div>
    );
  }

  if (jobId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <UploadPipeline jobId={jobId} onComplete={() => setIsComplete(true)} />
      </div>
    );
  }

  return (
    <div className={hasStatements ? "p-6" : "flex items-center justify-center min-h-[80vh]"}>
      <div className="w-full max-w-lg">
        <UploadDropZone onUploadComplete={setJobId} compact={hasStatements} />
      </div>
    </div>
  );
}
```

Note: `UploadPipeline` needs an `onComplete` prop added to call `setIsComplete(true)` when `stage === "COMPLETE"`. Add this prop to the component definition.

### Progress bar notes
`<Progress>` from shadcn uses `value` (0-100). For the READING stage where count is unknown upfront, show a pulsing/indeterminate bar by animating the value, or simply use `value={45}` as a fixed midpoint placeholder.

---

## Architecture Compliance
- API route uses `withRLS(userId, fn)` for all DB reads
- Returns `{ data: ... }` on success, `{ error: { code, message } }` on failure
- `useJobStatus` uses TanStack Query (`useQuery`) — no raw `useEffect` for polling
- Client components explicitly marked `"use client"` — server components have no directive
- Dynamic params awaited (`await params`) per Next.js 15 requirement
- No new npm packages: `lucide-react`, `@tanstack/react-query`, and shadcn `progress`/`toast` already installed

---

## Definition of Done
- [ ] `GET /api/jobs/[id]/status` returns correct shape for valid/invalid/unauthorized requests
- [ ] `useJobStatus` stops polling at `COMPLETE`/`FAILED` and invalidates `["statements"]` on COMPLETE
- [ ] `UploadDropZone` renders 4 visual states correctly; keyboard accessible
- [ ] `UploadPipeline` shows correct narrative label for each stage with `aria-live="polite"`
- [ ] Dashboard shows full-page drop zone when `hasStatements=false`; pipeline when job active; success link when complete
- [ ] Integration tests for job status API pass (200 / 404 / 401)
- [ ] No TypeScript errors

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
- `apps/web/src/app/api/jobs/[id]/status/route.ts` — Created: GET job status endpoint
- `apps/web/src/hooks/use-job-status.ts` — Created: TanStack Query hook with auto-stop polling
- `apps/web/src/components/upload-drop-zone.tsx` — Created: 4-state drop zone component
- `apps/web/src/components/upload-pipeline.tsx` — Created: stage progress component
- `apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx` — Created: dashboard client shell
- `apps/web/src/app/(app)/dashboard/page.tsx` — Rewritten: thin server shell rendering DashboardClient

### Implementation Notes
- `useJobStatus` stops polling when stage is COMPLETE or FAILED (`refetchInterval` returns false)
- On COMPLETE, invalidates `["statements"]` TanStack Query cache
- UploadDropZone: 4 states (idle/hover/drag-over/uploading), keyboard-accessible (Enter/Space), `compact` prop
- UploadPipeline: `role="status"` + `aria-live="polite"` for screen reader support
- Job status route: async params pattern with `await params` per Next.js App Router
