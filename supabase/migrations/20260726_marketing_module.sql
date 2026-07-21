-- Marketing CRM Foundation (Sprint v3.0.0), Package 1 - Database Migration.
--
-- Per docs/MARKETING_SPEC.md + docs/MARKETING_DATABASE.md (both Revision 2,
-- LOCKED): four new tables only - marketing_segments,
-- marketing_segment_conditions, marketing_segment_members,
-- marketing_campaigns. No existing table is altered except three new,
-- purely-additive indexes on `customers` (birthday/province/district) and
-- reconciling three indexes already drafted-but-unapplied in
-- 20260718_performance_indexes.sql (customer_purchases.sale_date/product_id,
-- customers.vip_level) rather than redrafting them a second time, per
-- MARKETING_DATABASE.md §4's explicit instruction. No column is added,
-- removed, or renamed on any existing table.
--
-- Segment status (Active/Inactive/Archived) is a Revision 2 Product Owner
-- Decision: segments referenced by any campaign can never be hard-deleted
-- (enforced by target_segment_id's ON DELETE RESTRICT below) - status is
-- the only "remove from active use" mechanism. There is no DELETE
-- capability on marketing_segments in this sprint.
--
-- FK choices follow this schema's existing precedents: staff-reference
-- columns use ON DELETE SET NULL (same as activity_logs.staff_id,
-- customers.assigned_staff_id - a staff departure doesn't destroy history);
-- segment_id/customer_id on the two child tables use ON DELETE CASCADE
-- (a condition/membership row has no meaning without its parent); campaign
-- target_segment_id uses ON DELETE RESTRICT (a campaign's target is
-- required, so deleting a still-targeted segment must be blocked - Owner
-- must reassign/cancel first, and per the decision above, hard delete of a
-- targeted segment was never going to be offered anyway).

BEGIN;

-- ============================================================
-- 1. marketing_segments
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  segment_type text NOT NULL CHECK (segment_type IN ('Dynamic', 'Manual')),
  condition_logic text CHECK (condition_logic IN ('AND', 'OR')),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Archived')),
  created_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_segments_type ON marketing_segments(segment_type);
CREATE INDEX IF NOT EXISTS idx_marketing_segments_status ON marketing_segments(status);

CREATE TRIGGER marketing_segments_set_updated_at
  BEFORE UPDATE ON marketing_segments
  FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- ============================================================
-- 2. marketing_segment_conditions (Dynamic segments only)
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_segment_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES marketing_segments(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN (
    'purchase_count', 'lifetime_revenue', 'last_purchase', 'first_purchase',
    'birthday', 'province', 'district', 'assigned_staff',
    'favorite_category', 'favorite_product', 'favorite_color', 'budget', 'vip_level'
  )),
  operator text NOT NULL CHECK (operator IN (
    'equals', 'not_equals', 'contains',
    'greater_than', 'less_than', 'between',
    'before', 'after', 'within_last_days'
  )),
  value jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_segment_conditions_segment_id ON marketing_segment_conditions(segment_id);

-- ============================================================
-- 3. marketing_segment_members (Manual segments only)
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_segment_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES marketing_segments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  added_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (segment_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_members_segment_id ON marketing_segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_members_customer_id ON marketing_segment_members(customer_id);

-- ============================================================
-- 4. marketing_campaigns
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  target_segment_id uuid NOT NULL REFERENCES marketing_segments(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date,
  owner_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Paused', 'Completed', 'Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_target_segment_id ON marketing_campaigns(target_segment_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner_staff_id ON marketing_campaigns(owner_staff_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_start_date ON marketing_campaigns(start_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_end_date ON marketing_campaigns(end_date);

CREATE TRIGGER marketing_campaigns_set_updated_at
  BEFORE UPDATE ON marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- ============================================================
-- 5. Supporting indexes on existing tables (index-only, no column/data
--    change - customers.birthday/province/district are new per this
--    document; the other three reconcile 20260718_performance_indexes.sql,
--    which is drafted but not applied, per MARKETING_DATABASE.md §4/§9).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_birthday ON customers(birthday);
CREATE INDEX IF NOT EXISTS idx_customers_province ON customers(province);
CREATE INDEX IF NOT EXISTS idx_customers_district ON customers(district);

CREATE INDEX IF NOT EXISTS idx_customer_purchases_sale_date ON customer_purchases(sale_date);
CREATE INDEX IF NOT EXISTS idx_customer_purchases_product_id ON customer_purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_vip_level ON customers(vip_level);

-- ============================================================
-- 6. RLS - same "Allow full access" shape (anon + authenticated) already
--    locked for every other operational table in this schema.
-- ============================================================

ALTER TABLE marketing_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_segments;
CREATE POLICY "Allow full access to anon" ON marketing_segments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_segments;
CREATE POLICY "Allow full access to authenticated" ON marketing_segments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_segment_conditions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_segment_conditions;
CREATE POLICY "Allow full access to anon" ON marketing_segment_conditions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_segment_conditions;
CREATE POLICY "Allow full access to authenticated" ON marketing_segment_conditions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_segment_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_segment_members;
CREATE POLICY "Allow full access to anon" ON marketing_segment_members FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_segment_members;
CREATE POLICY "Allow full access to authenticated" ON marketing_segment_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON marketing_campaigns;
CREATE POLICY "Allow full access to anon" ON marketing_campaigns FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON marketing_campaigns;
CREATE POLICY "Allow full access to authenticated" ON marketing_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('marketing_segments','marketing_segment_conditions','marketing_segment_members','marketing_campaigns');
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--   WHERE table_name IN ('marketing_segments','marketing_segment_conditions','marketing_segment_members','marketing_campaigns')
--   ORDER BY table_name, ordinal_position;
-- SELECT tablename, indexname FROM pg_indexes
--   WHERE tablename IN ('marketing_segments','marketing_segment_conditions','marketing_segment_members','marketing_campaigns','customers','customer_purchases')
--   AND indexname LIKE 'idx_%' ORDER BY tablename, indexname;
-- SELECT tablename, policyname, roles FROM pg_policies
--   WHERE tablename IN ('marketing_segments','marketing_segment_conditions','marketing_segment_members','marketing_campaigns');
