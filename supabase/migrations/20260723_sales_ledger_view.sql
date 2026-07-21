-- Sales Ledger feature.
--
-- A pure read-only reporting VIEW, not a new table - the feature's own
-- Business Rule is explicit: revenue reads from customer_purchases,
-- commission reads from sales_commissions, "never recalculate." A view
-- that simply projects/joins those two tables' existing columns (plus
-- customers/products for display) satisfies that literally - it computes
-- nothing, it only exposes columns that already exist so a single
-- server-side query can filter/sort/paginate across all of them at once.
--
-- `sales_commissions.purchase_id` deliberately has no FK (see
-- 20260721_sales_commission_module.sql's header - the immutable-snapshot
-- rationale) - a view's LEFT JOIN doesn't need one, and joining here
-- doesn't reintroduce any live coupling: this view is read-only, nothing
-- ever writes through it, and dropping/changing it can't affect the
-- underlying tables' data or the snapshot immutability.
--
-- security_invoker = true: the view runs with the *querying* role's own
-- RLS, not its owner's - so it inherits exactly the same "Allow full
-- access" (anon + authenticated) policies already on customer_purchases/
-- customers/products/sales_commissions, rather than silently bypassing
-- them. (Requires Postgres 15+; Supabase projects on this schema already
-- run a compatible version - every other RLS policy in this schema
-- predates and doesn't depend on this, so no risk if unsupported, the
-- migration would simply fail loudly at apply time.)

BEGIN;

CREATE OR REPLACE VIEW sales_ledger
WITH (security_invoker = true) AS
SELECT
  cp.id AS purchase_id,
  cp.customer_id,
  cp.product_id,
  cp.sale_price AS sale_amount,
  cp.sale_date,
  cp.note,
  cp.salesperson,
  cp.salesperson_id,
  cp.created_at AS purchase_created_at,
  c.full_name AS customer_name,
  c.customer_code,
  p.product_code,
  p.product_name,
  p.category AS product_category,
  sc.id AS commission_id,
  sc.commission_percent,
  sc.commission_amount,
  sc.status AS commission_status
FROM customer_purchases cp
JOIN customers c ON c.id = cp.customer_id
LEFT JOIN products p ON p.id = cp.product_id
LEFT JOIN sales_commissions sc ON sc.purchase_id = cp.id;

GRANT SELECT ON sales_ledger TO anon, authenticated;

-- Supporting index - the Global Date Filter range (sale_date) applies on
-- every Sales Ledger query, per the feature's explicit requirement to
-- always share Dashboard/Reports' selected period.
CREATE INDEX IF NOT EXISTS idx_customer_purchases_sale_date ON customer_purchases(sale_date);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'sales_ledger' ORDER BY ordinal_position;
-- SELECT * FROM sales_ledger ORDER BY sale_date DESC LIMIT 5;
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'sales_ledger';
