import { NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";
import { uploadStatementBlob, deleteStatementBlob } from "~/lib/azure-blob";
import { enqueueStatementJob } from "~/lib/azure-queue";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Sanitize a filename for safe use in blob paths. */
function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 200) || "statement.csv"
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid multipart form data" } },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "A file field is required" } },
      { status: 400 },
    );
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Only .csv files are accepted" } },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "File is empty" } },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "File exceeds 10 MB limit" } },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const userId = session.user.id;

  // Pre-generate statementId so it can be used in the blob path before DB creation.
  const statementId = crypto.randomUUID();
  const safeFilename = sanitizeFilename(file.name);

  // Step 1 — Upload blob FIRST (AC3: blob before DB records).
  // If this fails, no DB rows are created → no orphan state.
  let blobUrl: string;
  try {
    blobUrl = await uploadStatementBlob(userId, statementId, safeFilename, buffer);
  } catch (err) {
    console.error("[upload] Blob upload failed:", err);
    return NextResponse.json(
      { error: { code: "UPLOAD_ERROR", message: "Failed to upload file. Please try again." } },
      { status: 500 },
    );
  }

  // Step 2 — Create Statement + JobStatus rows in DB.
  // If this fails, delete the blob to avoid orphan blob state.
  let jobId: string;
  let uploadedAt: string;
  try {
    const result = await withRLS(userId, async (tx) => {
      const statement = await tx.statement.create({
        data: { id: statementId, userId, filename: file.name },
      });
      const job = await tx.jobStatus.create({
        data: { userId, statementId: statement.id, stage: "QUEUED" },
      });
      return { jobId: job.id, uploadedAt: statement.uploadedAt.toISOString() };
    });
    jobId = result.jobId;
    uploadedAt = result.uploadedAt;
  } catch (err) {
    console.error("[upload] DB creation failed, cleaning up blob:", err);
    await deleteStatementBlob(`${userId}/${statementId}/${safeFilename}`).catch(() => {});
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Failed to create statement record. Please try again." } },
      { status: 500 },
    );
  }

  // Step 3 — Enqueue the processing job.
  // If this fails, mark job FAILED to avoid a stuck QUEUED job.
  try {
    await enqueueStatementJob({ jobId, userId, blobUrl, statementId, uploadedAt });
  } catch (err) {
    console.error("[upload] Queue enqueue failed:", err);
    await withRLS(userId, (tx) =>
      tx.jobStatus.update({
        where: { id: jobId },
        data: { stage: "FAILED", errorMessage: "Failed to enqueue processing job." },
      }),
    ).catch(() => {});
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Failed to start processing. Please try again." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { jobId, statementId } }, { status: 201 });
}
