-- Marketing Automation (Sprint v3.1.0), Package 1 - Database Migration.
--
-- Per docs/MARKETING_AUTOMATION_SPEC.md + docs/MARKETING_AUTOMATION_DATABASE.md
-- (both Revision 2, LOCKED) + docs/MARKETING_AUTOMATION_UI.md (Revision 1,
-- LOCKED): seven new tables only - marketing_automations,
-- marketing_automation_runs, marketing_automation_logs,
-- marketing_campaign_automations, marketing_loyalty_rules,
-- marketing_loyalty_transactions, marketing_vouchers. Zero changes to any
-- existing table (marketing_segments, marketing_campaigns, customers, staff
-- all untouched) - DATABASE.md §7 step 5.
--
-- Created in dependency order per DATABASE.md §7 step 1. Reuses the existing
-- set_customers_updated_at() trigger function (defined by
-- 20260726_marketing_module.sql) for the three tables here with an
-- updated_at column (automations, loyalty_rules, vouchers) - runs/logs/
-- transactions/campaign_automations are append-only, no updated_at.
--
-- FK choices follow DATABASE.md §2 exactly: target_segment_id uses ON DELETE
-- RESTRICT (same as marketing_campaigns.target_segment_id precedent); staff
-- references use ON DELETE SET NULL; run/log/transaction parent references
-- use ON DELETE CASCADE (child row has no meaning without its parent);
-- marketing_vouchers.customer_id deliberately uses ON DELETE SET NULL, not
-- CASCADE (a voucher shouldn't vanish with its customer).
--
-- No native enum type is used anywhere - plain text + CHECK allow-lists,
-- matching Marketing Foundation's stated convention.

BEGIN;

-- ============================================================
-- 1. marketing_automations
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  automation_type text NOT NULL CHECK (automation_type IN (
    'Birthday Greeting', 'Welcome Customer',
    'No Purchase 30 Days', 'No Purchase 60 Days', 'No Purchase 90 Days',
    'VIP Upgrade', 'Manual Broadcast'
  )),
  trigger_type text NOT NULL CHECK (trigger_type IN ('Manual', 'Daily Schedule')),
  frequency text NOT NULL CHECK (frequency IN ('Once', 'Daily', 'Weekly', 'Monthly')),
  target_segment_id uuid NOT NULL REFERENCES marketing_segments(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Paused', 'Completed', 'Cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_automations_status ON marketing_automations(status);
CREATE INDEX IF NOT EXISTS idx_marketing_automations_type ON marketing_automations(automation_type);
CREATE INDEX IF NOT EXISTS idx_marketing_automations_segment_id ON marketing_automations(target_segment_id);

CREATE TRIGGER marketing_automations_set_updated_at
  BEFORE UPDATE ON marketing_automations
  FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- ============================================================
-- 2. marketing_automation_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES marketing_automations(id) ON DELETE CASCADE,
  triggered_by text NOT NULL CHECK (triggered_by IN ('Manual', 'Daily Schedule')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Running', 'Success', 'Failed', 'Cancelled')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON marketing_automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started_at ON marketing_automation_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON marketing_automation_runs(status);

-- ============================================================
-- 3. marketing_automation_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES marketing_automation_runs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  result text NOT NULL DEFAULT 'Pending' CHECK (result IN ('Pending', 'Success', 'Failed')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_run_id ON marketing_automation_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_customer_id ON marketing_automation_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_result ON marketing_automation_logs(result);

-- ============================================================
-- 4. marketing_campaign_automations (join table; Campaign references
--    Automation only, passive - no automatic execution)
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_campaign_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES marketing_automations(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, automation_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_automations_campaign_id ON marketing_campaign_automations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_automations_automation_id ON marketing_campaign_automations(automation_id);

-- ============================================================
-- 5. marketing_loyalty_rules
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_loyalty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  points_value integer NOT NULL CHECK (points_value > 0),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rules_status ON marketing_loyalty_rules(status);

CREATE TRIGGER marketing_loyalty_rules_set_updated_at
  BEFORE UPDATE ON marketing_loyalty_rules
  FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- ============================================================
-- 6. marketing_loyalty_transactions (Point History ledger; Balance is
--    always SUM(points), never stored)
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES marketing_loyalty_rules(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('Earn', 'Adjust', 'Expire')),
  points integer NOT NULL CHECK (points <> 0),
  note text,
  created_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON marketing_loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_created_at ON marketing_loyalty_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_rule_id ON marketing_loyalty_transactions(rule_id);

-- ============================================================
-- 7. marketing_vouchers (no redemption flow - status only)
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Expired', 'Disabled')),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  expires_at date,
  created_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_code ON marketing_vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON marketing_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_customer_id ON marketing_vouchers(customer_id);

CREATE TRIGGER marketing_vouchers_set_updated_at
  BEFORE UPDATE ON marketing_vouchers
  FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- ============================================================
-- 8. RLS - same "Allow full access" shape (anon + authenticated) already
--    locked for every other operational table in this schema
--    (DATABASE.md §6 - application-layer permission.ts is the real
--    authorization boundary, not differentiated RLS).
-- ============================================================

ALTER TABLE marketing_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_automations;
CREATE POLICY "Allow full access to anon" ON marketing_automations FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_automations;
CREATE POLICY "Allow full access to authenticated" ON marketing_automations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_automation_runs;
CREATE POLICY "Allow full access to anon" ON marketing_automation_runs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_automation_runs;
CREATE POLICY "Allow full access to authenticated" ON marketing_automation_runs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_automation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_automation_logs;
CREATE POLICY "Allow full access to anon" ON marketing_automation_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_automation_logs;
CREATE POLICY "Allow full access to authenticated" ON marketing_automation_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_campaign_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_campaign_automations;
CREATE POLICY "Allow full access to anon" ON marketing_campaign_automations FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_campaign_automations;
CREATE POLICY "Allow full access to authenticated" ON marketing_campaign_automations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_loyalty_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_loyalty_rules;
CREATE POLICY "Allow full access to anon" ON marketing_loyalty_rules FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_loyalty_rules;
CREATE POLICY "Allow full access to authenticated" ON marketing_loyalty_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_loyalty_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_loyalty_transactions;
CREATE POLICY "Allow full access to anon" ON marketing_loyalty_transactions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_loyalty_transactions;
CREATE POLICY "Allow full access to authenticated" ON marketing_loyalty_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_vouchers;
CREATE POLICY "Allow full access to anon" ON marketing_vouchers FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_vouchers;
CREATE POLICY "Allow full access to authenticated" ON marketing_vouchers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('marketing_automations','marketing_automation_runs',
--     'marketing_automation_logs','marketing_campaign_automations',
--     'marketing_loyalty_rules','marketing_loyalty_transactions','marketing_vouchers');
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--   WHERE table_name IN ('marketing_automations','marketing_automation_runs',
--     'marketing_automation_logs','marketing_campaign_automations',
--     'marketing_loyalty_rules','marketing_loyalty_transactions','marketing_vouchers')
--   ORDER BY table_name, ordinal_position;
-- SELECT tablename, indexname FROM pg_indexes
--   WHERE tablename IN ('marketing_automations','marketing_automation_runs',
--     'marketing_automation_logs','marketing_campaign_automations',
--     'marketing_loyalty_rules','marketing_loyalty_transactions','marketing_vouchers')
--   AND indexname LIKE 'idx_%' ORDER BY tablename, indexname;
-- SELECT tablename, policyname, roles FROM pg_policies
--   WHERE tablename IN ('marketing_automations','marketing_automation_runs',
--     'marketing_automation_logs','marketing_campaign_automations',
--     'marketing_loyalty_rules','marketing_loyalty_transactions','marketing_vouchers');
