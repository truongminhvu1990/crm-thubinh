-- Operating Expenses module (Monthly Sold Products Report - Expense
-- Management, Product Owner Decision, 2026-07-28, "Expense Schema APPROVED").
--
-- Single new table. Fixed category list per approval ("Do NOT create a
-- lookup table. Use a fixed category list.") enforced as a CHECK constraint,
-- same convention as sales_commissions.status
-- (20260721_sales_commission_module.sql). A single `expense_date` (not a
-- period) per approval - the report filters expenses into a date range by
-- comparing this one column, same [start, end) shape as every other
-- date-ranged query in this codebase. Edit/Delete are both permitted (no
-- append-only requirement per approval), so `updated_at` is a real,
-- application-maintained column, not decorative.
--
-- RLS follows this schema's established shape (20260718_rls_authenticated_role.sql):
-- open policies at the Postgres/RLS layer, with the actual Owner/Full Access
-- - Manager/Create-Edit-Delete - Staff/View-only role split enforced at the
-- application layer (app/api/reports/operating-expenses/_authorization.ts),
-- the same "hardcoded role-key mapping enforced server-side, not via RLS or
-- role_data_scopes" pattern already used for Orders writes
-- (app/api/orders/_authorization.ts) and Gross Profit visibility on this
-- exact report (lib/monthlySoldProducts/monthlySoldProducts.service.ts).

BEGIN;

CREATE TABLE IF NOT EXISTS operating_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('Advertising', 'Shipping', 'Packaging', 'Gifts', 'Other Expenses')),
  description text,
  amount numeric NOT NULL CHECK (amount >= 0),
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_expense_date ON operating_expenses(expense_date);

ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access" ON operating_expenses;
CREATE POLICY "Allow full access" ON operating_expenses FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON operating_expenses;
CREATE POLICY "Allow full access to authenticated" ON operating_expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'operating_expenses' ORDER BY ordinal_position;
-- SELECT tablename, policyname, roles FROM pg_policies WHERE tablename = 'operating_expenses';
