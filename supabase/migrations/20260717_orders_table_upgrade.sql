-- Orders Module — public.orders Additive Upgrade
-- Approved via Product Owner "Migration Strategy APPROVED" decision.
--
-- Root cause established across this sprint's investigation: `public.orders`
-- on this project (ktvrgnhpdarsachxlguy) is still the pre-existing legacy
-- table (id, order_code, customer_id, employee_id, order_date, total_amount,
-- payment_method, status, notes) — the previously-drafted drop-and-recreate
-- migrations (20260716_orders_database_foundation.sql,
-- 20260716_crm_baseline_orders_foundation.sql) never actually landed against
-- this table. Per this task's explicit decision, this migration does NOT
-- retry a drop-and-recreate — it upgrades the existing table additively:
--   - Preserves all existing data (no DROP, no data-destructive statement
--     anywhere in this file).
--   - Does not drop any existing column, including the legacy-only ones
--     (order_code, employee_id, payment_method, status, notes) that have no
--     equivalent in the approved design — they are left exactly as-is.
--   - Only adds columns the approved design (docs/ORDERS_DATABASE.md §4,
--     docs/CRM_DATABASE_SPECIFICATION.md §7) names that are not already
--     present: order_number, sales_owner, created_by, lost_reason,
--     subtotal, discount_total, order_status, payment_status, note,
--     created_at, updated_at. (id, customer_id, order_date, total_amount
--     already exist and are untouched.)
--
-- Deliberately out of scope, not silently expanded:
--   - order_items/payments/order_events are not touched by this file at
--     all — order_items remains at its prior partial schema, payments/
--     order_events remain absent. This migration's only job is unblocking
--     `POST /orders` (which writes to `orders` only, per
--     order.repository.ts's createOrder), matching this task's stated
--     verification goals exactly.
--   - No FK constraint added to the existing `customer_id` column. It
--     already exists as a column (not a "missing column"), and forcing a
--     FOREIGN KEY onto unknown-quality legacy data is a separate, higher-
--     risk change this task did not ask for. Flagged for a future task if
--     the Product Owner wants it addressed.
--   - No BEFORE UPDATE trigger added for `updated_at`. docs/
--     CRM_DATABASE_SPECIFICATION.md §7 explicitly documents "Trigger: None"
--     for `orders` (unlike customers/products/product_batches) — adding one
--     now would be a design change beyond "add missing columns."
--
-- sales_owner / created_by are added NULLABLE, not NOT NULL as the approved
-- design otherwise specifies. Pre-existing legacy rows have no real data for
-- "who owns this deal" / "who created this record" — inventing a placeholder
-- value would be fabricating business data, and enforcing NOT NULL without
-- one would break the migration on any existing row. This is the "keep
-- backward compatibility where possible" clause applied literally: the
-- Service layer (order.validation.ts's validateCreateOrderInput, and
-- CreateOrderInput's TypeScript shape) already requires both fields for
-- every NEW order created through the application — that rule is unchanged.
-- Only the database-level constraint is relaxed, and only for legacy-row
-- compatibility.
--
-- order_number needs NOT NULL + UNIQUE per the approved design, which a
-- single ADD COLUMN...DEFAULT cannot safely provide across more than one
-- existing row. Handled in three steps: add nullable, backfill existing
-- rows with a clearly-marked legacy placeholder (never colliding with the
-- application's real `OD-...` format), then apply the constraints.

BEGIN;

-- ============================================================
-- 1. Add columns with non-volatile constant defaults — Postgres applies
--    these to existing rows without a full table rewrite, so this is safe
--    and fast regardless of current row count.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS sales_owner text,
  ADD COLUMN IF NOT EXISTS created_by text;

-- ============================================================
-- 2. Add order_status / payment_status — NOT NULL with a constant default
--    is safe the same way as above; CHECK constraints added separately
--    since Postgres has no ADD COLUMN ... CHECK ... IF NOT EXISTS form and
--    this keeps each guarded independently.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'Unpaid';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_order_status_check
      CHECK (order_status IN ('Draft', 'Reserved', 'Completed', 'Lost'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid'));
  END IF;
END $$;

-- ============================================================
-- 3. created_at / updated_at — DEFAULT now() is volatile, so Postgres
--    rewrites the table once and applies the same single timestamp (the
--    moment of this migration) to every pre-existing row. That is the
--    correct, honest value for legacy rows whose real creation time was
--    never tracked — not a fabrication, an accurate "unknown, backfilled
--    at upgrade time" marker.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- 4. order_number — added nullable first, backfilled with a clearly-marked
--    legacy placeholder unique per row (via the row's own id, already
--    guaranteed unique), then locked down to NOT NULL + UNIQUE. The
--    'LEGACY-' prefix can never collide with the application's own
--    `OD-{YYYYMMDD}-{6-digit sequence}` format.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number text;

UPDATE orders
SET order_number = 'LEGACY-' || id::text
WHERE order_number IS NULL;

DO $$
BEGIN
  ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_key'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;

-- ============================================================
-- 5. Indexes — the subset of docs/ORDERS_DATABASE.md §9's named indexes
--    that apply to columns now present on `orders`. IF NOT EXISTS guards
--    make this safe to re-run.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_payment_status ON orders(order_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_sales_owner ON orders(sales_owner);

-- ============================================================
-- 6. RLS + policy — matches the already-established pattern for every
--    other table in this project. Guarded so this is safe whether RLS/a
--    policy already exists (as the anon-key read access observed
--    throughout this investigation suggests it does) or not.
-- ============================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders'
  ) THEN
    CREATE POLICY "Allow full access" ON orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after the transaction above.
-- ============================================================

-- 1. Column list — expect all 15 approved columns present, plus the 5
--    legacy-only columns (order_code, employee_id, payment_method, status,
--    notes) still there, untouched.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;

-- 2. Constraints — expect orders_order_number_key (UNIQUE),
--    orders_order_status_check, orders_payment_status_check.
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass;

-- 3. Indexes — expect the 4 named above plus the existing primary key.
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'orders';

-- 4. No data lost — row count before and after this migration must match
--    (compare manually against a pre-migration count).
SELECT count(*) FROM orders;

-- 5. Legacy rows correctly backfilled — expect 0 rows with a NULL
--    order_number, and any pre-existing rows now show a 'LEGACY-' prefixed
--    value.
SELECT count(*) FILTER (WHERE order_number IS NULL) AS null_order_numbers,
       count(*) FILTER (WHERE order_number LIKE 'LEGACY-%') AS legacy_backfilled
FROM orders;
