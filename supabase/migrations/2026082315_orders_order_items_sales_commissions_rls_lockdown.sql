-- RLS lockdown for orders/order_items/sales_commissions (BUG-SECURITY-RLS-001)
-- — confirmed live via pg_policies/information_schema.role_table_grants
-- immediately before authoring this migration: `orders` and `order_items`
-- each carry only one policy, "Allow full access" FOR ALL TO public USING
-- (true) — the anon role has full table grants and this policy grants it
-- full row-level access too, bypassing every app-layer authorization check
-- (staff roles, Data Scope, Owner-only gates). `sales_commissions` already
-- has a correct authenticated-only policy alongside the same permissive
-- public one; since permissive RLS policies OR together, the public policy
-- alone still leaves it fully open regardless of the authenticated one.
--
-- Every code comment across lib/orders/order.repository.ts, lib/orders/
-- order.service.ts, and nearly every app/api/orders/** route cites a
-- migration "2026082211_orders_compensations_sales_commissions_rls_
-- lockdown.sql" as having already done this — confirmed absent from both
-- this repo's supabase/migrations/ directory and Production's
-- supabase_migrations.schema_migrations. This migration is the real fix
-- that comment always assumed already existed.
--
-- Scope, per BUG-SECURITY-RLS-001 Phase 2 explicit authorization: policy
-- substitution only. No GRANT/REVOKE change (payments/order_events, this
-- schema's already-correct precedent, also still grant anon full table
-- privileges — the policy's role list is the actual enforcement boundary
-- here, not the grant; changing that convention is out of scope), no
-- ALTER TABLE, no data write, no function change, no application code
-- change.

BEGIN;

-- orders: replace the permissive public policy with an authenticated-only
-- one, in the same FOR ALL / USING(true) / WITH CHECK(true) shape already
-- proven safe by payments/order_events.
DROP POLICY IF EXISTS "Allow full access" ON orders;
CREATE POLICY "Allow full access to authenticated" ON orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- order_items: same pattern.
DROP POLICY IF EXISTS "Allow full access" ON order_items;
CREATE POLICY "Allow full access to authenticated" ON order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- sales_commissions: the authenticated-only policy already exists and is
-- correct (added by 20260721_sales_commission_module.sql) — only drop the
-- redundant public policy that neutralizes it. Do not touch the
-- authenticated policy itself.
DROP POLICY IF EXISTS "Allow full access" ON sales_commissions;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--   WHERE tablename IN ('orders','order_items','sales_commissions')
--   ORDER BY tablename;
--   Expect exactly one row per table, each roles={authenticated}.
-- BEGIN; SET LOCAL ROLE anon; SELECT id FROM orders LIMIT 1; ROLLBACK;
--   Expect 0 rows (RLS-filtered, not an error).
-- BEGIN; SET LOCAL ROLE authenticated; SELECT id FROM orders LIMIT 1; ROLLBACK;
--   Expect normal access, unaffected.
