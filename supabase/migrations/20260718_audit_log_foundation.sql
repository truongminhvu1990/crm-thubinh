-- P7 Production Hardening — Audit Logging foundation.
-- DRAFTED ONLY. NOT APPLIED. This adds a new table, which requires explicit
-- Product Owner approval before being run against Development, per this
-- project's standing database rule (never add a table unilaterally).
-- See docs/P7_AUDIT_LOGGING.md for the full design and rationale.
--
-- Purely additive: one new table, no existing table/column touched.

BEGIN;

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor text,                    -- signed-in user's email (auth.getUser()), null if unresolvable
  action text NOT NULL,          -- 'create' | 'update' | 'delete'
  table_name text NOT NULL,
  record_id text NOT NULL,
  changes jsonb,                 -- { field: { before, after } } for update; full row for create/delete
  request_path text              -- e.g. '/api/orders/[id]/lost', for correlation with server logs
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON audit_log (occurred_at DESC);

-- Append-only: no UPDATE/DELETE policy is defined for any role, matching
-- the "an audit trail must not be editable by the thing it's auditing"
-- principle. Only INSERT (write) and SELECT (read, for a future viewer)
-- are granted.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert to authenticated" ON audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow read to authenticated" ON audit_log
  FOR SELECT TO authenticated USING (true);

-- Deliberately no anon policy: audit writes only ever happen from
-- server-side API routes reached through the login gate (proxy.ts), never
-- from an unauthenticated request.

COMMIT;

-- Verification (read-only, run after applying):
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'audit_log';
-- Expect exactly 2 rows: INSERT/{authenticated}, SELECT/{authenticated}.
