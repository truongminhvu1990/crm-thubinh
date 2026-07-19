-- Sprint V1.1: Product Batches V1.
-- A batch groups products received together from a supplier, with an
-- optional return-to-supplier deadline. Batch stats and revenue are
-- derived client-side from products.status and customer_purchases - no
-- snapshot columns, and nothing here touches the customers/
-- customer_purchases tables.

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

CREATE UNIQUE INDEX IF NOT EXISTS product_batches_batch_code_ci_idx
  ON product_batches (lower(trim(batch_code)));

DROP TRIGGER IF EXISTS product_batches_set_updated_at ON product_batches;
CREATE TRIGGER product_batches_set_updated_at
BEFORE UPDATE ON product_batches
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON product_batches;
CREATE POLICY "Allow full access to anon" ON product_batches
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Products link to their batch. Nullable - the Product form shows the
-- batch selector for every product, not conditioned on source.
ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES product_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_batch_id ON products(batch_id);

-- "Returned" (returned to supplier) is a new value for the existing
-- products.status column - Return to Supplier only ever changes this
-- column, it never deletes the product row.
