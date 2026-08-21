-- Product Status Standardization / D12 compatibility (BR-003, LOCKED,
-- 2026-08-21; Active->Available already resolved separately).
--
-- Updates cancel_order_with_disposition() (created 2026081904, extended
-- 2026082007) so its product-status writes conform to the four-value
-- Product Status model (Available/Reserved/Sold/Archived). This migration
-- does NOT modify either prior migration file - it is a new CREATE OR
-- REPLACE on top, per this codebase's established pattern (each status/
-- business-rule change to this RPC has always landed as its own
-- migration, never a rewrite of an already-committed one).
--
-- Exactly two status literals change, nothing else:
--   - Returned disposition:  status = 'Returned' -> status = 'Archived'
--     (BR-003: "Returned" is retired; a returned product now lands on
--     "Archived", the same value any other archival reason would use.
--     returned_at is unchanged - still written in the same statement,
--     still the sole source of truth for the supplier-return fact; no
--     reader may infer it from status = 'Archived' alone).
--   - Remaining disposition: status = 'Active'   -> status = 'Available'
--     (the separately-resolved Active->Available rename).
--
-- Everything else is preserved byte-for-byte from 2026082007: function
-- signature, per-item ProductDisposition mechanism (order_items lookup,
-- the Sold-guard on each UPDATE, the 0-row-affected RAISE EXCEPTION),
-- the whole-transaction behavior (implicit BEGIN/COMMIT via the plpgsql
-- function body plus this file's own explicit BEGIN/COMMIT), the
-- SECURITY INVOKER / GRANT authorization, and the Compensation/Commission
-- Void block (UPDATE compensations / UPDATE sales_commissions) - none of
-- that is status-vocabulary-dependent and none of it changes here.

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
      UPDATE products SET status = 'Archived', returned_at = now()
      WHERE id = v_product_id AND status = 'Sold';
    ELSIF v_disposition = 'Remaining' THEN
      UPDATE products SET status = 'Available'
      WHERE id = v_product_id AND status = 'Sold';
    ELSE
      RAISE EXCEPTION 'Invalid disposition % for order_item %', v_disposition, v_order_item_id;
    END IF;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'Product % (order_item %) is not Sold - cannot apply disposition %', v_product_id, v_order_item_id, v_disposition;
    END IF;
  END LOOP;

  -- Compensation/Commission Void (Product Owner Authorization, 2026-08-20)
  -- - unchanged, not status-vocabulary-dependent.
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
--   -> confirm the body now writes 'Archived'/'Available', never 'Returned'/'Active'.
-- Manual end-to-end check (Dev only, disposable order):
--   1. Complete a Draft/Reserved order with >=1 item (product status becomes Sold, via Available start).
--   2. SELECT cancel_order_with_disposition('<order_id>', '[{"order_item_id":"<id>","disposition":"Returned"}]'::jsonb);
--   3. Confirm: orders.order_status = 'Cancelled', the product's status = 'Archived' and returned_at is set.
--   4. Repeat with disposition 'Remaining' on a second item - confirm status = 'Available', returned_at stays NULL.
