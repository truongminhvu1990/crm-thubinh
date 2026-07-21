-- Enterprise Permission Center (Sprint v4.0.0).
--
-- Implements docs/PERMISSION_DATABASE.md, Revision 2 (LOCKED) exactly.
-- Five new tables (roles, permissions, role_permissions, role_data_scopes,
-- permission_sensitive_fields) plus two new nullable columns on the
-- existing `staff` table (team_id, role_id). Nothing else is altered -
-- `staff.role`'s CHECK constraint and every other existing table/column is
-- untouched (Decision 10).
--
-- role_key uses the exact `staff.role` casing ("Owner", "Manager", ...)
-- rather than a lowercase slug, so the legacy-fallback equality match in
-- the Permission Resolution Model (DB §10 step 2) works without a
-- normalization step - the DB doc's "e.g. owner, manager" was illustrative,
-- not a locked literal.
--
-- permission_sensitive_fields is seeded empty (DB §19 step 7) - which
-- permission unlocks which sensitive field is Development-phase content no
-- Decision has specified, and no consuming module reads this table yet
-- (Decision 1: retrofitting Field Visibility into Product/Reports/Commission
-- is out of scope for v4.0.0).

BEGIN;

-- ============================================================
-- 1. roles
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. permissions
-- ============================================================

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);

-- ============================================================
-- 3. role_permissions
-- ============================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- ============================================================
-- 4. role_data_scopes
-- ============================================================

CREATE TABLE IF NOT EXISTS role_data_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('own', 'team', 'all')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, resource)
);

CREATE INDEX IF NOT EXISTS idx_role_data_scopes_role_id ON role_data_scopes(role_id);

-- ============================================================
-- 5. permission_sensitive_fields
-- ============================================================

CREATE TABLE IF NOT EXISTS permission_sensitive_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
  field_key text NOT NULL CHECK (field_key IN ('cost_price', 'profit', 'commission', 'company_revenue', 'internal_notes')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permission_key, field_key)
);

CREATE INDEX IF NOT EXISTS idx_permission_sensitive_fields_permission_key ON permission_sensitive_fields(permission_key);

-- ============================================================
-- 6. staff - two new nullable columns (Decision 9, Decision 10)
-- ============================================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS team_id text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_team_id ON staff(team_id);
CREATE INDEX IF NOT EXISTS idx_staff_role_id ON staff(role_id);

-- ============================================================
-- 7. RLS - same "Allow full access" shape (anon + authenticated) already
--    locked for every other table in this schema (DB §18).
-- ============================================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON roles;
CREATE POLICY "Allow full access to anon" ON roles FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON roles;
CREATE POLICY "Allow full access to authenticated" ON roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON permissions;
CREATE POLICY "Allow full access to anon" ON permissions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON permissions;
CREATE POLICY "Allow full access to authenticated" ON permissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON role_permissions;
CREATE POLICY "Allow full access to anon" ON role_permissions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON role_permissions;
CREATE POLICY "Allow full access to authenticated" ON role_permissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE role_data_scopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON role_data_scopes;
CREATE POLICY "Allow full access to anon" ON role_data_scopes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON role_data_scopes;
CREATE POLICY "Allow full access to authenticated" ON role_data_scopes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE permission_sensitive_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON permission_sensitive_fields;
CREATE POLICY "Allow full access to anon" ON permission_sensitive_fields FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON permission_sensitive_fields;
CREATE POLICY "Allow full access to authenticated" ON permission_sensitive_fields
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 8. Seed data (DB §19) - replays today's hardcoded ROLE_PERMISSIONS map
--    exactly, so cutover changes zero observable behavior (DB §20).
-- ============================================================

INSERT INTO roles (role_key, name, description) VALUES
  ('Owner', 'Chủ sở hữu', 'Toàn quyền trên hệ thống'),
  ('Manager', 'Quản lý', 'Quản lý vận hành, không có quyền cài đặt hệ thống'),
  ('Sales', 'Kinh doanh', 'Nhân viên kinh doanh'),
  ('Marketing', 'Marketing', 'Nhân viên marketing'),
  ('Viewer', 'Người xem', 'Chỉ xem, không chỉnh sửa')
ON CONFLICT (role_key) DO NOTHING;

-- 1:1 rename of today's types/permission.ts literals to Decision 3's dot
-- standard - no re-scoping, no split into finer actions (DB §19 step 4).
INSERT INTO permissions (permission_key, resource, action) VALUES
  ('staff.view', 'staff', 'view'),
  ('staff.manage', 'staff', 'manage'),
  ('customers.manage', 'customers', 'manage'),
  ('commission.approve', 'commission', 'approve'),
  ('settings.manage', 'settings', 'manage'),
  ('marketing.manage', 'marketing', 'manage'),
  ('marketing.automation.manage', 'marketing.automation', 'manage'),
  ('marketing.broadcast.manage', 'marketing.broadcast', 'manage'),
  ('marketing.loyalty.manage', 'marketing.loyalty', 'manage'),
  ('marketing.voucher.manage', 'marketing.voucher', 'manage')
ON CONFLICT (permission_key) DO NOTHING;

-- Replays ROLE_PERMISSIONS from lib/permission.ts exactly.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE
  (r.role_key = 'Owner' AND p.permission_key IN ('staff.view', 'staff.manage', 'customers.manage', 'commission.approve', 'settings.manage', 'marketing.manage'))
  OR (r.role_key = 'Manager' AND p.permission_key IN ('staff.view', 'customers.manage', 'commission.approve', 'marketing.manage'))
  OR (r.role_key = 'Sales' AND p.permission_key IN ('customers.manage'))
  OR (r.role_key = 'Marketing' AND p.permission_key IN ('customers.manage', 'marketing.manage'))
  OR (r.role_key = 'Viewer' AND p.permission_key IN ('staff.view'))
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Every role gets 'all' for every named resource (Spec §4) - matches
-- today's fully-open behavior exactly (DB §19 step 6); no narrower default
-- is authorized by Decision 1.
INSERT INTO role_data_scopes (role_id, resource, scope)
SELECT r.id, res.resource, 'all'
FROM roles r
CROSS JOIN (VALUES
  ('customers'), ('orders'), ('revenue'), ('sales_ledger'),
  ('dashboard'), ('reports'), ('marketing'), ('commissions')
) AS res(resource)
ON CONFLICT (role_id, resource) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('roles','permissions','role_permissions','role_data_scopes','permission_sensitive_fields');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'staff' AND column_name IN ('team_id','role_id');
-- SELECT role_key, name FROM roles ORDER BY role_key;
-- SELECT permission_key FROM permissions ORDER BY permission_key;
-- SELECT r.role_key, p.permission_key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id ORDER BY r.role_key, p.permission_key;
-- SELECT r.role_key, COUNT(*) FROM role_data_scopes rds JOIN roles r ON r.id = rds.role_id GROUP BY r.role_key;
-- SELECT tablename, policyname, roles FROM pg_policies WHERE tablename IN ('roles','permissions','role_permissions','role_data_scopes','permission_sensitive_fields');
