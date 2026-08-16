-- Admin Order Deletion — safe transactional reconciliation (Product Owner
-- Full Order Control decision, 2026-08-14, "Do not simply remove the
-- error... implement a safe Admin deletion/reconciliation workflow").
--
-- Scope: ONE new function. No existing table, column, FK, RLS policy, or
-- CHECK constraint is modified or weakened anywhere — the FK that blocked
-- the previous, naive delete attempt
-- (customer_purchases.order_item_id -> order_items.id, no ON DELETE
-- clause, effectively RESTRICT) is untouched. This function succeeds by
-- deleting the projection rows that FK protects, in the correct order,
-- inside its own transaction, BEFORE the parent order_items row it
-- references is ever cascade-deleted — never by relaxing the constraint.
--
-- Pure data plumbing only, mirroring complete_order_with_snapshots'
-- established pattern (supabase/migrations/2026080201_orders_sales_snapshot_
-- integration.sql): every business decision (is this deletion even
-- allowed) is made in TypeScript BEFORE this function is ever called
-- (order.service.ts's deleteOrder, admin path) — this function never
-- decides whether to proceed, only how, once the caller has already
-- confirmed it's safe. Specifically, the caller has already verified,
-- before calling this function:
--   - no compensations for this order have status 'Confirmed' or
--     'Handed Off' (LOCKED Traceability principle,
--     docs/13_COMPENSATION_SPEC.md-adjacent module comment: "a Confirmed/
--     Handed Off record is never deleted") — only Draft/Pending/Cancelled
--     compensations can still exist by the time this function runs, none
--     of which represent a completed financial commitment;
--   - no sales_commissions row for this order's purchases has status
--     'Paid' (the same class of protection this task's own Product Owner
--     review applied to Compensation, extended here by this
--     implementation to Commission's own paid-out records, since deleting
--     a Paid commission would erase evidence that real money already left
--     the business — flagged explicitly in the delivery report as an
--     interpretation, not literal instruction).
-- Because Handed Off is a hard prerequisite for a Compensation ever
-- entering a settlement_items row (docs/14_SETTLEMENT_SPEC.md Decision 2:
-- "Settlement creation may only select Compensation already in 'Handed
-- Off' status — never 'Confirmed'"), refusing every Handed-Off compensation
-- upstream also transitively refuses every settlement-bound and
-- ledger-recorded one — this function is therefore never reached for an
-- order whose compensation has gone anywhere near a Settlement or
-- compensation_ledger_entries, and touches neither table.
--
-- Deletes, in dependency order, everything the (already-approved) request
-- makes attributable to this order:
--   1. sales_commissions rows for this order's customer_purchases (the one
--      explicit, narrow exception to Commission's own LOCKED
--      "records are never deleted" rule the Product Owner approved for
--      this flow specifically — docs/06_COMMISSION_SPEC.md's rule is
--      otherwise unchanged for every other path).
--   2. customer_purchases rows this order's own completion wrote (no LOCKED
--      anti-delete rule protects this table; Orders is already this
--      table's writer via complete_order_with_snapshots, so a reversal by
--      the same module is consistent with the existing architecture, not
--      a new violation of Reporting's read-only principle).
--   3. compensations for this order (only Draft/Pending/Cancelled can
--      still exist here, per the caller's pre-check above).
--   4. Each line item's Product, reverted Reserved/Sold -> Active (a
--      Completed order's items are Sold, not Reserved, so the existing
--      releaseProduct() Reserved-only guard would silently no-op for
--      them — this function explicitly reverts both).
--   5. The order itself — order_items/payments/order_events all cascade
--      cleanly via their existing, unmodified ON DELETE CASCADE FKs
--      (supabase/migrations/2026071605_orders_database_foundation.sql).
--
-- SECURITY INVOKER (not DEFINER): matches complete_order_with_snapshots —
-- every table this function touches already carries the same unrestricted
-- "Allow full access" RLS policy for anon+authenticated, so INVOKER has
-- identical effective access to calling these tables directly. No
-- privilege escalation introduced; RLS architecture unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION delete_order_with_reconciliation(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_item_ids uuid[];
  v_product_ids uuid[];
  v_purchase_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), COALESCE(array_agg(product_id), ARRAY[]::uuid[])
  INTO v_item_ids, v_product_ids
  FROM order_items
  WHERE order_id = p_order_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_purchase_ids
  FROM customer_purchases
  WHERE order_item_id = ANY(v_item_ids);

  IF array_length(v_purchase_ids, 1) > 0 THEN
    DELETE FROM sales_commissions WHERE purchase_id = ANY(v_purchase_ids);
    DELETE FROM customer_purchases WHERE id = ANY(v_purchase_ids);
  END IF;

  DELETE FROM compensations WHERE order_id = p_order_id;

  IF array_length(v_product_ids, 1) > 0 THEN
    UPDATE products
    SET status = 'Active'
    WHERE id = ANY(v_product_ids) AND status IN ('Reserved', 'Sold');
  END IF;

  DELETE FROM orders WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_order_with_reconciliation(uuid) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'delete_order_with_reconciliation';
-- Manual end-to-end check (Dev/Test only, disposable order only):
--   1. Note a Completed+Paid order's id, its order_items' product_ids, its
--      customer_purchases ids, its sales_commissions ids.
--   2. SELECT delete_order_with_reconciliation('<id>');
--   3. Confirm: orders/order_items/payments/order_events/customer_purchases/
--      sales_commissions/compensations all have zero rows for that id; the
--      products are back to 'Active'.
