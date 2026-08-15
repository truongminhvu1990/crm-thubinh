-- Compensation (docs/13_COMPENSATION_SPEC.md, LOCKED Rev 3) — Product Owner
-- Implementation Task 2026-07-31.
--
-- Scope: TWO new tables (`compensations`, `compensation_policies`) plus 2
-- new permission rows. No column added to `orders`, `partners`,
-- `sales_commissions`, or any other existing table. Settlement and
-- Compensation Ledger are explicitly NOT touched (both remain zero-code,
-- per direct instruction).
--
-- Recipient model (Product Owner decision, 2026-07-31, resolving a real
-- conflict between the task and docs/13_COMPENSATION_SPEC.md §1/§11 —
-- LOCKED as "generic, not Partner-specific"): `recipient_type` is kept as
-- its own column (default 'Partner') so the schema doesn't hardcode Partner
-- as the only possible Recipient, but `partner_id` is the only recipient
-- reference actually populated this increment — Order is the only place a
-- Recipient can currently be attributed from (`orders.partner_id`), and
-- Commission (Staff-earned) stays entirely on its own separate
-- `sales_commissions` table/pipeline, untouched.
--
-- Status model (Revision 2, Product Owner Revision 2026-07-31, Decision 3
-- — "Support all LOCKED statuses... Do not reduce the status model"):
-- Draft -> Pending -> Confirmed -> Handed Off, with Cancelled reachable
-- from Draft/Pending only. Resolves docs/13_COMPENSATION_SPEC.md §16 Q1.
-- Full lifecycle documented in lib/compensation/compensation.service.ts.
-- A record is created as Draft (at OrderConfirmed, Decision 1 — the
-- creation trigger never moves to OrderCompleted), becomes Pending once
-- Eligibility is evaluated at OrderCompleted (Decision 2 — Eligibility may
-- delay confirmation but never changes the creation trigger), and is
-- Cancelled automatically if the Order is later marked Lost while still
-- Draft/Pending.
--
-- One row per Order Item (mirrors sales_commissions' own granularity,
-- CommissionSnapshotInput) — matches the List/Detail's own "Product" column
-- being singular, not a multi-product order-level rollup.
--
-- No compensation.delete permission — a Confirmed/Handed Off record is
-- never deleted (Traceability principle, §3).

BEGIN;

-- ============================================================
-- 1. compensation_policies — read-only reference data this increment (no
--    create/edit UI; docs/13_COMPENSATION_SPEC.md §7 explicitly describes
--    "no workflow or implementation" for Policy, so none is invented here).
-- ============================================================

CREATE TABLE IF NOT EXISTS compensation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  policy_name text NOT NULL,
  compensation_type text NOT NULL,
  basis text NOT NULL,
  method text NOT NULL,
  value numeric NOT NULL,
  status text NOT NULL DEFAULT 'Active',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS compensation_policies_set_updated_at ON compensation_policies;
CREATE TRIGGER compensation_policies_set_updated_at
BEFORE UPDATE ON compensation_policies
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE compensation_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON compensation_policies;
CREATE POLICY "Allow full access to anon" ON compensation_policies FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON compensation_policies;
CREATE POLICY "Allow full access to authenticated" ON compensation_policies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Exactly one seeded Policy — an explicit placeholder, not a business
-- decision: Referral Fee / Sale Price / Percentage / 5%. Flagged in the
-- delivery report as needing Product Owner confirmation; every Compensation
-- record created this increment resolves against this one row, since no
-- Policy-resolution rule (which Policy applies to which Partner Type/order)
-- is designed anywhere.
INSERT INTO compensation_policies (policy_name, compensation_type, basis, method, value, status)
VALUES ('Đối tác giới thiệu — mặc định', 'Referral Fee', 'Sale Price', 'Percentage', 5, 'Active');

-- ============================================================
-- 2. compensations
-- ============================================================

CREATE TABLE IF NOT EXISTS compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  compensation_code text NOT NULL UNIQUE,

  recipient_type text NOT NULL DEFAULT 'Partner',
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,

  compensation_type text NOT NULL,
  policy_id uuid REFERENCES compensation_policies(id) ON DELETE SET NULL,

  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,

  basis text NOT NULL,
  method text NOT NULL,
  value numeric NOT NULL,
  calculated_amount numeric NOT NULL,

  status text NOT NULL DEFAULT 'Draft',
  confirmed_at timestamptz,
  confirmed_by text,
  cancelled_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compensations_compensation_code ON compensations(compensation_code);
CREATE INDEX IF NOT EXISTS idx_compensations_partner_id ON compensations(partner_id);
CREATE INDEX IF NOT EXISTS idx_compensations_order_id ON compensations(order_id);
CREATE INDEX IF NOT EXISTS idx_compensations_status ON compensations(status);

DROP TRIGGER IF EXISTS compensations_set_updated_at ON compensations;
CREATE TRIGGER compensations_set_updated_at
BEFORE UPDATE ON compensations
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE compensations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON compensations;
CREATE POLICY "Allow full access to anon" ON compensations FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON compensations;
CREATE POLICY "Allow full access to authenticated" ON compensations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Permissions (docs/13_COMPENSATION_SPEC.md §13, LOCKED). Seeded
--    UNGRANTED — no hardcoded role mapping, per the precedent set by
--    Partner Center's own Product Owner Revision 2026-07-31, Decision 5.
--    An Owner/Admin assigns these via the Permission Matrix UI.
-- ============================================================

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('compensation.view', 'compensation', 'view'),
  ('compensation.manage', 'compensation', 'manage')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('compensations', 'compensation_policies');
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'compensations' ORDER BY ordinal_position;
-- SELECT * FROM compensation_policies;
-- SELECT permission_key FROM permissions WHERE resource = 'compensation' ORDER BY permission_key;
-- Expect zero rows until an Owner/Admin grants them via the Permission Matrix UI:
-- SELECT r.role_key, p.permission_key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE p.resource = 'compensation';
