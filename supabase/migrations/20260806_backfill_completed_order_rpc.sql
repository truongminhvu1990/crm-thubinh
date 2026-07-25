BEGIN;

CREATE OR REPLACE FUNCTION backfill_completed_order(
  p_order_id uuid,
  p_purchase_rows jsonb,
  p_commission_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order_status text;
  v_purchase_rows_count integer;
  v_purchases_created integer := 0;
  v_commissions_created integer := 0;
BEGIN
  SELECT order_status INTO v_order_status
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'backfill_completed_order: order % not found', p_order_id;
  END IF;

  IF v_order_status <> 'Completed' THEN
    RAISE EXCEPTION 'backfill_completed_order: order % is % — only an already-Completed order can be backfilled; Draft/Reserved/Lost are never modified by this function', p_order_id, v_order_status;
  END IF;

  v_purchase_rows_count := jsonb_array_length(p_purchase_rows);

  WITH inserted_purchases AS (
    INSERT INTO customer_purchases (
      id, customer_id, product_id, sale_price, sale_date, source,
      salesperson, salesperson_id, order_item_id
    )
    SELECT
      (row->>'id')::uuid,
      (row->>'customer_id')::uuid,
      (row->>'product_id')::uuid,
      (row->>'sale_price')::numeric,
      (row->>'sale_date')::date,
      row->>'source',
      row->>'salesperson',
      NULLIF(row->>'salesperson_id', '')::uuid,
      (row->>'order_item_id')::uuid
    FROM jsonb_array_elements(p_purchase_rows) AS row
    WHERE EXISTS (
      SELECT 1 FROM order_items oi
      WHERE oi.id = (row->>'order_item_id')::uuid AND oi.order_id = p_order_id
    )
    ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_purchases_created FROM inserted_purchases;

  WITH commission_input AS (
    SELECT
      (row->>'id')::uuid AS id,
      (row->>'order_item_id')::uuid AS order_item_id,
      (row->>'customer_id')::uuid AS customer_id,
      row->>'salesperson' AS salesperson,
      NULLIF(row->>'salesperson_id', '')::uuid AS salesperson_id,
      (row->>'sale_amount')::numeric AS sale_amount,
      (row->>'commission_percent')::numeric AS commission_percent,
      (row->>'commission_amount')::numeric AS commission_amount,
      COALESCE(row->>'status', 'Pending') AS status
    FROM jsonb_array_elements(p_commission_rows) AS row
  ),
  resolved AS (
    SELECT
      ci.id, cp.id AS purchase_id, ci.customer_id, ci.salesperson, ci.salesperson_id,
      ci.sale_amount, ci.commission_percent, ci.commission_amount, ci.status
    FROM commission_input ci
    JOIN order_items oi ON oi.id = ci.order_item_id AND oi.order_id = p_order_id
    JOIN customer_purchases cp ON cp.order_item_id = ci.order_item_id
  ),
  inserted_commissions AS (
    INSERT INTO sales_commissions (
      id, purchase_id, customer_id, salesperson, salesperson_id,
      sale_amount, commission_percent, commission_amount, status
    )
    SELECT id, purchase_id, customer_id, salesperson, salesperson_id,
           sale_amount, commission_percent, commission_amount, status
    FROM resolved
    ON CONFLICT (purchase_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_commissions_created FROM inserted_commissions;

  RETURN jsonb_build_object(
    'purchases_created', v_purchases_created,
    'commissions_created', v_commissions_created,
    'skipped', v_purchase_rows_count - v_purchases_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_completed_order(uuid, jsonb, jsonb) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'backfill_completed_order';
-- SELECT backfill_completed_order(
--   '00000000-0000-0000-0000-000000000000'::uuid,
--   '[]'::jsonb,
--   '[]'::jsonb
-- ); -- expect a RAISE EXCEPTION ("order ... not found")