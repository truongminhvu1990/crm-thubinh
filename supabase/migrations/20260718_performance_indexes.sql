-- P7 Production Hardening — Performance Review recommended indexes.
-- DRAFTED ONLY. NOT APPLIED. Requires explicit Product Owner approval
-- before being run, per this project's standing database rule.
-- See docs/P7_PERFORMANCE_REVIEW.md §3 for the query patterns each index
-- backs. Purely additive: adds indexes only, no table/column/data touched.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_customer_purchases_sale_date ON customer_purchases (sale_date);
CREATE INDEX IF NOT EXISTS idx_customer_purchases_product_id ON customer_purchases (product_id);

CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

CREATE INDEX IF NOT EXISTS idx_customers_vip_level ON customers (vip_level);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_salesperson ON customers (assigned_salesperson);

COMMIT;

-- Verification (read-only, run after applying):
-- SELECT tablename, indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
