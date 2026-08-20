-- D12 Order Cancellation (Product Owner Authorization, 2026-08-19).
-- Adds 'Cancelled' as a new, terminal order_status value. Existing values
-- (Draft/Reserved/Completed/Lost) and their own transition rules are
-- unchanged - this only widens the CHECK constraint's allowed set.
-- Application-layer transition rules (lib/orders/order.rules.ts) restrict
-- the reachable path to Completed -> Cancelled only (LOCKED Decision C);
-- the DB constraint itself stays a plain membership check, same as before,
-- consistent with orders_payment_status_check's own style.

BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN ('Draft', 'Reserved', 'Completed', 'Lost', 'Cancelled'));

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'orders'::regclass AND conname = 'orders_order_status_check';
-- Expect: CHECK (order_status = ANY (ARRAY['Draft','Reserved','Completed','Lost','Cancelled']))
