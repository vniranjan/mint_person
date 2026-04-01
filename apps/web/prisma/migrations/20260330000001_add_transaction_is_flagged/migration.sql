-- AlterTable: add isFlagged to transactions
ALTER TABLE "transactions" ADD COLUMN "isFlagged" BOOLEAN NOT NULL DEFAULT false;
