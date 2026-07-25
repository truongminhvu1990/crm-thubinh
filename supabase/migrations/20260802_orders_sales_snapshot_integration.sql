-- Orders -> Sales Snapshot Integration.
--
-- Adds the write path Orders was missing: completing an order now creates
-- one customer_purchases row per order_item (Rule 2) plus its commission
-- snapshot, atomically with the order's own status transition. Reports/
-- Dashboard/Sales Ledger/Commission/Marketing/Batch Report are all
-- unmodified by this migration - customer_purchases stays their single
-- source of truth (Architecture Investigation, Option A); it just gains a
-- second writer.
--
-- order_item_id: nullable, so every existing (manually-entered) purchase
-- row is untouched - they simply have order_item_id = NULL. The partial
-- unique index below is the idempotency key (duplicate protection): an
-- order_item can never produce more than one customer_purchases row, no
-- matter how many times completion is retried.
--
-- FK note: order_items on a Completed order are permanently locked
-- (canEditOrderItems() in lib/orders/order.rules.ts only allows edits
-- while Draft/Reserved, and Completed is a terminal status with no
-- reverse transition - see ALLOWED_ORDER_STATUS_TRANSITIONS), so unlike
-- sales_commissions.purchase_id (deliberately FK-less, see
-- 20260721_sales_commission_module.sql's header), a real FK here is safe:
-- the order_item row it points to can never be edited or deleted out
-- from under it in any currently reachable code path.

BEGIN;

ALTER TABLE customer_purchases
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES order_items(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_purchases_order_item_id_unique
  ON customer_purchases(order_item_id)
  WHERE order_item_id IS NOT NULL;

-- ============================================================
-- complete_order_with_snapshots - the one atomic write for Order
-- Completion (Product Owner decision: an RPC-level transaction, not
-- application-level orchestration+rollback - see Architecture
-- Investigation Revisions 3/4).
--
-- Pure data plumbing only - no business calculation of any kind. Every
-- business decision (which commission rule matches, what the amount is)
-- is made in TypeScript beforehand (lib/orders/order.service.ts,
-- reusing the existing getActiveCommissionRules/findMatchingRule/
-- calculateCommissionAmount functions unchanged) and handed in as
-- already-computed rows. This function never recomputes a commission -
-- it only writes what it is given, atomically with the order's status
-- transition. If any step fails, the whole function's implicit
-- transaction rolls back: no partial write of orders/customer_purchases/
-- sales_commissions can ever be observed.
--
-- p_order_id: locked and validated first via the same Draft/Reserved-only
-- guard the old repository.completeOrder() UPDATE...WHERE used - RAISE
-- EXCEPTION on anything else aborts the whole transaction before any
-- customer_purchases/sales_commissions row is written, so a retry against
-- an already-Completed order is a clean no-op error, never a partial
-- write.
--
-- p_purchase_rows / p_commission_rows: jsonb arrays built by the caller,
-- one element per order_item. Purchase row ids are generated client-side
-- (crypto.randomUUID() in order.service.ts) specifically so each
-- matching commission row's purchase_id can be set directly in the same
-- payload, with no INSERT...RETURNING correlation step needed inside
-- this function.
--
-- SECURITY INVOKER (not DEFINER): matches every other function in this
-- schema (reports_bi_functions.sql, sales_ledger view). orders/
-- customer_purchases/sales_commissions all carry the same unrestricted
-- "Allow full access" RLS policy for anon+authenticated, so INVOKER has
-- identical effective access to calling these tables directly - no
-- privilege escalation introduced.

CREATE OR REPLACE FUNCTION complete_order_with_snapshots(
  p_order_id uuid,
  p_purchase_rows jsonb,
  p_commission_rows jsonb
)
RETURNS orders
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order orders;
BEGIN
  UPDATE orders
  SET order_status = 'Completed'
  WHERE id = p_order_id
    AND order_status IN ('Draft', 'Reserved')
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % is not in a completable state (must be Draft or Reserved)', p_order_id;
  END IF;

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
  ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

  INSERT INTO sales_commissions (
    id, purchase_id, customer_id, salesperson, salesperson_id,
    sale_amount, commission_percent, commission_amount, status
  )
  SELECT
    (row->>'id')::uuid,
    (row->>'purchase_id')::uuid,
    (row->>'customer_id')::uuid,
    row->>'salesperson',
    NULLIF(row->>'salesperson_id', '')::uuid,
    (row->>'sale_amount')::numeric,
    (row->>'commission_percent')::numeric,
    (row->>'commission_amount')::numeric,
    COALESCE(row->>'status', 'Pending')
  FROM jsonb_array_elements(p_commission_rows) AS row;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_order_with_snapshots(uuid, jsonb, jsonb) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'customer_purchases' AND column_name = 'order_item_id';
-- SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'customer_purchases' AND indexname = 'idx_customer_purchases_order_item_id_unique';
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'complete_order_with_snapshots';
-- Cross-check after a real completion:
-- SELECT * FROM customer_purchases WHERE order_item_id IS NOT NULL ORDER BY created_at DESC LIMIT 10;
-- SELECT * FROM sales_commissions ORDER BY created_at DESC LIMIT 10;
