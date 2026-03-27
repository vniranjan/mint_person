-- Enable Row Level Security on all tenant-scoped tables.
-- FORCE ROW LEVEL SECURITY is required so the table owner (mintuser) is also
-- subject to policies — without FORCE, the owner bypasses all RLS silently.
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements FORCE ROW LEVEL SECURITY;

ALTER TABLE correction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE job_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_status FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy: app queries only see the current user's rows.
-- current_setting('app.current_user_id', true) — missingsok=true prevents errors
-- when the variable is unset (e.g. during migrations or health checks).
-- WITH CHECK explicitly enforces the same constraint on INSERT/UPDATE, preventing
-- a user from writing a row with a different userId than their own session.
CREATE POLICY tenant_isolation ON transactions
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY tenant_isolation ON statements
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY tenant_isolation ON correction_logs
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY tenant_isolation ON job_status
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- Service role for the Python worker (BYPASSRLS — processes jobs for any user).
-- SECURITY: Do NOT commit the real password to VCS.
-- In production: set via Azure Key Vault / Container Apps secret reference.
-- Run post-deploy: ALTER ROLE worker_role PASSWORD '<secret-from-keyvault>';
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'worker_role') THEN
    -- Placeholder password — MUST be changed before production use.
    CREATE ROLE worker_role BYPASSRLS LOGIN PASSWORD 'CHANGE_BEFORE_PRODUCTION';
  END IF;
END
$$;

-- Grant current tables to worker_role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO worker_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO worker_role;

-- Grant future tables automatically — prevents silent "permission denied" on new migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO worker_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO worker_role;
