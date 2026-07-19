-- CRM Baseline V1
-- Package 5
-- Tables: orders, order_items, payments, order_events
--
-- Source of Truth used: docs/ORDERS_DATABASE.md §2-§9 (Tables, Fields,
-- Relationships, Primary Keys, Foreign Keys, Business Constraints,
-- Business Index Strategy), which is itself explicitly based on
-- docs/ORDERS_SPEC.md Revision 5 ("approved and locked" per that
-- document's own header) and re-verified in docs/ORDERS_DATABASE_FOUNDATION.md
-- as matching column-for-column, index-for-index. This file transcribes
-- that already-approved design exactly - no redesign, no inferred column,
-- constraint, or index beyond what those documents already define.
--
-- IMPORTANT - flagged, not silently resolved:
-- 1) docs/CRM_DATABASE_SPECIFICATION.md, as it exists on disk right now,
--    has no "V2"/"LOCKED" marker anywhere and still lists all 4 Orders
--    tables under "NOT YET APPROVED Tables" with no schema asserted.
--    This task's instruction to use it as an Orders-schema source does
--    not match its current content. Per this same task's explicit
--    instruction not to modify that document, it has NOT been changed
--    here - see the chat response accompanying this file for the full
--    flag.
-- 2) A separately-approved migration already exists for this exact scope:
--    supabase/migrations/20260716_orders_database_foundation.sql
--    (its own header: "Approved via docs/ORDERS_DATABASE_FOUNDATION.md").
--    This file is functionally equivalent to that one (same tables, same
--    columns, same constraints, same indexes, same RLS/policies), but is
--    NOT a drop-in duplicate: this file uses `CREATE TABLE IF NOT EXISTS`
--    (matching the CRM Baseline V1 Package 1-4 convention used throughout
--    this sprint) rather than that file's `DROP TABLE IF EXISTS` +
--    row-count safety-check approach. Only ONE of these two files should
--    ever be executed against Development - running both is redundant,
--    and running this one after the other already created the tables
--    would simply no-op (IF NOT EXISTS), while running the other one
--    second would DROP what this one created. Do not run both.
--
-- Per docs/ORDERS_DATABASE.md §7: Sales Owner, Created By, Lost Reason,
-- Payment Method, Packaging Option, and Order Event Actor are deliberately
-- plain text values validated against `master_data` at the application
-- layer, not database foreign keys - matching the existing
-- `products.source`/`salesperson` pattern. Not a gap in this file.
--
-- Per docs/ORDERS_DATABASE.md §8: several business rules (conditional
-- Lost Reason requirement, "at most one open Order Item per Product",
-- order-status-transition rules, post-Completion snapshot immutability,
-- append-only order_events) are explicitly named as needing an
-- application-layer or concurrency-safe mechanism beyond plain DDL, and
-- are out of scope for a schema-foundation migration - not implemented
-- here, matching that document's own scoping.
--
-- No trigger is defined here for any of the 4 tables: docs/ORDERS_DATABASE.md
-- names `updated_at` on `orders` as "Native, Required (system-set)" but
-- specifies no trigger mechanism, and the separately-approved
-- 20260716_orders_database_foundation.sql likewise defines no trigger for
-- any Orders table (unlike customers/products/product_batches). Adding
-- one here would be inventing a mechanism beyond what's approved.
--
-- Dependency: `orders.customer_id REFERENCES customers(id)` and
-- `order_items.product_id REFERENCES products(id)` require Package 1
-- (`customers`, `products`) to already exist - confirmed PASS per this
-- task's Current Status.
--
-- Out of scope, deliberately: Inventory, Reports (per docs/ORDERS_DATABASE.md
-- §1 and §11, Reports/Dashboard never store data - no table for either
-- exists in this design at all).
--
-- Per task instruction: migration file only, not executed by this task.
-- No seed data.

BEGIN;

-- ============================================================
-- 1. CREATE TABLES — parent before children, exactly per
--    docs/ORDERS_DATABASE.md §4, §6, §7, §8.
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
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

CREATE TABLE IF NOT EXISTS order_items (
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

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_detail text NOT NULL,
  actor text NOT NULL,
  event_timestamp timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. INDEXES — the 9 named indexes from docs/ORDERS_DATABASE.md §9,
--    exactly. No additional index inferred.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_payment_status ON orders(order_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_sales_owner ON orders(sales_owner);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id_timestamp ON order_events(order_id, event_timestamp);

-- ============================================================
-- 3. ROW LEVEL SECURITY + POLICIES — same unrestricted pattern already
--    used by every other table in this project.
-- ============================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON orders;
CREATE POLICY "Allow full access" ON orders FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON order_items;
CREATE POLICY "Allow full access" ON order_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON payments;
CREATE POLICY "Allow full access" ON payments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON order_events;
CREATE POLICY "Allow full access" ON order_events FOR ALL USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after the transaction above has
-- been executed and approved. Not part of the transaction itself.
-- ============================================================

-- 1. Verify all 4 tables exist (expect exactly 4 rows).
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY table_name;

-- 2. Verify columns (expect: orders = 15, order_items = 11, payments = 7,
--    order_events = 6 rows).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY table_name, ordinal_position;

-- 3. Verify primary keys (expect one PRIMARY KEY row per table, on `id`).
SELECT tc.table_name, kcu.column_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('orders', 'order_items', 'payments', 'order_events')
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name;

-- 4. Verify foreign keys (expect: orders.customer_id -> customers,
--    order_items.order_id -> orders, order_items.product_id -> products,
--    payments.order_id -> orders, order_events.order_id -> orders).
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('orders', 'order_items', 'payments', 'order_events')
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- 5. Verify the order_number UNIQUE constraint and the order_status /
--    payment_status / quantity / amount CHECK constraints.
SELECT tc.table_name, tc.constraint_name, tc.constraint_type, cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('orders', 'order_items', 'payments', 'order_events')
  AND tc.constraint_type IN ('UNIQUE', 'CHECK')
ORDER BY tc.table_name, tc.constraint_type;

-- 6. Verify indexes (expect each table's primary key index, orders'
--    order_number unique index, plus the 9 named indexes from
--    docs/ORDERS_DATABASE.md §9).
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY tablename, indexname;

-- 7a. Verify RLS is enabled (expect rls_enabled = true for all 4 rows).
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY relname;

-- 7b. Verify the "Allow full access" policy exists on all 4 tables
--     (expect exactly 4 rows, one per table, cmd = 'ALL').
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'payments', 'order_events')
ORDER BY tablename;

-- 8. Confirm no trigger exists on any of the 4 tables (expect 0 rows) -
--    matches "no trigger approved" per this file's header note.
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('orders', 'order_items', 'payments', 'order_events');

-- 9. Confirm no seed rows exist (expect 0 for all 4).
SELECT
  (SELECT count(*) FROM orders) AS orders_rows,
  (SELECT count(*) FROM order_items) AS order_items_rows,
  (SELECT count(*) FROM payments) AS payments_rows,
  (SELECT count(*) FROM order_events) AS order_events_rows;
