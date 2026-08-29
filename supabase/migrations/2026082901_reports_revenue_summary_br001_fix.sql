-- Reporting Defect Fix (Revenue Management Visibility task, 2026-08-29).
--
-- reports_revenue_summary() (supabase/migrations/2026072401_reports_bi_
-- functions.sql) backs Reports/BI Center's "Doanh thu" cards and the KPI
-- Dashboard (lib/reports/reportsBI.service.ts -> getRevenueSummary()),
-- which is also what getKpiDashboard() and app/reports/reconciliation's
-- Path A read. It summed customer_purchases.sale_price unconditionally -
-- no join to orders at all - so it only implicitly required
-- order_status = 'Completed' (a customer_purchases row for an order only
-- ever exists once that order is Completed, per complete_order_with_
-- snapshots()) but never checked payment_status = 'Paid'. That silently
-- violates BR-001 (LOCKED, docs/03_ORDER_SPEC.md SS14/SS15 item 10:
-- "Revenue recognized only when Completed AND Paid").
--
-- Confirmed via read-only Production audit (2026-08-29): for August 2026,
-- this function returned 2,599,400,000 VND vs. Dashboard's correct
-- 2,521,400,000 VND (getPurchaseReportData(), lib/reports/reports.
-- service.ts, which already applies the full BR-001+BR-002 gate) - a
-- 78,000,000 VND gap, exactly one Completed + Partially Paid order's
-- customer_purchases rows.
--
-- Fix: add the same left join + BR-001/BR-002 condition
-- getPurchaseReportData() already uses (isRevenueRecognized()) - a
-- customer_purchases row counts if it has no linked order (order_item_id
-- IS NULL - legacy/manual rows, BR-002 exception, unchanged) OR its
-- linked order is Completed AND Paid. Dashboard's formula is the
-- reference implementation and is NOT changed by this migration - only
-- this RPC is brought into line with it.
--
-- Deliberately NOT touched by this migration: reports_revenue_periods()
-- (same file) has the identical unconditional-sum pattern for its five
-- fixed named periods (today/this_week/this_month/this_quarter/
-- this_year), but that wasn't the function measured/traced in the audited
-- discrepancy (reports_revenue_summary is what backs the Global-Date-
-- Filter-driven Reports/BI Center total and the KPI Dashboard). Flagged
-- here as a known, same-pattern, NOT-yet-fixed latent defect - left for a
-- separate, explicitly-scoped task per this task's own "smallest correct
-- scope" / "no unnecessary architectural refactor" instruction.

BEGIN;

CREATE OR REPLACE FUNCTION reports_revenue_summary(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  revenue numeric,
  transactions bigint,
  avg_sale numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COALESCE(SUM(cp.sale_price), 0) AS revenue,
    COUNT(*) AS transactions,
    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(cp.sale_price), 0) / COUNT(*) ELSE 0 END AS avg_sale
  FROM customer_purchases cp
  LEFT JOIN order_items oi ON oi.id = cp.order_item_id
  LEFT JOIN orders o ON o.id = oi.order_id
  WHERE (p_start IS NULL OR cp.sale_date >= p_start)
    AND (p_end IS NULL OR cp.sale_date < p_end)
    AND (cp.order_item_id IS NULL OR (o.order_status = 'Completed' AND o.payment_status = 'Paid'));
$$;

GRANT EXECUTE ON FUNCTION reports_revenue_summary(date, date) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT * FROM reports_revenue_summary(NULL, NULL);
--
-- Cross-check against the Dashboard's own BR-001-gated formula, same table:
-- SELECT COALESCE(SUM(cp.sale_price), 0)
-- FROM customer_purchases cp
-- LEFT JOIN order_items oi ON oi.id = cp.order_item_id
-- LEFT JOIN orders o ON o.id = oi.order_id
-- WHERE cp.order_item_id IS NULL OR (o.order_status = 'Completed' AND o.payment_status = 'Paid');
-- (the two SELECTs above must return the identical revenue figure for any
-- p_start/p_end matching the second query's own implicit "all time" range)
--
-- Confirm the previously-included Completed + Partially Paid rows are now excluded:
-- SELECT cp.id, cp.sale_price, o.order_status, o.payment_status
-- FROM customer_purchases cp
-- JOIN order_items oi ON oi.id = cp.order_item_id
-- JOIN orders o ON o.id = oi.order_id
-- WHERE o.order_status = 'Completed' AND o.payment_status != 'Paid';
-- (must NOT appear in reports_revenue_summary()'s total any more)
