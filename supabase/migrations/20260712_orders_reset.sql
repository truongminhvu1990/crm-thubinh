-- Orders Module — Development Reset (Sprint 1, Phase 4, "Orders Reset").
-- Approved via docs/ORDERS_RESET_PLAN.md.
--
-- Supersedes 20260712_orders_module.sql, whose `CREATE TABLE IF NOT EXISTS
-- orders` silently no-op'd against a pre-existing, unrelated legacy
-- `orders` table (order_code/employee_id/payment_method/status/notes —
-- see docs/ORDERS_MIGRATION_PLAN.md). That legacy table was confirmed
-- empty (0 rows) and ruled to have no migration value by the Product
-- Owner. `order_items`'s schema was never confirmed against the locked
-- design either, so it is reset along with the other three rather than
-- left unverified.
--
-- This migration drops and recreates exactly four tables — orders,
-- order_items, payments, order_events — per docs/ORDERS_DATABASE.md
-- (locked). Development only. Does not touch customers, products,
-- product_batches, master_data, or any other existing table (Customer,
-- Product, Batch, and Settings modules are all out of scope and
-- untouched by this file).
--
-- Wrapped in a single transaction (per ORDERS_RESET_PLAN.md §5 Rollback
-- Strategy) so a failure partway through leaves the database exactly as
-- it was, instead of a half-dropped, half-created state.

BEGIN;

-- ============================================================
-- 1. DROP — children before parent (order_events/payments/
--    order_items all reference orders.id), guarded with
--    IF EXISTS so this file is safe to re-run from the top.
-- ============================================================

DROP TABLE IF EXISTS order_events;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;

-- ============================================================
-- 2. CREATE — parent before children, exactly per
--    docs/ORDERS_DATABASE.md §4 (Fields), §6 (Primary Keys),
--    §7 (Foreign Keys), §8 (Business Constraints). Sales Owner /
--    Created By / Lost Reason / Payment method / Packaging Option
--    are plain text master-data references, not DB foreign keys —
--    same pattern already used by products.source/salesperson
--    (DB §7); enforced at the application layer, not here.
-- ============================================================

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sales_owner text NOT NULL,
  created_by text NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  lost_reason text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  order_status text NOT NULL DEFAULT 'Draft'
    CHECK (order_status IN ('Draft', 'Reserved', 'Completed', 'Lost')),
  payment_status text NOT NULL DEFAULT 'Unpaid'
    CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  snapshot_sale_price numeric NOT NULL,
  discount numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total numeric NOT NULL DEFAULT 0,
  is_gift boolean NOT NULL DEFAULT false,
  gift_recipient_name text,
  gift_note text,
  packaging_option text
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_detail text NOT NULL,
  actor text NOT NULL,
  event_timestamp timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. INDEXES — per docs/ORDERS_DATABASE.md §9 (Business Index
--    Strategy). One index per named access pattern only.
-- ============================================================

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status_payment_status ON orders(order_status, payment_status);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_orders_sales_owner ON orders(sales_owner);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);

CREATE INDEX idx_order_events_order_id_timestamp ON order_events(order_id, event_timestamp);

-- ============================================================
-- 4. ROW LEVEL SECURITY — new tables default to RLS-enabled-
--    with-no-policy, which silently blocks the anon key the app
--    uses. Same fix already applied to every other table in this
--    project (customer_purchases, product_batches, ...).
-- ============================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. "Allow full access" POLICIES — same unrestricted pattern
--    already used by every other table in this project. No
--    DROP POLICY IF EXISTS needed here (unlike the superseded
--    migration): these tables were just freshly created in this
--    same transaction, so no pre-existing policy can remain.
-- ============================================================

CREATE POLICY "Allow full access" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON order_events FOR ALL USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after the transaction
-- above has been executed and approved. Not part of the
-- transaction itself; these are checks, not schema changes.
-- ============================================================

-- 1. Verify tables exist (expect exactly 4 rows).
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY table_name;

-- 2. Verify columns (expect: orders=15, order_items=11, payments=7,
--    order_events=6 rows — cross-check names/types against
--    docs/ORDERS_DATABASE.md §4).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY table_name, ordinal_position;

-- 3. Verify indexes (expect each table's primary key index, orders'
--    order_number unique index, plus the 9 named indexes from DB §9:
--    idx_orders_customer_id, idx_orders_status_payment_status,
--    idx_orders_order_date, idx_orders_sales_owner,
--    idx_order_items_order_id, idx_order_items_product_id,
--    idx_payments_order_id, idx_payments_payment_date,
--    idx_order_events_order_id_timestamp).
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY tablename, indexname;

-- 4a. Verify RLS is enabled (expect rls_enabled = true for all 4 rows).
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY relname;

-- 4b. Verify the "Allow full access" policy exists on all 4 tables
--     (expect exactly 4 rows, one per table, cmd = 'ALL').
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY tablename;
