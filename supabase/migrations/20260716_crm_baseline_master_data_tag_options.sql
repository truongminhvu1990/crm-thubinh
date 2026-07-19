-- CRM Baseline V1
-- Package 2
-- Tables: master_data, tag_options
--
-- Development confirmed empty of these two tables. Both are standalone
-- lookup tables with no foreign key to `customers`/`products` (Package 1)
-- or to each other, so this file has no dependency on Package 1 having
-- executed yet — it only needs to run after Package 1 in the overall
-- Sprint 0 sequence because the task defines that order, not because the
-- DDL below references anything Package 1 creates.
--
-- Both tables already have creating migrations in this repo
-- (20260709_master_data.sql, 20260710_tag_options.sql), but each was
-- followed by later ALTER-only corrections to `master_data`'s category
-- CHECK constraint (20260713_product_settings_v1_1.sql,
-- 20260715_customer_market.sql, 20260715_master_data_country_category_fix.sql)
-- and one to `tag_options`'s (20260713_product_settings_v1_1.sql, which
-- added `product_jade_grade`). Same consolidation approach as Package 1:
-- this file authors both tables directly in their final, already-approved
-- shape — the category lists below follow the approved CRM Database
-- Specification and the Product Owner approved migration history, not
-- invented — rather than requiring those 4 legacy files to be replayed
-- on top of a bare original CREATE TABLE.
--
-- Out of scope, deliberately: `customer_purchases` (Package 3),
-- `product_batches`/`product_images` (Package 4), all 4 Orders tables,
-- Inventory, Reports. No seed data (per task instruction) — both tables
-- start empty; master_data's original seed rows and tag_options' "created
-- inline as users type" behavior are an application-layer/data concern,
-- not part of this schema migration.
--
-- Per task instruction: migration file only, not executed by this task.

BEGIN;

-- ============================================================
-- 1. CREATE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS master_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Final approved 7-category list, per the approved CRM Database
  -- Specification and the Product Owner approved migration history.
  category text NOT NULL CHECK (category IN (
    'salesperson', 'product_source', 'customer_stage',
    'product_category', 'product_color', 'market', 'country'
  )),
  -- `value` doubles as the stored identifier and the display text - no
  -- separate label column.
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, value)
);

CREATE TABLE IF NOT EXISTS tag_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Final approved 4-category list, per the approved CRM Database
  -- Specification and the Product Owner approved migration history.
  category text NOT NULL CHECK (category IN (
    'favorite_color', 'jade_type', 'purchase_purpose', 'product_jade_grade'
  )),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, value)
);

-- ============================================================
-- 2. INDEXES
--
-- Both tables are only ever queried filtered by `category` (see
-- lib/masterData.service.ts getMasterDataItems/getMasterDataOptions,
-- lib/tagOptions.service.ts getTagOptions - always `.eq("category", ...)`,
-- optionally joined with `.eq("value", ...)` for the duplicate check in
-- addMasterDataItem/createTagOption). The UNIQUE(category, value)
-- constraint on each table already creates a composite btree index with
-- `category` as its leading column, which serves that access pattern
-- directly - no separate index needed, matching the original migrations
-- (neither ever added one beyond the UNIQUE constraint).
-- ============================================================

-- ============================================================
-- 3. ROW LEVEL SECURITY + POLICIES
--
-- Same unrestricted "Allow full access to anon" pattern as every other
-- table in this project (see Package 1 self review) - guards against the
-- RLS-enabled-with-no-policy lockout that has already hit this project
-- twice.
-- ============================================================

ALTER TABLE master_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON master_data;
CREATE POLICY "Allow full access to anon" ON master_data
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

ALTER TABLE tag_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON tag_options;
CREATE POLICY "Allow full access to anon" ON tag_options
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after the transaction above has
-- been executed and approved. Not part of the transaction itself.
-- ============================================================

-- 1. Verify both tables exist (expect exactly 2 rows).
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('master_data', 'tag_options')
ORDER BY table_name;

-- 2. Verify columns (expect: master_data = 6 rows, tag_options = 4 rows).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('master_data', 'tag_options')
ORDER BY table_name, ordinal_position;

-- 3. Verify primary keys (expect one PRIMARY KEY row per table, on `id`).
SELECT tc.table_name, kcu.column_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('master_data', 'tag_options')
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name;

-- 4. Verify the category CHECK constraints (expect one CHECK row per
--    table whose check_clause lists the approved categories).
SELECT tc.table_name, tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('master_data', 'tag_options')
  AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name;

-- 5. Verify the UNIQUE(category, value) constraint on both tables.
SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('master_data', 'tag_options')
  AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, kcu.ordinal_position;

-- 6. Verify indexes (expect each table's primary key index plus the
--    UNIQUE(category, value) index - no other indexes are created here).
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('master_data', 'tag_options')
ORDER BY tablename, indexname;

-- 7a. Verify RLS is enabled (expect rls_enabled = true for both rows).
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('master_data', 'tag_options')
ORDER BY relname;

-- 7b. Verify the "Allow full access to anon" policy exists on both tables
--     (expect exactly 2 rows, cmd = 'ALL', roles = {anon}).
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('master_data', 'tag_options')
ORDER BY tablename;

-- 8. Confirm no seed rows exist (expect 0 for both).
SELECT
  (SELECT count(*) FROM master_data) AS master_data_rows,
  (SELECT count(*) FROM tag_options) AS tag_options_rows;
