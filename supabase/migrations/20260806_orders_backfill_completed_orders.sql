-- Backfill historical Completed Orders into customer_purchases and
-- sales_commissions.
--
-- Context: 20260802_orders_sales_snapshot_integration.sql added the write
-- path (complete_order_with_snapshots) that creates one customer_purchases
-- row + one sales_commissions row per order_item, atomically, whenever an
-- order is completed FROM NOW ON. Any order that reached order_status =
-- 'Completed' BEFORE that migration shipped never went through that RPC,
-- so its order_items have no corresponding customer_purchases/
-- sales_commissions rows. This migration is the one-time backfill for
-- exactly that gap - it changes no schema and adds no new columns/indexes;
-- it reuses the ones 20260802 already created.
--
-- Scope: order_status = 'Completed' only. Draft/Reserved/Lost orders are
-- never read by either INSERT below.
--
-- Idempotency:
--   Step 1 (customer_purchases) relies on the existing partial unique
--   index idx_customer_purchases_order_item_id_unique(order_item_id)
--   WHERE order_item_id IS NOT NULL - same ON CONFLICT target
--   complete_order_with_snapshots itself uses - so re-running this
--   migration inserts nothing for an order_item that already has a
--   purchase row, whether that row came from the live RPC or from a
--   previous run of this migration.
--   Step 2 (sales_commissions) cannot rely on a freshly-generated
--   purchase_id for its ON CONFLICT check, because on a re-run the
--   matching customer_purchases row already exists with whatever id it
--   was first given - a new gen_random_uuid() would never collide. So
--   Step 2 re-derives purchase_id by joining customer_purchases ->
--   order_items -> orders via order_item_id (never invented), and only
--   considers purchases with NO existing sales_commissions row
--   (NOT EXISTS), backed by the sales_commissions.purchase_id UNIQUE
--   constraint as a second line of defense (ON CONFLICT DO NOTHING).
--
-- Commission calculation: reused verbatim from
-- lib/commission/commission.service.ts's findMatchingRule() +
-- calculateCommissionAmount(), the exact functions
-- order.service.ts#completeOrder() calls before invoking
-- complete_order_with_snapshots -
--   - candidate rules: commission_rules WHERE is_active = true
--   - match: sale_amount >= minimum_amount AND (maximum_amount IS NULL OR
--     sale_amount <= maximum_amount)
--   - tie-break (ties should not happen with the locked default,
--     non-overlapping ranges, but are possible if rules are edited later):
--     highest-minimum_amount match wins -> ORDER BY minimum_amount DESC
--     LIMIT 1
--   - commission_amount = sale_amount * commission_percent / 100
-- sale_amount here is order_items.line_total, matching order.service.ts's
-- own "sale_price = order_item.line_total (Rule 4)" comment. An order_item
-- with no matching active rule gets its customer_purchases row backfilled
-- (that part never depended on commission matching) but no
-- sales_commissions row - inserting one with a NULL commission_percent
-- would violate that column's NOT NULL constraint and abort the whole
-- transaction. See Self Review for how to find any such rows.
--
-- Field preservation (per order.service.ts#completeOrder(), unchanged):
--   sale_price / sale_amount <- order_items.line_total
--   sale_date                <- orders.order_date (verbatim - historical
--                                order_date is locked, never recomputed)
--   customer_id               <- orders.customer_id
--   salesperson (text)        <- orders.sales_owner
--   salesperson_id             <- staff row with staff.full_name =
--                                orders.sales_owner (exact match, same as
--                                lib/staff.service.ts's getStaffByName();
--                                NULL if no such staff row exists)
--   source                     <- NULL (Orders has no source field of its
--                                own - same as the live write path)
--
-- Single transaction: both INSERTs run inside one BEGIN/COMMIT, so a
-- failure in Step 2 rolls back Step 1's inserts from the same run too -
-- no order is ever left half-backfilled.

BEGIN;

-- ============================================================
-- Step 1: customer_purchases - one row per order_item belonging to a
-- Completed order that doesn't already have one.
-- ============================================================

INSERT INTO customer_purchases (
  id, customer_id, product_id, sale_price, sale_date, source,
  salesperson, salesperson_id, order_item_id
)
SELECT
  gen_random_uuid(),
  o.customer_id,
  oi.product_id,
  oi.line_total,
  o.order_date,
  NULL,
  o.sales_owner,
  s.id,
  oi.id
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN staff s ON s.full_name = o.sales_owner
WHERE o.order_status = 'Completed'
ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

-- ============================================================
-- Step 2: sales_commissions - one snapshot row per customer_purchases row
-- (from a Completed order's order_item, whether just inserted above or
-- already present from an earlier run/the live RPC) that doesn't already
-- have a commission snapshot.
-- ============================================================

WITH candidate AS (
  SELECT
    cp.id AS purchase_id,
    cp.customer_id,
    cp.sale_price AS sale_amount,
    cp.salesperson,
    cp.salesperson_id
  FROM customer_purchases cp
  JOIN order_items oi ON oi.id = cp.order_item_id
  JOIN orders o ON o.id = oi.order_id
  WHERE o.order_status = 'Completed'
    AND NOT EXISTS (
      SELECT 1 FROM sales_commissions sc WHERE sc.purchase_id = cp.id
    )
),
matched AS (
  SELECT
    c.*,
    (
      SELECT cr.commission_percent
      FROM commission_rules cr
      WHERE cr.is_active = true
        AND c.sale_amount >= cr.minimum_amount
        AND (cr.maximum_amount IS NULL OR c.sale_amount <= cr.maximum_amount)
      ORDER BY cr.minimum_amount DESC
      LIMIT 1
    ) AS commission_percent
  FROM candidate c
)
INSERT INTO sales_commissions (
  id, purchase_id, customer_id, salesperson, salesperson_id,
  sale_amount, commission_percent, commission_amount, status
)
SELECT
  gen_random_uuid(),
  purchase_id,
  customer_id,
  salesperson,
  salesperson_id,
  sale_amount,
  commission_percent,
  (sale_amount * commission_percent) / 100,
  'Pending'
FROM matched
WHERE commission_percent IS NOT NULL
ON CONFLICT (purchase_id) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- 1. Every Completed order_item now has exactly one customer_purchases row
--    (expect 0 rows back - a mismatch would return the offending order_item).
-- SELECT oi.id AS order_item_id, o.order_status
-- FROM order_items oi
-- JOIN orders o ON o.id = oi.order_id
-- WHERE o.order_status = 'Completed'
--   AND NOT EXISTS (
--     SELECT 1 FROM customer_purchases cp WHERE cp.order_item_id = oi.id
--   );
--
-- 2. No duplicate customer_purchases per order_item (expect 0 rows).
-- SELECT order_item_id, count(*)
-- FROM customer_purchases
-- WHERE order_item_id IS NOT NULL
-- GROUP BY order_item_id
-- HAVING count(*) > 1;
--
-- 3. No duplicate sales_commissions per purchase (expect 0 rows - also
--    structurally impossible given the UNIQUE(purchase_id) constraint).
-- SELECT purchase_id, count(*)
-- FROM sales_commissions
-- GROUP BY purchase_id
-- HAVING count(*) > 1;
--
-- 4. Backfilled purchases with no commission snapshot - only expected if a
--    line's sale amount matches no active commission_rules bracket.
-- SELECT cp.id, cp.order_item_id, cp.sale_price
-- FROM customer_purchases cp
-- JOIN order_items oi ON oi.id = cp.order_item_id
-- JOIN orders o ON o.id = oi.order_id
-- WHERE o.order_status = 'Completed'
--   AND NOT EXISTS (
--     SELECT 1 FROM sales_commissions sc WHERE sc.purchase_id = cp.id
--   );
--
-- 5. Draft/Reserved/Lost orders contributed nothing (expect 0 rows).
-- SELECT cp.id
-- FROM customer_purchases cp
-- JOIN order_items oi ON oi.id = cp.order_item_id
-- JOIN orders o ON o.id = oi.order_id
-- WHERE o.order_status != 'Completed';
--
-- 6. Spot-check field preservation against source orders/order_items
--    (expect sale_price = line_total, sale_date = order_date,
--    salesperson = sales_owner, source IS NULL for every row).
-- SELECT cp.id, cp.sale_price, oi.line_total, cp.sale_date, o.order_date,
--        cp.salesperson, o.sales_owner, cp.source
-- FROM customer_purchases cp
-- JOIN order_items oi ON oi.id = cp.order_item_id
-- JOIN orders o ON o.id = oi.order_id
-- WHERE o.order_status = 'Completed'
-- ORDER BY cp.sale_date DESC
-- LIMIT 20;
--
-- 7. Row counts, for a before/after sanity check.
-- SELECT
--   (SELECT count(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id
--     WHERE o.order_status = 'Completed') AS completed_order_items,
--   (SELECT count(*) FROM customer_purchases WHERE order_item_id IS NOT NULL) AS linked_purchases,
--   (SELECT count(*) FROM sales_commissions sc
--     WHERE EXISTS (SELECT 1 FROM customer_purchases cp WHERE cp.id = sc.purchase_id
--       AND cp.order_item_id IS NOT NULL)) AS linked_commissions;
