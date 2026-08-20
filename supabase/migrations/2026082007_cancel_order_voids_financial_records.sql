-- Compensation/Commission Void (Product Owner Authorization, 2026-08-20).
--
-- Extends cancel_order_with_disposition (2026081904) to also Void, in the
-- SAME transaction as the order/product update, every Compensation and
-- Commission tied to this order that hasn't reached its own "money
-- committed" point yet:
--   - compensations: Draft/Pending/Confirmed -> Cancelled (reuses the
--     status value that already exists for this exact meaning - LOCKED
--     Decision 1, no new Compensation status invented). Handed Off is left
--     untouched (out of scope this phase - Financial Reversal phase).
--   - sales_commissions: Pending/Approved -> Void (new status, see
--     2026082001). Paid is left untouched (same reason).
--
-- Precedent for bundling business-adjacent tables into an Order-transition
-- RPC: complete_order_with_snapshots already does exactly this for
-- customer_purchases + sales_commissions (its own creation side). This is
-- the same pattern applied to the reverse (cancellation) direction, so
-- "Order = Cancelled but a Compensation/Commission is still payable" can
-- never be observed (Product Owner Authorization §4, LOCKED) - if either
-- UPDATE below somehow failed, the whole function's implicit transaction
-- (including the orders/products writes above it) rolls back.
--
-- sales_commissions.purchase_id carries no real FK (deliberate design,
-- 20260721_sales_commission_module.sql's own header) - the subquery below
-- still works correctly (FK absence only means the relationship isn't
-- referentially enforced, not that it can't be queried).
--
-- Every business decision (which statuses are "unpaid enough" to void) is
-- fixed, deterministic per-row logic requiring no caller input - unlike
-- disposition (which genuinely needs a human choice per product), so it's
-- safe as a plain WHERE-guarded UPDATE here, same philosophy as the
-- existing products UPDATE two statements above it.

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

  -- Compensation/Commission Void (Product Owner Authorization, 2026-08-20).
  UPDATE compensations
  SET status = 'Cancelled', cancelled_at = now()
  WHERE order_id = p_order_id AND status IN ('Draft', 'Pending', 'Confirmed');

  UPDATE sales_commissions
  SET status = 'Void'
  WHERE purchase_id IN (
    SELECT cp.id
    FROM customer_purchases cp
    JOIN order_items oi ON oi.id = cp.order_item_id
    WHERE oi.order_id = p_order_id
  ) AND status IN ('Pending', 'Approved');

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_order_with_disposition(uuid, jsonb) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'cancel_order_with_disposition';
-- SELECT pg_get_functiondef('cancel_order_with_disposition(uuid, jsonb)'::regprocedure);
--   -> confirm the body now contains the compensations/sales_commissions UPDATEs.
-- Manual end-to-end check (Dev only, disposable order with a Draft/Pending
-- Compensation and a Pending sales_commissions row):
--   1. SELECT cancel_order_with_disposition(...) as before.
--   2. Confirm: compensations.status = 'Cancelled', cancelled_at set;
--      sales_commissions.status = 'Void'; both rows still exist, all other
--      columns (calculated_amount, commission_amount, method, etc.) unchanged.
