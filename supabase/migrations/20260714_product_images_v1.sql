-- Product Images V1 (final spec).
-- One product can have many images, ordered by sort_order - the image
-- with the lowest sort_order is always the thumbnail everywhere. No
-- separate "cover" flag: reordering is the only way to change it.
-- Uploaded files live in Supabase Storage; manually-entered URLs
-- (including converted Google Drive links) are stored as-is. The old
-- products.image_url/gallery columns are left in place (existing products
-- keep working) and backfilled into product_images below - the app reads
-- exclusively from product_images going forward.

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_sort ON product_images(product_id, sort_order);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON product_images;
CREATE POLICY "Allow full access to anon" ON product_images
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Backfill: existing cover (image_url) becomes sort_order 0, existing
-- gallery URLs (comma/newline-separated) fill in after it.
INSERT INTO product_images (product_id, image_url, sort_order)
SELECT id, trim(image_url), 0
FROM products
WHERE image_url IS NOT NULL AND trim(image_url) <> '';

INSERT INTO product_images (product_id, image_url, sort_order)
SELECT p.id, trim(t.url), t.ord
FROM products p
CROSS JOIN LATERAL unnest(regexp_split_to_array(p.gallery, '[,\n]+')) WITH ORDINALITY AS t(url, ord)
WHERE p.gallery IS NOT NULL AND trim(p.gallery) <> '' AND trim(t.url) <> '';

-- Storage bucket for uploaded files (public read, so stored image URLs
-- work directly in <img> tags without a signed-URL round trip).
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
