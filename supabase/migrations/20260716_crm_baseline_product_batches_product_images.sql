-- CRM Baseline V1
-- Package 4
-- Tables: product_batches, product_images
--
-- Source of Truth: docs/CRM_DATABASE_SPECIFICATION.md lists both tables
-- under "NOT YET APPROVED Tables" pending this package, with no schema
-- asserted there. Per that document's own sourcing rule (approved
-- migrations only, no application code), this file transcribes exactly
-- what the Product Owner approved migration history already defines for
-- these two tables - no redesign, no inferred columns, indexes, or
-- constraints beyond what those files already contain:
--   - 20260710_product_batches.sql (creating migration: table, PK,
--     status CHECK, the case-insensitive unique batch_code index, the
--     updated_at trigger, RLS, the "Allow full access to anon" policy,
--     and the products.batch_id follow-on column + its index)
--   - 20260714_product_images_v1.sql (creating migration: table, PK, FK,
--     the two product_id indexes, RLS, the "Allow full access to anon"
--     policy, the image_url/gallery backfill, and the product-images
--     storage bucket + its 4 storage policies)
--
-- Dependency: `product_images.product_id REFERENCES products(id)` and
-- the `products.batch_id REFERENCES product_batches(id)` follow-on column
-- both require Package 1 (`products`) to already exist.
--
-- `ALTER TABLE products ADD COLUMN batch_id ...` below touches the
-- `products` table but does NOT modify the Package 1 migration file -
-- it is a new, additive ALTER in this new file, exactly the deferred
-- step Package 1's own migration comment pre-announced ("batch_id
-- intentionally omitted - added by the product_batches migration
-- (Package 4)..."). This is the same pattern the approved migration
-- history already uses (20260710_product_batches.sql ALTERs `products`
-- the same way). Packages 1, 2, 3 and CRM_DATABASE_SPECIFICATION.md
-- themselves are not edited by this file.
--
-- The image_url/gallery backfill INSERT...SELECT statements and the
-- storage bucket INSERT are carried over from the approved migration
-- history as-is. Neither is seed/mock data: the backfill only copies a
-- product's own existing `image_url`/`gallery` values (a data-preserving
-- step that is a no-op against the currently-empty `products` table) and
-- the storage bucket row is required application infrastructure, not
-- business or example data.
--
-- Out of scope, deliberately: all 4 Orders tables, Inventory, Reports.
-- No seed data, no mock data.
--
-- Per task instruction: migration file only, not executed by this task.

BEGIN;

-- ============================================================
-- 1. CREATE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text NOT NULL,
  supplier text,
  received_date date,
  return_due_date date,
  other_cost numeric,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'returned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. products FOLLOW-ON COLUMN — deferred from Package 1, added here
--    now that product_batches exists (see header note above).
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES product_batches(id) ON DELETE SET NULL;

-- ============================================================
-- 3. INDEXES — exactly what the approved creating migrations define.
--    No additional index inferred.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS product_batches_batch_code_ci_idx
  ON product_batches (lower(trim(batch_code)));

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_sort ON product_images(product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_products_batch_id ON products(batch_id);

-- ============================================================
-- 4. updated_at TRIGGER — product_batches only, reusing the shared
--    function already created in Package 1. product_images has no
--    updated_at column and no trigger, matching the approved creating
--    migration.
-- ============================================================

DROP TRIGGER IF EXISTS product_batches_set_updated_at ON product_batches;
CREATE TRIGGER product_batches_set_updated_at
BEFORE UPDATE ON product_batches
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- ============================================================
-- 5. ROW LEVEL SECURITY + POLICIES
-- ============================================================

ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON product_batches;
CREATE POLICY "Allow full access to anon" ON product_batches
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON product_images;
CREATE POLICY "Allow full access to anon" ON product_images
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 6. BACKFILL — data-preserving copy of each product's existing
--    image_url/gallery values into product_images. Not seed/mock data;
--    a no-op today since `products` currently holds 0 rows.
-- ============================================================

INSERT INTO product_images (product_id, image_url, sort_order)
SELECT id, trim(image_url), 0
FROM products
WHERE image_url IS NOT NULL AND trim(image_url) <> '';

INSERT INTO product_images (product_id, image_url, sort_order)
SELECT p.id, trim(t.url), t.ord
FROM products p
CROSS JOIN LATERAL unnest(regexp_split_to_array(p.gallery, '[,\n]+')) WITH ORDINALITY AS t(url, ord)
WHERE p.gallery IS NOT NULL AND trim(p.gallery) <> '' AND trim(t.url) <> '';

-- ============================================================
-- 7. STORAGE BUCKET + POLICIES — required infrastructure for
--    product_images, not business/example data.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Public read product-images" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Anon upload product-images" ON storage.objects;
CREATE POLICY "Anon upload product-images" ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Anon update product-images" ON storage.objects;
CREATE POLICY "Anon update product-images" ON storage.objects
  FOR UPDATE
  TO anon
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Anon delete product-images" ON storage.objects;
CREATE POLICY "Anon delete product-images" ON storage.objects
  FOR DELETE
  TO anon
  USING (bucket_id = 'product-images');

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after the transaction above has
-- been executed and approved. Not part of the transaction itself.
-- ============================================================

-- 1. Verify both tables exist (expect exactly 2 rows).
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('product_batches', 'product_images')
ORDER BY table_name;

-- 2. Verify columns (expect: product_batches = 10 rows,
--    product_images = 5 rows).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('product_batches', 'product_images')
ORDER BY table_name, ordinal_position;

-- 3. Verify products.batch_id was added (expect 1 row).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name = 'batch_id';

-- 4. Verify primary keys (expect one PRIMARY KEY row per table, on `id`).
SELECT tc.table_name, kcu.column_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('product_batches', 'product_images')
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name;

-- 5. Verify foreign keys (expect: product_images.product_id -> products,
--    products.batch_id -> product_batches).
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_schema = 'public'
  AND ((tc.table_name = 'product_images' AND kcu.column_name = 'product_id')
    OR (tc.table_name = 'products' AND kcu.column_name = 'batch_id'))
  AND tc.constraint_type = 'FOREIGN KEY';

-- 6. Verify the product_batches.status CHECK constraint.
SELECT tc.table_name, tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'product_batches'
  AND tc.constraint_type = 'CHECK';

-- 7. Verify indexes (expect product_batches_batch_code_ci_idx,
--    idx_product_images_product_id, idx_product_images_product_sort,
--    idx_products_batch_id, plus each table's primary key index).
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename IN ('product_batches', 'product_images')
    OR indexname = 'idx_products_batch_id')
ORDER BY tablename, indexname;

-- 8a. Verify RLS is enabled (expect rls_enabled = true for both rows).
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('product_batches', 'product_images')
ORDER BY relname;

-- 8b. Verify the "Allow full access to anon" policy exists on both
--     tables (expect exactly 2 rows, cmd = 'ALL', roles = {anon}).
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('product_batches', 'product_images')
ORDER BY tablename;

-- 9. Verify the updated_at trigger on product_batches (expect 1 row).
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'product_batches';

-- 10. Verify the product-images storage bucket exists (expect 1 row,
--     public = true).
SELECT id, name, public FROM storage.buckets WHERE id = 'product-images';

-- 11. Verify the 4 storage policies on storage.objects for this bucket.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'Public read product-images',
    'Anon upload product-images',
    'Anon update product-images',
    'Anon delete product-images'
  )
ORDER BY policyname;

-- 12. Confirm no rows exist in either new table (expect 0 for both -
--     the backfill in step 6 is a no-op against an empty `products`).
SELECT
  (SELECT count(*) FROM product_batches) AS product_batches_rows,
  (SELECT count(*) FROM product_images) AS product_images_rows;
