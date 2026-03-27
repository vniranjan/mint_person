import { NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";
import { uploadStatementBlob } from "~/lib/azure-blob";
import { enqueueStatementJob } from "~/lib/azure-queue";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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

  // Create Statement + JobStatus rows first to get their IDs, then upload blob.
  // Use withRLS so RLS session variable is set for tenant isolation.
  const { statementId, jobId } = await withRLS(userId, async (tx) => {
    const statement = await tx.statement.create({
      data: { userId, filename: file.name },
    });
    const job = await tx.jobStatus.create({
      data: { userId, statementId: statement.id, stage: "QUEUED" },
    });
    return { statementId: statement.id, jobId: job.id };
  });

  // Upload the file to Azure Blob Storage.
  const blobUrl = await uploadStatementBlob(userId, statementId, file.name, buffer);

  // Enqueue the processing job for the Python worker.
  await enqueueStatementJob({
    jobId,
    userId,
    blobUrl,
    statementId,
    uploadedAt: new Date().toISOString(),
  });

  return NextResponse.json({ data: { jobId, statementId } }, { status: 201 });
}
