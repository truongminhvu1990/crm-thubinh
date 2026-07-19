-- Sprint 4: Product module.
-- The `products` table already existed (created earlier, outside these
-- migrations) with some columns already matching the spec - those are
-- reused as-is: id, product_code, category, product_name, status, origin,
-- color, cost_price, sale_price, image_url, certificate_no, created_at.
-- Only genuinely missing fields get a new column below.

ALTER TABLE products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS jade_type text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS transparency text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS texture text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shape text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wrist_size text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ring_size text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS video text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS available integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Reuses the same generic trigger function created for `customers` in an
-- earlier migration (it only references NEW.updated_at, not customer-specific).
DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- The products table has Row Level Security enabled with no policy, which
-- silently blocks all writes for the anon key the app uses (reads still
-- worked, which is why this wasn't obvious). This adds the same
-- unrestricted-access policy the `customers` table already effectively has,
-- so Add/Edit/Delete Product work the same way Add/Edit/Delete Customer do.
-- If products was locked down on purpose, skip this block and tell me -
-- the rest of the migration does not depend on it.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON products;
CREATE POLICY "Allow full access to anon" ON products
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
