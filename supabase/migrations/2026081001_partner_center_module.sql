-- Partner Center (docs/12_PARTNER_CENTER_SPEC.md, LOCKED Rev 3) — Product
-- Owner Implementation Task 2026-07-31.
--
-- Scope: ONE new table (`partners`) plus 4 new permission rows. No column
-- is added to `sales_commissions` or any other existing table here.
--
-- Product Owner Revision (2026-07-31), Decision 4: Order Integration is
-- confirmed NOT blocked — `orders.partner_id` is added in a separate,
-- follow-on migration (20260811_orders_partner_id.sql), since `orders` is
-- owned by Order, not Partner Center, and stays in its own migration file
-- rather than being folded into this one. See
-- docs/PARTNER_CENTER_ORDER_ATTRIBUTION_PROPOSAL.md (now APPROVED/APPLIED)
-- for the decision record.
--
-- partner_type/status are free text, no CHECK constraint — both are named
-- "not assumed final" / business-configurable in the LOCKED spec (§6, §8),
-- so a future value can be added without a migration. Validated at the
-- application layer instead (lib/partner/partner.constants.ts), the same
-- convention already used for products.status and customers.vip_level.
--
-- No partner.delete permission — Partner Center never hard-deletes a
-- Partner (§10); Terminated (status) is the only way a relationship ends.

BEGIN;

-- ============================================================
-- 1. partners
-- ============================================================

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  partner_code text NOT NULL UNIQUE,
  name text NOT NULL,
  partner_type text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'Onboarding',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partners_partner_code ON partners(partner_code);
CREATE INDEX IF NOT EXISTS idx_partners_name ON partners(name);
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);

-- Reuses the generic updated_at trigger function already established for
-- customers/products (20260716_crm_baseline_customers_products.sql) rather
-- than authoring a duplicate.
DROP TRIGGER IF EXISTS partners_set_updated_at ON partners;
CREATE TRIGGER partners_set_updated_at
BEFORE UPDATE ON partners
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- Same "Allow full access" RLS shape as every other table in this schema
-- (anon + authenticated) — real enforcement happens at the application
-- layer via the Permission Center (partner.view/create/update/export),
-- same division of responsibility already used for every other module.
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON partners;
CREATE POLICY "Allow full access to anon" ON partners
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON partners;
CREATE POLICY "Allow full access to authenticated" ON partners
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Permissions (docs/12_PARTNER_CENTER_SPEC.md §10, PROPOSED, confirmed
--    by Product Owner Implementation Task 2026-07-31 — resolves §13 Q2).
--
--    Product Owner Revision (2026-07-31), Decision 5: no hardcoded Role
--    Mapping — permissions are seeded here UNGRANTED. An Owner/Admin
--    assigns them to roles afterward via the Permission Center's own
--    Permission Matrix UI (app/settings/permissions/matrix), which reads
--    the `permissions` table dynamically — these 4 rows appear there
--    automatically once this migration runs, same as every other
--    permission. Revision 1 of this migration seeded a fixed role grant by
--    default; that INSERT INTO role_permissions block is removed entirely
--    per this Decision, not left commented out.
-- ============================================================

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('partner.view', 'partner', 'view'),
  ('partner.create', 'partner', 'create'),
  ('partner.update', 'partner', 'update'),
  ('partner.export', 'partner', 'export')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'partners';
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'partners' ORDER BY ordinal_position;
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'partners';
-- SELECT permission_key FROM permissions WHERE resource = 'partner' ORDER BY permission_key;
-- Expect zero rows in role_permissions for these until an Owner/Admin grants them via the Permission Matrix UI:
-- SELECT r.role_key, p.permission_key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE p.resource = 'partner' ORDER BY r.role_key, p.permission_key;
