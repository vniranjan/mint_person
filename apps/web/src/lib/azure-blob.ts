/**
 * Azure Blob Storage client — statement CSV upload/delete.
 *
 * Local dev: Azurite on port 10000 via AZURE_STORAGE_CONNECTION_STRING.
 * Production: Azure Storage Account via the same env var.
 *
 * Blob path convention: {userId}/{statementId}/{filename}
 * Container lifecycle policy: blobs auto-deleted after 1hr (configured in Azure).
 */

import { BlobServiceClient } from "@azure/storage-blob";

export const BLOB_CONTAINER_NAME =
  process.env.AZURE_BLOB_CONTAINER_NAME ?? "statements";

function getBlobServiceClient(): BlobServiceClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING is not set — cannot connect to Blob Storage",
    );
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

/**
 * Upload a CSV buffer to Azure Blob Storage.
 * Creates the container if it does not exist (idempotent).
 *
 * @returns Full blob URL (used in the queue message sent to the worker)
 */
export async function uploadStatementBlob(
  userId: string,
  statementId: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(BLOB_CONTAINER_NAME);
  await containerClient.createIfNotExists();

  const blobName = `${userId}/${statementId}/${filename}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: "text/csv" },
  });

  return blockBlobClient.url;
}

/**
 * Delete a blob by name.
 * Called by the worker after successful parsing (FR28).
 * Safe to call if blob does not exist (deleteIfExists).
 */
export async function deleteStatementBlob(blobName: string): Promise<void> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(BLOB_CONTAINER_NAME);
  await containerClient.getBlockBlobClient(blobName).deleteIfExists();
}
