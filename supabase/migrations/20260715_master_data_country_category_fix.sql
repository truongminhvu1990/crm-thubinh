-- Master Data — restore `country` to the category CHECK constraint.
--
-- Synchronizes Development with the approved category list
-- (types/masterData.ts MasterDataCategory): salesperson, product_source,
-- customer_stage, product_category, product_color, market, country.
--
-- `country` was added to master_data by 20260711_customer_country.sql, then
-- silently dropped when 20260713_product_settings_v1_1.sql rewrote the whole
-- constraint for an unrelated Product Settings change. 20260715_customer_market.sql
-- later restored `market` but not `country`. This migration only fixes the
-- constraint's category list back to the approved 7 - no column, index, RLS,
-- or policy change, and no other table is touched.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is safe to re-run.

ALTER TABLE master_data DROP CONSTRAINT IF EXISTS master_data_category_check;
ALTER TABLE master_data ADD CONSTRAINT master_data_category_check
  CHECK (category IN (
    'salesperson', 'product_source', 'customer_stage',
    'product_category', 'product_color', 'market', 'country'
  ));
