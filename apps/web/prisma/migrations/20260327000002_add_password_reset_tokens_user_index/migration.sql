-- AddIndex: password_reset_tokens.userId
-- Missing from Story 1.4 initial migration; consistent with all other app tables
-- (statements, transactions, correction_logs, job_status all have @@index([userId]))

CREATE INDEX "idx_password_reset_tokens_user_id" ON "password_reset_tokens"("userId");
