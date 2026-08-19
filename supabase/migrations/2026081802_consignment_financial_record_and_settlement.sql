-- Consignment Financial Record + Consignment Settlement (Increment 2).
-- DRAFT ONLY until applied — same standing rule as 2026081801
-- (docs/P7_AUDIT_LOGGING.md §4).
--
-- Consignment Financial Record (D11, LOCKED): independent of Compensation,
-- Compensation Ledger, and Money & Debt Ledger. One Consignment produces
-- at most one Financial Record (D04) — enforced by `consignment_id
-- UNIQUE`. Sale Price/Fee/Customer Payable are write-once (D6) — no
-- UPDATE path exists anywhere in the service layer or this migration.
--
-- Consignment Settlement (D8/D03, LOCKED): a structurally SEPARATE
-- parallel to the existing `settlements`/`settlement_items` — NOT an
-- extension of them. Confirmed necessary by direct code inspection
-- (Implementation Plan Phase 8): lib/settlement/settlement.service.ts
-- hard-codes `recipient_type: 'Partner'`, imports Compensation's own
-- service directly, and `settlement_items.compensation_id` is a NOT NULL
-- UNIQUE FK typed exclusively to `compensations(id)` — none of which can
-- be reused without modifying already-shipped Settlement code, which D03
-- explicitly forbids. This migration creates its own new pair of tables,
-- mirroring the existing Settlement/Settlement Item shape (same 5-value
-- status model, same lifecycle timestamps) with `customer_id` in place of
-- `partner_id` and `consignment_financial_record_id` in place of
-- `compensation_id`.
--
-- No permission key is created by this migration (D12, LOCKED — reuse
-- existing permissions only).

BEGIN;

-- ============================================================
-- 1. consignment_financial_records
-- ============================================================

CREATE TABLE IF NOT EXISTS consignment_financial_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  consignment_id uuid NOT NULL UNIQUE REFERENCES consignments(id) ON DELETE RESTRICT,

  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,

  sale_price numeric NOT NULL CHECK (sale_price >= 0),
  fee numeric NOT NULL CHECK (fee >= 0),
  customer_payable numeric NOT NULL CHECK (customer_payable >= 0),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignment_financial_records_consignment_id ON consignment_financial_records(consignment_id);
CREATE INDEX IF NOT EXISTS idx_consignment_financial_records_order_id ON consignment_financial_records(order_id);

ALTER TABLE consignment_financial_records ENABLE ROW LEVEL SECURITY;

-- Write-once by application convention (D6) — no application UPDATE path
-- is provided by the service layer. Not enforced at the DB level as
-- SELECT-only, unlike Compensation Ledger/Money & Debt Ledger's own
-- immutability guard, since no Product Owner instruction locked that
-- stronger enforcement here — flagged, not silently upgraded to match a
-- different module's precedent it was never asked to follow.
DROP POLICY IF EXISTS "Allow full access to anon" ON consignment_financial_records;
CREATE POLICY "Allow full access to anon" ON consignment_financial_records FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON consignment_financial_records;
CREATE POLICY "Allow full access to authenticated" ON consignment_financial_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. consignment_settlements
-- ============================================================

CREATE TABLE IF NOT EXISTS consignment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  settlement_code text NOT NULL UNIQUE,

  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,

  settlement_method text NOT NULL,

  status text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Pending', 'Approved', 'Completed', 'Cancelled')),
  requested_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  completed_at timestamptz,
  completed_by text,
  cancelled_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignment_settlements_customer_id ON consignment_settlements(customer_id);
CREATE INDEX IF NOT EXISTS idx_consignment_settlements_status ON consignment_settlements(status);

DROP TRIGGER IF EXISTS consignment_settlements_set_updated_at ON consignment_settlements;
CREATE TRIGGER consignment_settlements_set_updated_at
BEFORE UPDATE ON consignment_settlements
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE consignment_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON consignment_settlements;
CREATE POLICY "Allow full access to anon" ON consignment_settlements FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON consignment_settlements;
CREATE POLICY "Allow full access to authenticated" ON consignment_settlements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. consignment_settlement_items
-- ============================================================

CREATE TABLE IF NOT EXISTS consignment_settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  consignment_settlement_id uuid NOT NULL REFERENCES consignment_settlements(id) ON DELETE CASCADE,
  -- UNIQUE mirrors settlement_items.compensation_id exactly: a Consignment
  -- Financial Record belongs to at most one Consignment Settlement Item,
  -- system-wide.
  consignment_financial_record_id uuid NOT NULL UNIQUE REFERENCES consignment_financial_records(id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignment_settlement_items_settlement_id ON consignment_settlement_items(consignment_settlement_id);

ALTER TABLE consignment_settlement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON consignment_settlement_items;
CREATE POLICY "Allow full access to anon" ON consignment_settlement_items FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON consignment_settlement_items;
CREATE POLICY "Allow full access to authenticated" ON consignment_settlement_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after this migration is applied.
-- ============================================================

-- 1. All three tables exist with the expected shape.
-- SELECT table_name, column_name, data_type FROM information_schema.columns
--   WHERE table_name IN ('consignment_financial_records', 'consignment_settlements', 'consignment_settlement_items')
--   ORDER BY table_name, ordinal_position;

-- 2. consignment_id and consignment_financial_record_id are both UNIQUE
--    (enforces D04's "at most one" cardinality at each level).
-- SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid IN ('consignment_financial_records'::regclass, 'consignment_settlement_items'::regclass)
--   AND contype = 'u';
