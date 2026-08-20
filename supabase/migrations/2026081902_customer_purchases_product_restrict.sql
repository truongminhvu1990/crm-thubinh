-- Lot Product-Level Status, D1 (Product Owner Authorization, 2026-08-19).
-- Decision 4 (LOCKED): a Product with historical business data must not be
-- hard-deletable. `order_items.product_id` already enforces this via
-- `ON DELETE RESTRICT` (supabase/migrations/20260716_orders_database_
-- foundation.sql) for any Product referenced by an Order - but a Product
-- sold only through the legacy, order-less Customer Purchases flow
-- (lib/purchase.service.ts) had no such protection: `customer_purchases.
-- product_id` was `ON DELETE SET NULL`, so deleting that Product silently
-- orphaned its sale record instead of being blocked.
--
-- This reuses the exact same constraint pattern already applied to
-- `order_items.product_id` and to the draft `consignments.product_id`
-- (2026081801_consignment_module.sql) - RESTRICT, not a new mechanism.
--
-- Scope note (audit finding, not fixed here - out of D1-D10 scope): this
-- protects only Products with an actual `customer_purchases` row (sale
-- history). A Product that was Returned to a supplier but never sold has
-- no FK relationship to lean on here - that gap is covered by an
-- application-layer guard in deleteProduct() (lib/product.service.ts)
-- instead, per the Implementation Plan mục 11's "DB layer" / "Application
-- layer" split. `compensations.product_id` (still ON DELETE SET NULL) is
-- explicitly out of scope - Decision 4 named customer purchase/order
-- relationship/sale history/Lot history, not Compensation; flagged as an
-- open question in the Implementation Plan mục 21, not resolved here.

BEGIN;

ALTER TABLE customer_purchases DROP CONSTRAINT IF EXISTS customer_purchases_product_id_fkey;
ALTER TABLE customer_purchases
  ADD CONSTRAINT customer_purchases_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'customer_purchases'::regclass AND conname = 'customer_purchases_product_id_fkey';
-- Expect: FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
