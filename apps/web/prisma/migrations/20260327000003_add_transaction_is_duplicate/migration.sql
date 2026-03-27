-- AddColumn: transactions.isDuplicate
-- Story 2.4: Duplicate transaction detection
-- Transactions from overlapping statement uploads are flagged isDuplicate=true
-- rather than being silently discarded, so users can review them.

ALTER TABLE "transactions" ADD COLUMN "isDuplicate" BOOLEAN NOT NULL DEFAULT false;
