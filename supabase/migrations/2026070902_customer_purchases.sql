-- Sprint V1.1: Customer Purchase History (not a full Order module).
-- A flat purchase log per customer, used only to compute Purchase Count,
-- Total Revenue, Last Purchase Date, and tier on the Customer List.

CREATE TABLE IF NOT EXISTS customer_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sale_price numeric NOT NULL,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_purchases_customer_id ON customer_purchases(customer_id);

-- Same reasoning as the products table fix earlier: new tables in this
-- project default to RLS enabled with no policy, which silently blocks all
-- writes for the anon key the app uses. Add the same unrestricted policy
-- from the start this time.
ALTER TABLE customer_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access" ON customer_purchases;

CREATE POLICY "Allow full access"
ON customer_purchases
FOR ALL
USING (true)
WITH CHECK (true);
