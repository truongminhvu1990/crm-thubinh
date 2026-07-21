-- Sales Commission module (Sprint v1.2.0).
--
-- Two new, independent tables. `sales_commissions` is a deliberate
-- immutable snapshot (Business Rule 1/5 of the spec: commission is
-- calculated ONCE when a sale completes and must never be recalculated,
-- overwritten, or synced from customer_purchases again) - so, unlike every
-- other table in this schema, `purchase_id`/`customer_id` here are plain
-- uuid columns with NO foreign key back to customer_purchases/customers.
-- A real FK would make this table dependent on the live state of rows it
-- is explicitly required to stay decoupled from (e.g. deleting a purchase
-- must never be blocked or cascaded by a commission that already exists
-- for it - the spec never says otherwise, and Customers/Orders delete
-- flows are explicitly out of scope to touch). Application code (see
-- lib/commission/) resolves the human-readable customer name separately,
-- at read time, for display only - never for recalculation.
--
-- Spec's field list for both tables is treated as exhaustive per its own
-- "Do not infer new business rules" instruction - no extra columns beyond
-- what's named (e.g. no separate `approved_at`; the workflow only defines
-- created_at/paid_at as timestamps).

BEGIN;

-- ============================================================
-- 1. commission_rules
-- ============================================================

CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minimum_amount numeric NOT NULL,
  maximum_amount numeric,
  commission_percent numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO commission_rules (minimum_amount, maximum_amount, commission_percent)
VALUES
  (0, 9999999, 5),
  (10000000, NULL, 3);

-- ============================================================
-- 2. sales_commissions - the immutable snapshot
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deliberately no FK - see file header.
  purchase_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  salesperson text,
  salesperson_id uuid,
  sale_amount numeric NOT NULL,
  commission_percent numeric NOT NULL,
  commission_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Paid')),
  paid_at timestamptz,
  paid_by text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Business Rule 4: "Insert ONE snapshot record" per completed sale.
  -- Enforced here, not just by convention in application code.
  UNIQUE (purchase_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_commissions_customer_id ON sales_commissions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_status ON sales_commissions(status);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_created_at ON sales_commissions(created_at);

-- ============================================================
-- 3. RLS - same "Allow full access" shape (anon + authenticated) already
--    locked for every other table in this schema.
-- ============================================================

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access" ON commission_rules;
CREATE POLICY "Allow full access" ON commission_rules FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON commission_rules;
CREATE POLICY "Allow full access to authenticated" ON commission_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access" ON sales_commissions;
CREATE POLICY "Allow full access" ON sales_commissions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON sales_commissions;
CREATE POLICY "Allow full access to authenticated" ON sales_commissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name IN ('commission_rules','sales_commissions') ORDER BY table_name, ordinal_position;
-- SELECT * FROM commission_rules ORDER BY minimum_amount;
-- SELECT tablename, policyname, roles FROM pg_policies
--   WHERE tablename IN ('commission_rules','sales_commissions');
