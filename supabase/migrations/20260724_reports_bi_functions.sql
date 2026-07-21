-- Reports Business Intelligence Center (Sprint v2.2.0).
--
-- Every card/table in the new Reports BI Center reads one of these
-- functions - no new tables, no snapshots (task's explicit "Never
-- duplicate data. Never create snapshot tables."). Each function computes
-- its aggregate entirely in Postgres (GROUP BY / SUM / COUNT) and returns
-- only the small, already-aggregated result set the UI renders - the
-- client never pulls raw customer_purchases/sales_commissions rows to
-- aggregate in JS (task's explicit Feature 11 "server-side query... do
-- NOT load unnecessary records").
--
-- Source of truth (task's explicit list, unchanged): revenue from
-- customer_purchases, commission from sales_commissions, customer from
-- customers, product from products, staff from staff. Commission is
-- period-filtered by joining to customer_purchases.sale_date (via
-- sales_commissions.purchase_id) rather than sales_commissions.created_at,
-- so a given period's commission total always corresponds to the same
-- sales that period's revenue total does - the same join sales_ledger
-- (20260723_sales_ledger_view.sql) already uses for the identical reason.
--
-- LANGUAGE sql (not plpgsql) + STABLE: pure read, no side effects, plannable
-- as a single query the caller can filter/limit around. SECURITY INVOKER
-- (Postgres's default for functions, stated explicitly here for the same
-- auditability reason the sales_ledger view states security_invoker=true)
-- means each function runs under the querying role's own RLS - identical
-- effective access to querying the underlying tables directly, since every
-- table involved already has an unrestricted "Allow full access" policy
-- for anon + authenticated.
--
-- All date-range parameters follow lib/dateFilter.ts's DateRange contract:
-- p_start inclusive, p_end exclusive, both NULL meaning "all time" (no
-- bound) - the same semantics getDateRange() already returns for every
-- Global Date Filter option.

BEGIN;

-- ============================================================
-- 1. reports_revenue_periods - Feature 1's five fixed cards (Today / This
--    Week / This Month / This Quarter / This Year), computed from the
--    server's own now() so all five always agree with each other and with
--    "This Quarter" (a period the app's Global Date Filter itself doesn't
--    offer). The sixth card, Custom Range, is covered by
--    reports_revenue_summary below instead, since its bounds come from the
--    user's own Global Date Filter custom selection, not a fixed period.
-- ============================================================

CREATE OR REPLACE FUNCTION reports_revenue_periods()
RETURNS TABLE (
  period_key text,
  revenue numeric,
  transactions bigint,
  avg_sale numeric,
  period_start date,
  period_end date
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH bounds AS (
    SELECT
      date_trunc('day', now())::date AS today_start,
      (date_trunc('day', now()) + interval '1 day')::date AS today_end,
      date_trunc('week', now())::date AS week_start,
      (date_trunc('week', now()) + interval '7 day')::date AS week_end,
      date_trunc('month', now())::date AS month_start,
      (date_trunc('month', now()) + interval '1 month')::date AS month_end,
      date_trunc('quarter', now())::date AS quarter_start,
      (date_trunc('quarter', now()) + interval '3 month')::date AS quarter_end,
      date_trunc('year', now())::date AS year_start,
      (date_trunc('year', now()) + interval '1 year')::date AS year_end
  ),
  periods AS (
    SELECT 'today' AS period_key, today_start AS p_start, today_end AS p_end FROM bounds
    UNION ALL SELECT 'this_week', week_start, week_end FROM bounds
    UNION ALL SELECT 'this_month', month_start, month_end FROM bounds
    UNION ALL SELECT 'this_quarter', quarter_start, quarter_end FROM bounds
    UNION ALL SELECT 'this_year', year_start, year_end FROM bounds
  )
  SELECT
    p.period_key,
    COALESCE(SUM(cp.sale_price), 0) AS revenue,
    COUNT(cp.id) AS transactions,
    CASE WHEN COUNT(cp.id) > 0 THEN COALESCE(SUM(cp.sale_price), 0) / COUNT(cp.id) ELSE 0 END AS avg_sale,
    p.p_start,
    p.p_end
  FROM periods p
  LEFT JOIN customer_purchases cp ON cp.sale_date >= p.p_start AND cp.sale_date < p.p_end
  GROUP BY p.period_key, p.p_start, p.p_end;
$$;

-- period_start/period_end are exposed alongside the aggregates so the
-- client can build an exact drill-down link into Sales Ledger without
-- recomputing this function's own period math a second time in JS.

-- ============================================================
-- 2. reports_revenue_summary - single-range revenue/transactions/avg sale.
--    Backs the Custom Range card (Feature 1) and doubles as the general
--    "revenue for the current Global Date Filter" query used by the KPI
--    Dashboard (Feature 10).
-- ============================================================

CREATE OR REPLACE FUNCTION reports_revenue_summary(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  revenue numeric,
  transactions bigint,
  avg_sale numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COALESCE(SUM(sale_price), 0) AS revenue,
    COUNT(*) AS transactions,
    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(sale_price), 0) / COUNT(*) ELSE 0 END AS avg_sale
  FROM customer_purchases
  WHERE (p_start IS NULL OR sale_date >= p_start)
    AND (p_end IS NULL OR sale_date < p_end);
$$;

-- ============================================================
-- 3. reports_product_analysis - Feature 2 (Top Selling Products).
-- ============================================================

CREATE OR REPLACE FUNCTION reports_product_analysis(p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (
  product_id uuid,
  product_code text,
  product_name text,
  revenue numeric,
  transactions bigint,
  avg_sale numeric,
  contribution_pct numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH filtered AS (
    SELECT cp.product_id, cp.sale_price
    FROM customer_purchases cp
    WHERE cp.product_id IS NOT NULL
      AND (p_start IS NULL OR cp.sale_date >= p_start)
      AND (p_end IS NULL OR cp.sale_date < p_end)
  ),
  totals AS (
    SELECT COALESCE(SUM(sale_price), 0) AS total_revenue FROM filtered
  ),
  by_product AS (
    SELECT product_id, SUM(sale_price) AS revenue, COUNT(*) AS transactions
    FROM filtered
    GROUP BY product_id
  )
  SELECT
    p.id,
    p.product_code,
    p.product_name,
    bp.revenue,
    bp.transactions,
    bp.revenue / bp.transactions,
    CASE WHEN t.total_revenue > 0 THEN (bp.revenue / t.total_revenue) * 100 ELSE 0 END
  FROM by_product bp
  JOIN products p ON p.id = bp.product_id
  CROSS JOIN totals t
  ORDER BY bp.revenue DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 4. reports_category_analysis - Feature 3.
-- ============================================================

CREATE OR REPLACE FUNCTION reports_category_analysis(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  category text,
  revenue numeric,
  transactions bigint,
  contribution_pct numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH filtered AS (
    SELECT COALESCE(p.category, 'Chưa xác định') AS category, cp.sale_price
    FROM customer_purchases cp
    LEFT JOIN products p ON p.id = cp.product_id
    WHERE (p_start IS NULL OR cp.sale_date >= p_start)
      AND (p_end IS NULL OR cp.sale_date < p_end)
  ),
  totals AS (
    SELECT COALESCE(SUM(sale_price), 0) AS total_revenue FROM filtered
  )
  SELECT
    f.category,
    SUM(f.sale_price) AS revenue,
    COUNT(*) AS transactions,
    CASE WHEN t.total_revenue > 0 THEN (SUM(f.sale_price) / t.total_revenue) * 100 ELSE 0 END AS contribution_pct
  FROM filtered f
  CROSS JOIN totals t
  GROUP BY f.category, t.total_revenue
  ORDER BY SUM(f.sale_price) DESC;
$$;

-- ============================================================
-- 5. reports_customer_summary - Feature 4's New/Returning/Average Purchase.
--    "New" = a customer whose first-ever purchase (across all of
--    customer_purchases, not just this range) falls inside [p_start,
--    p_end); "Returning" = purchased in-range but their first purchase was
--    earlier. All-time (both bounds NULL) makes every active customer
--    "new" by definition, which is correct: there is no earlier period to
--    have returned from.
-- ============================================================

CREATE OR REPLACE FUNCTION reports_customer_summary(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  new_customers bigint,
  returning_customers bigint,
  avg_purchase numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH first_purchase AS (
    SELECT customer_id, MIN(sale_date) AS first_date
    FROM customer_purchases
    GROUP BY customer_id
  ),
  period AS (
    SELECT customer_id, sale_price
    FROM customer_purchases
    WHERE (p_start IS NULL OR sale_date >= p_start)
      AND (p_end IS NULL OR sale_date < p_end)
  ),
  period_customers AS (
    SELECT DISTINCT customer_id FROM period
  )
  SELECT
    (SELECT COUNT(*) FROM period_customers pc
       JOIN first_purchase fp ON fp.customer_id = pc.customer_id
       WHERE (p_start IS NULL OR fp.first_date >= p_start) AND (p_end IS NULL OR fp.first_date < p_end)) AS new_customers,
    (SELECT COUNT(*) FROM period_customers pc
       JOIN first_purchase fp ON fp.customer_id = pc.customer_id
       WHERE NOT ((p_start IS NULL OR fp.first_date >= p_start) AND (p_end IS NULL OR fp.first_date < p_end))) AS returning_customers,
    (SELECT CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(sale_price), 0) / COUNT(*) ELSE 0 END FROM period) AS avg_purchase;
$$;

-- ============================================================
-- 6. reports_top_customers - Feature 4's Top Customers table.
--    period_revenue/transactions/avg_sale are bounded by the range;
--    lifetime_revenue is deliberately all-time regardless of range, since
--    it names "lifetime", not "this period".
-- ============================================================

CREATE OR REPLACE FUNCTION reports_top_customers(p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (
  customer_id uuid,
  customer_code text,
  customer_name text,
  period_revenue numeric,
  period_transactions bigint,
  avg_sale numeric,
  lifetime_revenue numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH period AS (
    SELECT customer_id, sale_price
    FROM customer_purchases
    WHERE (p_start IS NULL OR sale_date >= p_start)
      AND (p_end IS NULL OR sale_date < p_end)
  ),
  by_customer AS (
    SELECT customer_id, SUM(sale_price) AS revenue, COUNT(*) AS transactions
    FROM period
    GROUP BY customer_id
  ),
  lifetime AS (
    SELECT customer_id, SUM(sale_price) AS lifetime_revenue
    FROM customer_purchases
    GROUP BY customer_id
  )
  SELECT
    c.id,
    c.customer_code,
    c.full_name,
    bc.revenue,
    bc.transactions,
    bc.revenue / bc.transactions,
    COALESCE(lt.lifetime_revenue, 0)
  FROM by_customer bc
  JOIN customers c ON c.id = bc.customer_id
  LEFT JOIN lifetime lt ON lt.customer_id = bc.customer_id
  ORDER BY bc.revenue DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 7. reports_staff_analysis - Feature 5. Revenue/transactions/avg_sale
--    come from customer_purchases.salesperson_id (the system of record for
--    "which staff made this sale" - staff.constants/staff.service.ts's
--    Feature 5 salesperson migration); commission comes from
--    sales_commissions, joined back to customer_purchases on purchase_id
--    purely to reuse its sale_date for the same period bound (never to
--    recompute commission_amount itself - copied verbatim, same as
--    sales_ledger).
-- ============================================================

CREATE OR REPLACE FUNCTION reports_staff_analysis(p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (
  staff_id uuid,
  staff_code text,
  full_name text,
  revenue numeric,
  transactions bigint,
  avg_sale numeric,
  commission numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH sales AS (
    SELECT salesperson_id, sale_price
    FROM customer_purchases
    WHERE salesperson_id IS NOT NULL
      AND (p_start IS NULL OR sale_date >= p_start)
      AND (p_end IS NULL OR sale_date < p_end)
  ),
  by_staff AS (
    SELECT salesperson_id, SUM(sale_price) AS revenue, COUNT(*) AS transactions
    FROM sales
    GROUP BY salesperson_id
  ),
  commissions AS (
    SELECT sc.salesperson_id, SUM(sc.commission_amount) AS commission
    FROM sales_commissions sc
    JOIN customer_purchases cp ON cp.id = sc.purchase_id
    WHERE sc.salesperson_id IS NOT NULL
      AND (p_start IS NULL OR cp.sale_date >= p_start)
      AND (p_end IS NULL OR cp.sale_date < p_end)
    GROUP BY sc.salesperson_id
  )
  SELECT
    s.id,
    s.staff_code,
    s.full_name,
    bs.revenue,
    bs.transactions,
    bs.revenue / bs.transactions,
    COALESCE(c.commission, 0)
  FROM by_staff bs
  JOIN staff s ON s.id = bs.salesperson_id
  LEFT JOIN commissions c ON c.salesperson_id = bs.salesperson_id
  ORDER BY bs.revenue DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 8. reports_revenue_trend - Feature 6. p_granularity in
--    ('day','week','month','year'); anything else falls back to 'day'.
-- ============================================================

CREATE OR REPLACE FUNCTION reports_revenue_trend(p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_granularity text DEFAULT 'day')
RETURNS TABLE (
  bucket date,
  revenue numeric,
  transactions bigint
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    date_trunc(
      CASE p_granularity WHEN 'week' THEN 'week' WHEN 'month' THEN 'month' WHEN 'year' THEN 'year' ELSE 'day' END,
      sale_date
    )::date AS bucket,
    SUM(sale_price) AS revenue,
    COUNT(*) AS transactions
  FROM customer_purchases
  WHERE (p_start IS NULL OR sale_date >= p_start)
    AND (p_end IS NULL OR sale_date < p_end)
  GROUP BY bucket
  ORDER BY bucket;
$$;

-- ============================================================
-- 9. Grants - same "anon + authenticated" shape as every table/view policy
--    in this schema (functions default to PUBLIC-executable, but stated
--    explicitly here for the same auditability reason as the other grants).
-- ============================================================

GRANT EXECUTE ON FUNCTION reports_revenue_periods() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reports_revenue_summary(date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reports_product_analysis(date, date, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reports_category_analysis(date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reports_customer_summary(date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reports_top_customers(date, date, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reports_staff_analysis(date, date, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reports_revenue_trend(date, date, text) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT * FROM reports_revenue_periods();
-- SELECT * FROM reports_revenue_summary(NULL, NULL);
-- SELECT * FROM reports_product_analysis(NULL, NULL, 10);
-- SELECT * FROM reports_category_analysis(NULL, NULL);
-- SELECT * FROM reports_customer_summary(NULL, NULL);
-- SELECT * FROM reports_top_customers(NULL, NULL, 10);
-- SELECT * FROM reports_staff_analysis(NULL, NULL, 10);
-- SELECT * FROM reports_revenue_trend(NULL, NULL, 'month');
-- Cross-check against source tables directly, e.g.:
-- SELECT COALESCE(SUM(sale_price),0), COUNT(*) FROM customer_purchases;
-- SELECT COALESCE(SUM(commission_amount),0) FROM sales_commissions;
