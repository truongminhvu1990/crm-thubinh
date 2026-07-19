-- CRM Baseline V1
-- Package 1
-- Tables: customers, products
--
-- Development confirmed completely empty (0 rows in information_schema.
-- tables) before this file was written — there is no pre-existing
-- `customers`/`products` table in this environment to reconcile against.
-- Every later migration in this repo (20260709_customer_module_fields.sql,
-- 20260709_jade_specialization_fields.sql, 20260709_vip_care_center_fields.sql,
-- 20260711_customer_country.sql, 20260715_customer_market.sql,
-- 20260709_product_module.sql, 20260711_product_status_fix.sql,
-- 20260713_product_settings_v1_1.sql, 20260709_source_salesperson_fields.sql)
-- was written as an ALTER TABLE against an already-existing `customers`/
-- `products` table and assumes those columns are already present — this
-- file authors that missing baseline from scratch, consolidated to the
-- full current field set already established as the app's real contract
-- (types/customer.ts, types/product.ts, and each service's WRITABLE_FIELDS
-- list), rather than a bare pre-Sprint-3 shape that would just need every
-- one of those 9 files replayed on top. No field is introduced here beyond
-- what those files already document as current column names/purpose.
--
-- Out of scope, deliberately: `master_data`/`tag_options` (Package 2),
-- `customer_purchases` (Package 3), `product_batches`/`product_images`
-- (Package 4), and all 4 Orders tables (Orders is explicitly excluded from
-- this task). `products.batch_id` is likewise left out here — it is added
-- by the `product_batches` migration (Package 4) as a follow-on ALTER,
-- exactly the same pattern that migration already uses today.
--
-- Per task instruction: migration file only, not executed by this task.

BEGIN;

-- ============================================================
-- 1. CREATE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  customer_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text NOT NULL UNIQUE,
  facebook text,
  zalo text,
  birthday date,
  address text,
  -- Customer stage in the sales pipeline (Settings > Master Data >
  -- Customer Stage). The literal 'VIP' also drives the VIP badge.
  vip_level text,
  source text,
  -- JSON-serialized CustomerNote[] (see lib/customer.service.ts
  -- parseCustomerNotes/saveCustomerNotes) — stored as plain text, not
  -- validated at the DB layer.
  notes text,
  last_contacted timestamptz,
  total_purchase numeric,

  -- Basic
  gender text,
  occupation text,
  -- Settings > Master Data > Quốc gia.
  country text,
  -- Settings > Master Data > Thị trường. Column kept as `province` for
  -- backward compatibility — no longer Vietnam-only, can be a country or
  -- city.
  province text,
  -- Free text local area. Column kept as `district` for backward
  -- compatibility.
  district text,

  -- Jade preferences
  wrist_size text,
  ring_size text,
  -- Comma-separated JADE_PRODUCT_TYPES values.
  favorite_type text,
  -- Comma-separated JADE_COLORS values.
  favorite_color text,
  preferred_origin text,
  budget text,
  purpose text,

  -- Sales
  assigned_salesperson text,
  last_viewed_product text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic
  sku text,
  product_code text NOT NULL UNIQUE,
  category text,
  product_name text NOT NULL,
  status text NOT NULL DEFAULT 'Active',

  -- Product Information
  color text,
  -- Numeric only (e.g. 54, 17.5) — never "Ni 54"/"Ring 17". On-screen
  -- label is derived from category in the UI, not stored here.
  size numeric,
  weight numeric,
  jade_grade text,
  notes text,

  -- No longer editable from the Product form (removed in Settings V1.1) —
  -- columns kept so existing data isn't lost.
  origin text,
  jade_type text,
  transparency text,
  texture text,
  shape text,
  wrist_size text,
  ring_size text,

  -- Business
  cost_price numeric,
  sale_price numeric,
  discount numeric,
  location text,
  certificate_no text,
  supplier text,
  source text,
  salesperson text,

  -- Media. image_url/gallery are no longer editable from the Product form
  -- (see Product Images V1, Package 4) — columns kept so existing data
  -- isn't lost, backfilled into product_images once that table lands.
  image_url text,
  gallery text,
  video text,

  -- Inventory. Display-only in the app today — sourced from these values
  -- until the Orders module becomes their sole writer.
  available integer NOT NULL DEFAULT 0,
  reserved integer NOT NULL DEFAULT 0,
  sold integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()

  -- batch_id intentionally omitted — added by the product_batches
  -- migration (Package 4) via `ALTER TABLE products ADD COLUMN batch_id
  -- ... REFERENCES product_batches(id)`, since product_batches does not
  -- exist yet at this point in the execution order.
);

-- ============================================================
-- 2. INDEXES
--
-- customers.phone and products.product_code are each looked up by exact
-- match today (lib/customer.service.ts findCustomerByPhone, lib/
-- product.service.ts findProductByCode — both documented "primary
-- duplicate key" business rules, checked at the application layer, not a
-- DB constraint — see Self Review). customer_code/sku are the other
-- identifier columns surfaced in the same search bars
-- (getCustomers/getProducts .ilike search) and get a matching index for
-- the same reason.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);

CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- ============================================================
-- 3. updated_at TRIGGER
--
-- Same generic function every other table's updated_at trigger in this
-- project reuses (originally created for `customers`, then reused as-is
-- for `products`, `product_batches`, ...). Authored fresh here since this
-- is now the founding migration for both tables.
-- ============================================================

CREATE OR REPLACE FUNCTION set_customers_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
CREATE TRIGGER customers_set_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- ============================================================
-- 4. ROW LEVEL SECURITY + POLICIES
--
-- New tables in this project default to RLS-enabled-with-no-policy, which
-- silently blocks all writes for the anon key the app uses (reads still
-- work, which is why this failure mode has already been hit twice before
-- — products, customer_purchases). Same unrestricted "Allow full access
-- to anon" pattern as every other table, applied to both tables from the
-- start this time — closes the "customers has no RLS state anywhere"
-- gap flagged in docs/CRM_BASELINE_V1.md §6 gate 3.
-- ============================================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON customers;
CREATE POLICY "Allow full access to anon" ON customers
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON products;
CREATE POLICY "Allow full access to anon" ON products
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
  AND table_name IN ('customers', 'products')
ORDER BY table_name;

-- 2. Verify columns (expect: customers = 29 rows, products = 34 rows —
--    cross-check names/types against this file's CREATE TABLE blocks).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('customers', 'products')
ORDER BY table_name, ordinal_position;

-- 3. Verify primary keys (expect one PRIMARY KEY row per table, on `id`).
SELECT tc.table_name, kcu.column_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('customers', 'products')
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name;

-- 4. Verify indexes (expect each table's primary key index, plus
--    idx_customers_phone, idx_customers_customer_code,
--    idx_products_product_code, idx_products_sku).
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('customers', 'products')
ORDER BY tablename, indexname;

-- 5a. Verify RLS is enabled (expect rls_enabled = true for both rows).
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('customers', 'products')
ORDER BY relname;

-- 5b. Verify the "Allow full access to anon" policy exists on both tables
--     (expect exactly 2 rows, cmd = 'ALL', roles = {anon}).
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customers', 'products')
ORDER BY tablename;

-- 6. Verify the updated_at triggers exist on both tables.
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('customers', 'products')
ORDER BY event_object_table;
