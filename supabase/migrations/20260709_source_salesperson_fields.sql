-- Sprint V1.4: Source & Salesperson tracking.
-- `products.source`/`salesperson` are the editable, current values on the
-- item. `customer_purchases.source`/`salesperson` are a snapshot copied in
-- at sale time (see lib/purchase.service.ts), so Report page aggregates
-- stay accurate even if a product's source/salesperson is edited later.

ALTER TABLE products ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS salesperson text;

ALTER TABLE customer_purchases ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE customer_purchases ADD COLUMN IF NOT EXISTS salesperson text;
