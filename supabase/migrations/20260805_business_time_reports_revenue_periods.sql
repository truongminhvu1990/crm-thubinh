-- Business Time Migration, Wave 2B: Reports SQL.
--
-- Locked Product Owner decision (Business Time Foundation): Business Day =
-- Asia/Ho_Chi_Minh (UTC+7), not UTC. reports_revenue_periods()
-- (20260724_reports_bi_functions.sql) is the one remaining place in this
-- schema that computes Today/This Week/This Month/This Quarter/This Year
-- boundaries entirely in Postgres, using the database session's own now()
-- - confirmed UTC (`current_setting('TIMEZONE')` = 'UTC') in every prior
-- package's live verification. It backs RevenueDashboardCards.tsx's 5
-- fixed-period cards, the one Reports widget the READ PATH migration
-- (Wave 2) could not reach, since that package was explicitly forbidden
-- from touching the database.
--
-- Scope: this ONE function only - it is the only SQL object that computes
-- a business-date boundary from now()/CURRENT_DATE (confirmed by the same
-- repo-wide audit method used in every prior wave; no other function it
-- calls or is called by does this). No table, view, column, index, or any
-- other function is touched.
--
-- Fix: every date_trunc(..., now()) becomes
-- date_trunc(..., now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - Postgres's
-- standard idiom for "the current wall-clock date/time in a named zone".
-- Vietnam has observed a fixed UTC+7 offset with no DST since 1975 (same
-- fact lib/businessTime.ts's own header comment documents), so this
-- produces exactly the same calendar boundaries BusinessTime.ts computes
-- via Intl.DateTimeFormat(..., {timeZone: "Asia/Ho_Chi_Minh"}) - two
-- different engines (Postgres vs. V8/ICU), the same IANA zone, the same
-- fixed offset, therefore identical results. Nothing else about the
-- function changes: same signature, same return columns, same join, same
-- aggregation, same grants.
--
-- date_trunc('week', ...) already defaults to Monday-start (ISO 8601) in
-- Postgres, matching lib/businessTime.ts's startOfWeek() convention - nothing
-- to change there beyond the timezone conversion itself.

BEGIN;

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
      date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today_start,
      (date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '1 day')::date AS today_end,
      date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS week_start,
      (date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '7 day')::date AS week_end,
      date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS month_start,
      (date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '1 month')::date AS month_end,
      date_trunc('quarter', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS quarter_start,
      (date_trunc('quarter', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '3 month')::date AS quarter_end,
      date_trunc('year', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS year_start,
      (date_trunc('year', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '1 year')::date AS year_end
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

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================

-- 1. Reproduce the previous bug deterministically, independent of when this
--    is run: UTC 2026-07-24 18:01 = Vietnam 2026-07-25 01:01. The OLD
--    formula (now(), i.e. plain UTC) would resolve "today" to 2026-07-24;
--    the fix must resolve it to 2026-07-25.
-- SELECT
--   date_trunc('day', '2026-07-24 18:01:00+00'::timestamptz)::date AS old_formula_utc_today,
--   date_trunc('day', '2026-07-24 18:01:00+00'::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS new_formula_vn_today;
-- Expect: old_formula_utc_today = 2026-07-24 (the bug); new_formula_vn_today = 2026-07-25 (fixed).

-- 2. Live check - the function's own "today" period right now:
-- SELECT * FROM reports_revenue_periods() WHERE period_key = 'today';

-- 3. Cross-check against the same boundary computed independently
--    (application-side, via lib/businessTime.ts's BusinessTime.todayString()/
--    startOfWeek()/startOfMonth()/startOfQuarter()/startOfYear() - both
--    must agree):
-- SELECT now(), now() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS vn_wall_clock;

-- 4. Confirm no other object changed:
-- SELECT proname FROM pg_proc WHERE proname LIKE 'reports_%';
-- (expect the same 8 functions as before this migration - only
-- reports_revenue_periods's definition differs)
