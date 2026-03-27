/**
 * Azure Storage Queue client — statement job enqueue.
 *
 * Local dev: Azurite on port 10001 via AZURE_STORAGE_CONNECTION_STRING.
 * Production: Azure Storage Account via the same env var.
 *
 * Message protocol (App → Worker):
 * { jobId, userId, blobUrl, statementId, uploadedAt }
 *
 * Azure Storage Queue requires base64-encoded message bodies.
 */

import { QueueServiceClient } from "@azure/storage-queue";

export const QUEUE_NAME =
  process.env.AZURE_QUEUE_NAME ?? "statement-processing";

export interface StatementJobMessage {
  jobId: string;
  userId: string;
  blobUrl: string;
  statementId: string;
  uploadedAt: string; // ISO 8601
}

function getQueueServiceClient(): QueueServiceClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING is not set — cannot connect to Queue Storage",
    );
  }
  return QueueServiceClient.fromConnectionString(connectionString);
}

/**
 * Enqueue a statement processing job message.
 * Creates the queue if it does not exist (idempotent).
 *
 * Azure SDK requires messages to be base64-encoded strings.
 */
export async function enqueueStatementJob(
  message: StatementJobMessage,
): Promise<void> {
  const client = getQueueServiceClient();
  const queueClient = client.getQueueClient(QUEUE_NAME);
  await queueClient.createIfNotExists();

  const encoded = Buffer.from(JSON.stringify(message)).toString("base64");
  await queueClient.sendMessage(encoded);
}
