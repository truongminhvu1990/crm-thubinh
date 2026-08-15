-- Per-User Report Column Preferences (docs/07_REPORTING_SPEC.md, Reporting
-- Product Owner task, 2026-08-14).
--
-- Scope: ONE new table. No existing user/profile/staff table modified.
-- Reused: `staff` (identity — same table Orders/Permission Center already
-- resolve "current user" against via getCurrentStaff/getCurrentStaffFromRequest),
-- the `set_customers_updated_at` trigger function already used by
-- compensations/settlements/compensation_policies for the same "bump
-- updated_at on every UPDATE" behavior.
--
-- Report identifiers (`report_key`) are stable internal keys ("sales_ledger",
-- "monthly_sold_products"), never a route path or Vietnamese display label —
-- so renaming a page's URL/title later never orphans a saved preference.
--
-- `visible_columns` stores the user's raw saved choice as a jsonb array of
-- column keys, independent per (staff_id, report_key) — Sales Ledger and
-- Monthly Sold Products each have their own, entirely separate column
-- schemas (lib/salesLedger/salesLedgerColumns.ts,
-- lib/monthlySoldProducts/monthlySoldProductsColumns.ts), never merged.
-- Column ORDER is never persisted here (Product Owner instruction) — order
-- stays controlled entirely by each report's own column definition array;
-- this table stores visibility only.

BEGIN;

CREATE TABLE IF NOT EXISTS report_column_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  visible_columns jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (staff_id, report_key)
);

CREATE INDEX IF NOT EXISTS idx_report_column_preferences_staff_report
  ON report_column_preferences(staff_id, report_key);

DROP TRIGGER IF EXISTS report_column_preferences_set_updated_at ON report_column_preferences;
CREATE TRIGGER report_column_preferences_set_updated_at
BEFORE UPDATE ON report_column_preferences
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- Same unrestricted "Allow full access" RLS shape already used by every
-- other table in this project (compensations, settlements, ...) — every
-- actual access-scoping in this codebase happens at the application layer
-- (getCurrentStaffFromRequest resolving "who is calling," never trusting a
-- client-supplied staff_id), not via RLS policy. The application layer
-- (app/api/report-preferences/route.ts) is the sole enforcement point that
-- a staff member can only ever read/write their OWN row — this policy does
-- not by itself restrict staff_id to "self," matching how every other
-- per-staff-scoped table in this schema (e.g. compensations.confirmed_by)
-- already relies on the API layer, not RLS, for that.
ALTER TABLE report_column_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON report_column_preferences;
CREATE POLICY "Allow full access to anon" ON report_column_preferences FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON report_column_preferences;
CREATE POLICY "Allow full access to authenticated" ON report_column_preferences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'report_column_preferences';
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'report_column_preferences' ORDER BY ordinal_position;
-- SELECT conname, contype FROM pg_constraint WHERE conrelid = 'report_column_preferences'::regclass;
-- SELECT tablename, policyname, roles FROM pg_policies WHERE tablename = 'report_column_preferences';
