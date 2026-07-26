-- BR-001 Revenue Recognition (docs/ORDERS_SPEC.md "Business Rule Lock",
-- LOCKED): revenue is recognized only when Order Status = Completed AND
-- Payment Status = Paid. "Sales Ledger... must follow this rule."
--
-- Purely additive: one new computed column on the sales_ledger view,
-- `is_revenue_recognized`. No existing column changes, no rows are
-- filtered out of the view itself - Sales Ledger's transaction table (and
-- the Data Verification Center that audits it) still needs to see every
-- purchase row regardless of payment state. Callers that compute a
-- "revenue" total (e.g. the Summary card) filter on this column
-- themselves; row-level display is untouched.
--
-- A customer_purchases row created before the Orders module existed (or
-- entered manually) has order_item_id = NULL - there is no Order to check
-- Status/Payment against, so BR-001's test doesn't apply to it and it
-- counts as recognized, same as it does today.
--
-- Rewritten against actual Production schema: customer_purchases there has
-- no entry_source/created_by/updated_by/updated_at (20260725_data_
-- verification_module.sql has not run on Production), so this view
-- omits them rather than assuming they exist. It does not add them -
-- that migration's job, not this one's.

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
  sc.status AS commission_status,
  CASE
    WHEN cp.product_id IS NOT NULL AND COUNT(*) OVER (
      PARTITION BY cp.customer_id, cp.product_id, cp.sale_date, cp.sale_price
    ) > 1 THEN true
    ELSE false
  END AS is_duplicate,
  (cp.order_item_id IS NULL OR (o.order_status = 'Completed' AND o.payment_status = 'Paid'))
    AS is_revenue_recognized
FROM customer_purchases cp
JOIN customers c ON c.id = cp.customer_id
LEFT JOIN products p ON p.id = cp.product_id
LEFT JOIN sales_commissions sc ON sc.purchase_id = cp.id
LEFT JOIN order_items oi ON oi.id = cp.order_item_id
LEFT JOIN orders o ON o.id = oi.order_id;

GRANT SELECT ON sales_ledger TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'sales_ledger' AND column_name = 'is_revenue_recognized';
-- SELECT is_revenue_recognized, count(*) FROM sales_ledger GROUP BY 1;
