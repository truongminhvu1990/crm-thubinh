-- Data Verification Center (Sprint v2.3.0).
--
-- Purely additive schema change: new nullable/defaulted columns on the
-- existing `customer_purchases` table (source of truth, per the task),
-- plus the same generic `set_customers_updated_at()` trigger every other
-- table's updated_at already reuses (see 20260716_crm_baseline_customers_
-- products.sql). No new tables, no snapshots - "Never duplicate data" is
-- satisfied by extending the existing `sales_ledger` view additively
-- rather than creating a second, near-identical view.
--
-- entry_source distinguishes Live Sale (default - anything entered
-- through the app's normal purchase-entry flow) from Historical Import
-- (set only by an operator backfilling old sales, e.g. via a seed script -
-- this sprint does not add any UI to set it, only to display/filter it,
-- per Features 2/5/6's own framing as tracking/display, not an import
-- tool). created_by/updated_by are left NULL for any write path this
-- sprint doesn't touch (Customers' purchase-entry flow is explicitly
-- protected - "Do NOT redesign Customers" - so it never populates them);
-- the UI displays "—" for NULL, which is honest given no authenticated-
-- user identity is threaded into that write path today.
--
-- is_duplicate on the view (Feature 4's exact rule: same customer_id,
-- product_id, sale_date, sale_price) is a computed window-function flag,
-- not a stored column - it can never drift from the underlying data, and
-- nothing about it merges or deletes rows (warning only, per the task).
-- Purchases with a NULL product_id are never flagged - NULL groups NULLs
-- together in PARTITION BY, which would otherwise falsely flag every
-- no-product purchase as a "duplicate" of every other one.

BEGIN;

-- ============================================================
-- 1. customer_purchases - new columns
-- ============================================================

ALTER TABLE customer_purchases
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'Live Sale'
    CHECK (entry_source IN ('Live Sale', 'Historical Import')),
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill for rows that already exist (the Reports BI dev seed used
-- `note` to carry this same Live Sale / Historical Import distinction
-- before this column existed - reconcile it here, then leave `note` itself
-- untouched, still a free-text field). created_by backfills to the
-- salesperson on record as the closest honest proxy for "who recorded
-- this" available today; updated_by stays NULL (nothing has been edited).
UPDATE customer_purchases SET entry_source = note WHERE note IN ('Live Sale', 'Historical Import');
UPDATE customer_purchases SET created_by = salesperson WHERE created_by IS NULL AND salesperson IS NOT NULL;
UPDATE customer_purchases SET updated_at = created_at;

DROP TRIGGER IF EXISTS customer_purchases_set_updated_at ON customer_purchases;
CREATE TRIGGER customer_purchases_set_updated_at
BEFORE UPDATE ON customer_purchases
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

CREATE INDEX IF NOT EXISTS idx_customer_purchases_entry_source ON customer_purchases(entry_source);

-- ============================================================
-- 2. sales_ledger view - extended additively. Every existing column stays
--    exactly as-is (Normal Mode / today's Sales Ledger is unaffected);
--    only new columns are appended.
-- ============================================================

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
  cp.entry_source,
  cp.created_by,
  cp.updated_by,
  cp.updated_at,
  CASE
    WHEN cp.product_id IS NOT NULL AND COUNT(*) OVER (
      PARTITION BY cp.customer_id, cp.product_id, cp.sale_date, cp.sale_price
    ) > 1 THEN true
    ELSE false
  END AS is_duplicate
FROM customer_purchases cp
JOIN customers c ON c.id = cp.customer_id
LEFT JOIN products p ON p.id = cp.product_id
LEFT JOIN sales_commissions sc ON sc.purchase_id = cp.id;

GRANT SELECT ON sales_ledger TO anon, authenticated;

-- ============================================================
-- 3. verification_dashboard() - Features 5/6/8 in one call: Import
--    Progress (historical_imported/live_sales/total_transactions/
--    import_pct), Missing History (estimated_historical/imported_
--    historical/remaining_historical/completion_pct), and Duplicate
--    Warnings - all small aggregates, computed server-side (Feature 10).
--
--    Missing History's "Estimated Historical" has no dedicated field
--    anywhere in the schema (no table stores an independent "expected
--    transaction count"), so it's derived from the one fact already in
--    the data that implies an expected sale record: every `products` row
--    with status = 'Sold' represents a completed sale that should have a
--    matching customer_purchases row. "Imported" counts how many Sold
--    products actually have one; "Remaining" is Sold products with none -
--    i.e. exactly the products/purchases-completeness gap this Center
--    exists to surface (the same class of gap this project has hit before -
--    products marked Sold with zero backing purchase rows).
-- ============================================================

CREATE OR REPLACE FUNCTION verification_dashboard()
RETURNS TABLE (
  historical_imported bigint,
  live_sales bigint,
  total_transactions bigint,
  import_pct numeric,
  duplicate_warnings bigint,
  estimated_historical bigint,
  imported_historical bigint,
  remaining_historical bigint,
  completion_pct numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH totals AS (
    SELECT
      COUNT(*) FILTER (WHERE entry_source = 'Historical Import') AS historical_imported,
      COUNT(*) FILTER (WHERE entry_source = 'Live Sale') AS live_sales,
      COUNT(*) AS total_transactions
    FROM customer_purchases
  ),
  duplicates AS (
    SELECT COUNT(*) AS duplicate_warnings FROM sales_ledger WHERE is_duplicate
  ),
  sold_products AS (
    SELECT COUNT(*) AS estimated_historical FROM products WHERE status = 'Sold'
  ),
  matched_products AS (
    SELECT COUNT(DISTINCT cp.product_id) AS imported_historical
    FROM customer_purchases cp
    JOIN products p ON p.id = cp.product_id
    WHERE p.status = 'Sold'
  )
  SELECT
    t.historical_imported,
    t.live_sales,
    t.total_transactions,
    CASE WHEN t.total_transactions > 0 THEN (t.historical_imported::numeric / t.total_transactions) * 100 ELSE 0 END,
    d.duplicate_warnings,
    sp.estimated_historical,
    mp.imported_historical,
    sp.estimated_historical - mp.imported_historical,
    CASE WHEN sp.estimated_historical > 0 THEN (mp.imported_historical::numeric / sp.estimated_historical) * 100 ELSE 0 END
  FROM totals t, duplicates d, sold_products sp, matched_products mp;
$$;

GRANT EXECUTE ON FUNCTION verification_dashboard() TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'customer_purchases' AND column_name IN
--   ('entry_source','created_by','updated_by','updated_at');
-- SELECT entry_source, count(*) FROM customer_purchases GROUP BY entry_source;
-- SELECT * FROM sales_ledger WHERE is_duplicate LIMIT 20;
-- SELECT * FROM verification_dashboard();
