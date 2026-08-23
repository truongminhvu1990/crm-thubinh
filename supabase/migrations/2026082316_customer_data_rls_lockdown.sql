-- RLS lockdown for customers/customer_purchases (BUG-SECURITY-RLS-002 P0)
-- — confirmed live via pg_policies immediately before authoring this
-- migration: `customers` carries five separate public/anon policies
-- (four legacy command-specific `{public}` policies from its original
-- creation, plus a later `{anon}` ALL policy added on top of them) and
-- `customer_purchases` carries one `{public}` ALL policy — all coexisting
-- with an already-correct `{authenticated}` ALL policy on each table,
-- which permissive-policy OR-semantics leaves fully neutralized. Same
-- root cause and same fix shape as BUG-SECURITY-RLS-001's
-- 2026082315_orders_order_items_sales_commissions_rls_lockdown.sql: the
-- anon key (public, shipped in the client bundle) currently has full
-- SELECT/INSERT/UPDATE/DELETE on customer PII and purchase/revenue
-- records directly via PostgREST, bypassing every app-layer check.
--
-- Scope: policy removal only. Neither table's already-correct
-- authenticated-only policy is touched or recreated (both already exist
-- and are left exactly as-is). No GRANT/REVOKE change (matches this
-- schema's established convention — see 2026082315's own header for why
-- grants are not the enforcement boundary here), no ALTER TABLE, no data
-- statement, no application code change.

BEGIN;

-- customers: five policies to drop — two migrations layered exposure on
-- top of each other over this table's history (four legacy per-command
-- public policies, then a later blanket anon policy). The existing
-- "Allow full access to authenticated" policy is untouched.
DROP POLICY IF EXISTS "Allow all delete" ON customers;
DROP POLICY IF EXISTS "Allow all insert" ON customers;
DROP POLICY IF EXISTS "Allow all select" ON customers;
DROP POLICY IF EXISTS "Allow all update" ON customers;
DROP POLICY IF EXISTS "Allow full access to anon" ON customers;

-- customer_purchases: one public policy to drop. The existing
-- "Allow full access to authenticated" policy is untouched.
DROP POLICY IF EXISTS "Allow full access" ON customer_purchases;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--   WHERE tablename IN ('customers','customer_purchases')
--   ORDER BY tablename, policyname;
--   Expect exactly one row per table: "Allow full access to authenticated",
--   roles={authenticated}, cmd=ALL.
