-- Consignment (CRM Customer Consignment specification — Business Model
-- LOCKED, Design Specification RESOLVED, Implementation AUTHORIZED).
--
-- DRAFT ONLY. Per this project's standing database rule (reinforced on
-- every prior schema change across every module built so far, restated
-- explicitly in docs/P7_AUDIT_LOGGING.md §4): draft the migration, do NOT
-- apply it, wait for explicit, separate Product Owner approval to apply,
-- then apply, then implement against it. This migration has NOT been run
-- against any database (Dev or Production).
--
-- Scope: ONE new table (`consignments`) only — Increment 1 of the staged
-- Implementation Plan (Phase 14, Step 1). No column is added to `products`,
-- `orders`, `customers`, or any other existing table. No Consignment
-- Financial Record, no Settlement-pattern extension, and no permission key
-- is created by this migration (D12, LOCKED — reuse existing permissions
-- only; no `consignment.*` keys).
--
-- Consignor model (D9, LOCKED): `customer_id` references the existing
-- `customers` table directly — no new identity entity.
--
-- Product Status non-interference (D7/D01, LOCKED): this table introduces
-- no trigger, function, or constraint that reads or writes `products.status`
-- in any way.
--
-- Status model (D02/D01, LOCKED): exactly RECEIVED / AVAILABLE_FOR_SALE /
-- SOLD / RETURNED, enforced by a CHECK constraint, matching the existing
-- fixed-vocabulary pattern already used for `orders.order_status` and
-- `orders.payment_status` (not a `master_data` category, since this
-- vocabulary is a locked business rule, not business-configurable data).
--
-- Known, explicitly-flagged gap (Implementation Plan Phase 15 Risk Audit,
-- not resolved by this migration): whether a Product may have more than
-- one Consignment over its lifetime (e.g., re-consigned after a prior
-- Return) is undecided. `product_id` therefore carries no UNIQUE
-- constraint here — this is a deliberate omission, not an oversight,
-- pending a future, narrow Product Owner clarification if it becomes
-- practically relevant.

BEGIN;

CREATE TABLE IF NOT EXISTS consignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  consignment_code text NOT NULL UNIQUE,

  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'AVAILABLE_FOR_SALE', 'SOLD', 'RETURNED')),
  returned_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignments_consignment_code ON consignments(consignment_code);
CREATE INDEX IF NOT EXISTS idx_consignments_customer_id ON consignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_consignments_product_id ON consignments(product_id);
CREATE INDEX IF NOT EXISTS idx_consignments_status ON consignments(status);

-- Reuses the shared trigger function already used by customers/products/
-- product_batches/compensations/compensation_policies — no new function.
DROP TRIGGER IF EXISTS consignments_set_updated_at ON consignments;
CREATE TRIGGER consignments_set_updated_at
BEFORE UPDATE ON consignments
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE consignments ENABLE ROW LEVEL SECURITY;

-- Consignment is an ordinary, updatable business entity (like compensations,
-- settlements, partners) — not an append-only ledger — so the standard
-- full-access RLS pattern already used for those tables is the correct
-- analog here, not the SELECT-only/immutability-guard pattern reserved for
-- Compensation Ledger / Money & Debt Ledger.
DROP POLICY IF EXISTS "Allow full access to anon" ON consignments;
CREATE POLICY "Allow full access to anon" ON consignments FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON consignments;
CREATE POLICY "Allow full access to authenticated" ON consignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after this migration is applied
-- (once separately authorized).
-- ============================================================

-- 1. Table exists with the expected shape.
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'consignments' ORDER BY ordinal_position;

-- 2. Status CHECK constraint enforces exactly the four LOCKED values.
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'consignments'::regclass AND contype = 'c';

-- 3. No existing table was altered by this migration.
-- (No ALTER TABLE statement appears above — inspection only.)
