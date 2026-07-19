-- CRM Baseline V1
-- Package 3
-- Tables: customer_purchases
--
-- Source of Truth: docs/CRM_DATABASE_SPECIFICATION.md lists
-- `customer_purchases` under "NOT YET APPROVED Tables" pending this
-- package, with no schema asserted there. Per that document's own sourcing
-- rule (approved migrations only, no application code), this file
-- transcribes exactly what the Product Owner approved migration history
-- already defines for this table - no redesign, no inferred columns,
-- indexes, or constraints beyond what those files already contain:
--   - 20260709_customer_purchases.sql (creating migration: table, PK, FKs,
--     sale_price/sale_date/note/created_at, the customer_id index, RLS,
--     the "Allow full access" policy)
--   - 20260709_source_salesperson_fields.sql (adds `source`/`salesperson`
--     columns to this table)
--
-- Dependency: `customer_id REFERENCES customers(id)` and
-- `product_id REFERENCES products(id)` require Package 1 (`customers`,
-- `products`) to already exist - same dependency pattern already used by
-- the Orders foundation migration.
--
-- Out of scope, deliberately: `product_batches`/`product_images`
-- (Package 4), all 4 Orders tables, Inventory, Reports. No seed data.
--
-- Per task instruction: migration file only, not executed by this task.

BEGIN;

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sale_price numeric NOT NULL,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  source text,
  salesperson text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. INDEXES — exactly the one index already defined in the approved
--    creating migration. No additional index inferred.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customer_purchases_customer_id ON customer_purchases(customer_id);

-- ============================================================
-- 3. ROW LEVEL SECURITY + POLICY — exact name/shape already used by the
--    approved creating migration (no `TO anon` clause, matching that
--    file precisely rather than the later `TO anon` phrasing used by
--    other tables).
-- ============================================================

ALTER TABLE customer_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access" ON customer_purchases;

CREATE POLICY "Allow full access"
ON customer_purchases
FOR ALL
USING (true)
WITH CHECK (true);

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after the transaction above has
-- been executed and approved. Not part of the transaction itself.
-- ============================================================

-- 1. Verify the table exists (expect exactly 1 row).
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'customer_purchases';

-- 2. Verify columns (expect 9 rows: id, customer_id, product_id,
--    sale_price, sale_date, note, source, salesperson, created_at).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'customer_purchases'
ORDER BY ordinal_position;

-- 3. Verify the primary key (expect one row, on `id`).
SELECT tc.table_name, kcu.column_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'customer_purchases'
  AND tc.constraint_type = 'PRIMARY KEY';

-- 4. Verify the foreign keys (expect 2 rows: customer_id -> customers,
--    product_id -> products).
SELECT
  tc.constraint_name,
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
  AND tc.table_name = 'customer_purchases'
  AND tc.constraint_type = 'FOREIGN KEY';

-- 5. Verify indexes (expect the primary key index plus
--    idx_customer_purchases_customer_id - no others).
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'customer_purchases'
ORDER BY indexname;

-- 6a. Verify RLS is enabled (expect rls_enabled = true).
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname = 'customer_purchases';

-- 6b. Verify the "Allow full access" policy exists (expect exactly 1 row,
--     cmd = 'ALL').
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'customer_purchases';

-- 7. Confirm no seed rows exist (expect 0).
SELECT count(*) AS customer_purchases_rows FROM customer_purchases;
