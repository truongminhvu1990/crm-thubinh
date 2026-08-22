-- Products — close anonymous UPDATE access (Phase 1A, INV-012B).
--
-- LAYER A (security floor) only, per this task's explicit scope: closes
-- the anon-key REST bypass on products.UPDATE. Does NOT implement LAYER B
-- (the final controlled-mutation boundary via RPC) — authenticated direct
-- table UPDATE remains possible after this migration, exactly as before;
-- closing that is separate, future RPC-hardening work (INV-016/020/021),
-- not attempted here.
--
-- Root cause this closes: INV-012 deliberately left both
-- products_anon_update_interim_unblocked (TO anon) and
-- products_authenticated_update_interim_unblocked (TO authenticated) in
-- place, because at that time lib/orders/order.repository.ts's Reserve/
-- Release/Sell/Cancel write paths had no authenticated-client injection
-- capability at all and ran as anon — narrowing UPDATE then would have
-- broken live Order functionality. INV-012A fixed that prerequisite
-- (every mutation-critical Orders API route now constructs and propagates
-- a real, cookie-authenticated server client). This migration removes only
-- the now-unnecessary anon UPDATE grant.
--
-- Scope: products.UPDATE only. SELECT/INSERT/DELETE on products (already
-- authenticated-only since INV-012) are untouched. product_batches,
-- orders/order_items/payments/order_events, inventory_audit, and
-- Consignment are untouched. No RPC, trigger, or application code is
-- touched.

BEGIN;

DROP POLICY IF EXISTS "products_anon_update_interim_unblocked" ON products;
DROP POLICY IF EXISTS "products_authenticated_update_interim_unblocked" ON products;

CREATE POLICY "products_authenticated_update" ON products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT policyname, cmd, roles::text FROM pg_policies
--   WHERE tablename = 'products' AND cmd = 'UPDATE';
-- Expect exactly one UPDATE policy, TO authenticated only — no anon-scoped
-- UPDATE policy remains. NOTE: this does not by itself prevent an
-- authenticated session from directly UPDATE-ing products outside the app
-- — see INV-012B's report for that explicitly-tracked, separate gap.
