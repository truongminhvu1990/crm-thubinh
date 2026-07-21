-- Staff Management module (Sprint v2.0.0).
--
-- Foundation module for Sales Commission / Customer Assignment / Activity
-- Log / Permission System. Two new tables (staff, activity_logs) plus two
-- purely-additive nullable columns on existing tables:
--   - customers.assigned_staff_id  (Feature 4 - Customer Assignment: every
--     customer can have one primary staff; the existing free-text
--     `assigned_salesperson` column is untouched, kept for backward
--     compatibility per the task's explicit "Do NOT remove it").
--   - customer_purchases.salesperson_id (Feature 5 - Salesperson Migration:
--     `salesperson` text stays the system of record it already was; the new
--     column is filled going forward, nullable so history stays valid).
--
-- `sales_commissions.salesperson_id` already exists (added, always NULL, by
-- 20260721_sales_commission_module.sql) - no migration needed there, only
-- application code starts populating/reading it (Feature 6).
--
-- FK choice: staff_id columns use ON DELETE SET NULL (same pattern as
-- products.batch_id -> product_batches), since these are live operational
-- relationships, not immutable snapshots - unlike sales_commissions'
-- deliberately FK-less purchase_id/customer_id (see that file's header),
-- which stays untouched here.

BEGIN;

-- ============================================================
-- 1. staff
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  email text,
  role text NOT NULL DEFAULT 'Sales' CHECK (role IN ('Owner', 'Manager', 'Sales', 'Marketing', 'Viewer')),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  joined_date date,
  avatar text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);

-- ============================================================
-- 2. activity_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_staff_id ON activity_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- ============================================================
-- 3. Customer Assignment (Feature 4)
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_assigned_staff_id ON customers(assigned_staff_id);

-- ============================================================
-- 4. Salesperson Migration (Feature 5)
-- ============================================================

ALTER TABLE customer_purchases ADD COLUMN IF NOT EXISTS salesperson_id uuid REFERENCES staff(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_purchases_salesperson_id ON customer_purchases(salesperson_id);

-- ============================================================
-- 5. RLS - same "Allow full access" shape (anon + authenticated) already
--    locked for every other operational table in this schema.
-- ============================================================

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON staff;
CREATE POLICY "Allow full access to anon" ON staff FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON staff;
CREATE POLICY "Allow full access to authenticated" ON staff
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON activity_logs;
CREATE POLICY "Allow full access to anon" ON activity_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON activity_logs;
CREATE POLICY "Allow full access to authenticated" ON activity_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name IN ('staff','activity_logs') ORDER BY table_name, ordinal_position;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'customers' AND column_name = 'assigned_staff_id';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'customer_purchases' AND column_name = 'salesperson_id';
-- SELECT tablename, policyname, roles FROM pg_policies
--   WHERE tablename IN ('staff','activity_logs');
