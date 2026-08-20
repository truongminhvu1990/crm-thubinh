-- D12 Order Cancellation (Product Owner Authorization, 2026-08-19).
--
-- cancel_order_with_disposition - the one atomic write for Order
-- Cancellation, mirroring complete_order_with_snapshots' established
-- pattern (2026080201_orders_sales_snapshot_integration.sql): pure data
-- plumbing, no business calculation. Every business decision (is this
-- order cancellable, does every order_item have a disposition, which
-- disposition each item got) is made in TypeScript beforehand
-- (lib/orders/order.service.ts's cancelOrder) and handed in already-
-- validated. This function only writes what it is given, atomically with
-- the order's own status transition - if any step fails, the whole
-- function's implicit transaction rolls back (Product Owner Decision,
-- mục 2/4: "không được nửa vời").
--
-- p_dispositions: jsonb array of {order_item_id, disposition}, one element
-- per order_item TypeScript has already resolved to cover (order.service.ts
-- validates full, exact coverage of the order's own order_items before
-- calling this - this function does not re-derive or trust that coverage,
-- it only processes exactly what it's given).
--
-- Per-item guard: `AND status = 'Sold'`, same WHERE-guarded-update
-- philosophy as reserveProduct/releaseProduct/markProductSold
-- (lib/orders/order.repository.ts). A Completed order's items are always
-- Sold in the normal flow (Reserved -> Sold happens exactly at
-- Completion); if any item's product is unexpectedly NOT Sold (a data-
-- integrity edge case, not a normal path), this guard makes that specific
-- UPDATE affect 0 rows, which RAISEs and rolls back the WHOLE cancellation
-- rather than silently applying a disposition to a product in the wrong
-- state (Product Owner Decision, mục 7/15 Case 7 - "không tự giả định").
--
-- Never touches order_items, customer_purchases, sales_commissions, or
-- compensations - Cancellation is a state transition, not a delete
-- (Product Owner Decision D/mục 7, LOCKED).
--
-- SECURITY INVOKER (not DEFINER): matches complete_order_with_snapshots /
-- delete_order_with_reconciliation - orders/products already carry the
-- same unrestricted "Allow full access" RLS policy for anon+authenticated,
-- so INVOKER has identical effective access to calling these tables
-- directly. No privilege escalation introduced.

BEGIN;

CREATE OR REPLACE FUNCTION cancel_order_with_disposition(
  p_order_id uuid,
  p_dispositions jsonb
)
RETURNS orders
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order orders;
  v_item jsonb;
  v_order_item_id uuid;
  v_disposition text;
  v_product_id uuid;
  v_updated_count int;
BEGIN
  UPDATE orders
  SET order_status = 'Cancelled'
  WHERE id = p_order_id
    AND order_status = 'Completed'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % is not Completed (already Cancelled, or not in a cancellable state)', p_order_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_dispositions)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::uuid;
    v_disposition := v_item->>'disposition';

    SELECT product_id INTO v_product_id
    FROM order_items
    WHERE id = v_order_item_id AND order_id = p_order_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'order_item % does not belong to order %', v_order_item_id, p_order_id;
    END IF;

    IF v_disposition = 'Returned' THEN
      UPDATE products SET status = 'Returned', returned_at = now()
      WHERE id = v_product_id AND status = 'Sold';
    ELSIF v_disposition = 'Remaining' THEN
      UPDATE products SET status = 'Active'
      WHERE id = v_product_id AND status = 'Sold';
    ELSE
      RAISE EXCEPTION 'Invalid disposition % for order_item %', v_disposition, v_order_item_id;
    END IF;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'Product % (order_item %) is not Sold - cannot apply disposition %', v_product_id, v_order_item_id, v_disposition;
    END IF;
  END LOOP;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_order_with_disposition(uuid, jsonb) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'cancel_order_with_disposition';
-- Manual end-to-end check (Dev only, disposable order):
--   1. Complete a Draft/Reserved order with >=1 item.
--   2. SELECT cancel_order_with_disposition('<order_id>', '[{"order_item_id":"<id>","disposition":"Returned"}]'::jsonb);
--   3. Confirm: orders.order_status = 'Cancelled', the product's status = 'Returned' and returned_at is set,
--      order_items/customer_purchases/sales_commissions/compensations all unchanged (still present).
