-- UX Enhancement Package
-- Part 2/3: Payment Method dropdown + Shared Master Data module.
--
-- Additive-only, backward compatible:
--   - master_data.category CHECK constraint is widened with 5 new
--     categories (payment_method, customer_source, shipping_provider,
--     bank, follow_up_status). The 7 existing approved categories are kept
--     verbatim - nothing is removed. Same idempotent
--     DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pattern already used by
--     20260715_master_data_country_category_fix.sql.
--   - tag_options gets two new columns (is_active, sort_order) so its
--     first admin UI (Settings > Master Data > Tags) can support Disable,
--     matching master_data's existing shape. Both are
--     NOT NULL DEFAULT ..., so every existing row is automatically valid -
--     nothing becomes newly required, no backfill needed.
--
-- Explicitly NOT changed by this migration: `payments.payment_method` and
-- `customers.source` both stay `text`, no CHECK/FK added - existing
-- free-text values (e.g. legacy "ck"/"tm" payment methods) keep working
-- exactly as before; the new dropdowns in the app are UI-only and write
-- the same free-text column.
--
-- No table dropped/renamed, no column removed, no data rewritten.
-- No seed rows inserted here - master-data content is an application/Owner
-- concern, filled in via Settings after this ships (same precedent as
-- 20260716_crm_baseline_master_data_tag_options.sql).
--
-- Per this project's standing process: migration file only, not executed
-- against Development or Production by this task. Requires a separate
-- explicit go-ahead before being run.

BEGIN;

-- ============================================================
-- 1. master_data — widen category CHECK constraint
-- ============================================================

ALTER TABLE master_data DROP CONSTRAINT IF EXISTS master_data_category_check;
ALTER TABLE master_data ADD CONSTRAINT master_data_category_check
  CHECK (category IN (
    'salesperson', 'product_source', 'customer_stage',
    'product_category', 'product_color', 'market', 'country',
    'payment_method', 'customer_source', 'shipping_provider', 'bank', 'follow_up_status'
  ));

-- ============================================================
-- 2. tag_options — add Disable + manual ordering support
-- ============================================================

ALTER TABLE tag_options ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE tag_options ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after the transaction above has
-- been executed and approved. Not part of the transaction itself.
-- ============================================================

-- 1. Verify the widened category CHECK constraint (expect one row listing
--    all 12 categories).
SELECT tc.table_name, tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'master_data'
  AND tc.constraint_type = 'CHECK';

-- 2. Verify tag_options' new columns (expect 2 rows: is_active boolean,
--    sort_order integer, both NOT NULL with a default).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tag_options'
  AND column_name IN ('is_active', 'sort_order')
ORDER BY column_name;

-- 3. Confirm every existing tag_options row got a valid default (expect 0
--    rows - i.e. no row has a NULL in either new column).
SELECT count(*) AS rows_missing_defaults
FROM tag_options
WHERE is_active IS NULL OR sort_order IS NULL;
