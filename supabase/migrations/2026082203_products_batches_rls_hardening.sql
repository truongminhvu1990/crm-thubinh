-- Products + Product Batches — RLS hardening (Phase 1A, INV-012).
--
-- SCOPE NOTE — read before touching this file again: this migration
-- intentionally does NOT narrow `products` UPDATE. See the dedicated
-- comment block above that section for the exact, evidenced reason. Every
-- other operation on both tables is narrowed to the full target design
-- (anon denied, authenticated allowed).
--
-- Root cause for the parts that ARE narrowed here: both tables carried the
-- same maximally-permissive two-policy pattern already closed on
-- inventory_audit (INV-014) and Consignment (INV-015) — "Allow full
-- access to anon" (TO anon) + "Allow full access to authenticated" (TO
-- authenticated), both USING(true) WITH CHECK(true)
-- (2026071602_crm_baseline_customers_products.sql,
-- 2026071604_crm_baseline_product_batches_product_images.sql). Confirmed
-- live and unchanged from the INV-010 design baseline immediately before
-- this migration was authored — no drift found.

BEGIN;

-- ============================================================
-- product_batches — fully narrowed, no blocker.
-- ============================================================
-- lib/productBatch.service.ts (addBatch/updateBatch/deleteBatch/getBatches/
-- etc.) is called EXCLUSIVELY from browser client components
-- (app/batches/page.tsx, app/batches/[id]/page.tsx) — confirmed via
-- repo-wide search: no app/api/** route imports this file at all. Because
-- these calls execute in a genuine browser context, the standard
-- lib/supabase.ts createBrowserClient() singleton they use correctly
-- carries the real logged-in user's session cookies — unlike the
-- server-side case documented below for products.UPDATE. Narrowing every
-- operation here is therefore safe.
DROP POLICY IF EXISTS "Allow full access to anon" ON product_batches;
DROP POLICY IF EXISTS "Allow full access to authenticated" ON product_batches;
CREATE POLICY "product_batches_authenticated_full_access" ON product_batches
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- products — SELECT / INSERT / DELETE narrowed; UPDATE intentionally
-- left untouched. See the block below.
-- ============================================================
DROP POLICY IF EXISTS "Allow full access to anon" ON products;
DROP POLICY IF EXISTS "Allow full access to authenticated" ON products;

-- SELECT: safe. lib/product.service.ts's getProducts/getProductById are
-- correctly called with an authenticated server client
-- (createClient() from lib/supabase/server, injected by
-- app/api/products/route.ts and app/api/products/[id]/route.ts). A
-- separate SELECT policy also has no bearing on reserveProduct/
-- releaseProduct/markProductSold below — Postgres RLS resolves an
-- UPDATE statement's WHERE-clause visibility via the UPDATE policy's
-- own USING clause, not a SELECT policy.
CREATE POLICY "products_authenticated_select" ON products
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: safe. lib/product.service.ts's addProduct (Inbound) is
-- correctly called with an injected authenticated server client by
-- app/api/products/route.ts. No RPC is required for this operation
-- (INV-010 §6: Inbound is a simple creation, not a state-transition).
CREATE POLICY "products_authenticated_insert" ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- DELETE: safe. lib/product.service.ts's deleteProduct is correctly
-- called with an injected authenticated server client by
-- app/api/products/[id]/route.ts. Unrelated to the Reserve/Release/Sell/
-- Cancel/Adjustment mutation set — this is the separate product-deletion
-- CRUD capability, not a stock-state transition.
CREATE POLICY "products_authenticated_delete" ON products
  FOR DELETE
  TO authenticated
  USING (true);

-- UPDATE: INTENTIONALLY LEFT AT THE PRE-EXISTING BROAD STATE (anon AND
-- authenticated both still permitted). This is NOT an oversight and NOT
-- a silently-accepted security gap — it is a documented, evidenced
-- BLOCKER, reported in full in the INV-012 task report.
--
-- Root cause: lib/orders/order.repository.ts's reserveProduct(),
-- releaseProduct(), and markProductSold() — the live, currently-working
-- write paths for Reserve/Release/Sell — along with every other one of
-- this file's 26 exported functions, have NO injectable Supabase client
-- parameter anywhere in their signatures. They are hardcoded to the
-- module-level `supabase` singleton from lib/supabase.ts
-- (createBrowserClient), which, when this code executes server-side
-- inside a Next.js API Route Handler (no browser, no cookies), has no
-- session context at all and therefore issues every query as the ANON
-- role — empirically confirmed this task (see INV-012 report). This is
-- unlike lib/product.service.ts, lib/consignment/consignment.service.ts,
-- and lib/inventoryAdjustment/inventoryAdjustment.repository.ts, which
-- all accept an injectable `client` parameter and are correctly called
-- with a real authenticated server client by their respective API
-- routes.
--
-- Practical consequence: narrowing UPDATE on this table to authenticated-
-- only (or even just removing anon specifically) would immediately break
-- live, currently-functioning Reserve/Release/Sell — those operations
-- run as anon today, not authenticated, so denying anon UPDATE would be
-- just as breaking as denying authenticated UPDATE.
--
-- Recreated verbatim (not narrowed) so this table's UPDATE behavior is
-- byte-for-byte unchanged from before this migration, while every other
-- command on this table (and all of product_batches) IS closed above.
CREATE POLICY "products_anon_update_interim_unblocked" ON products
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
CREATE POLICY "products_authenticated_update_interim_unblocked" ON products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT tablename, policyname, cmd, roles::text FROM pg_policies
--   WHERE tablename IN ('products','product_batches') ORDER BY tablename, cmd;
-- Expect: product_batches has exactly one authenticated-only ALL policy.
-- products has authenticated-only SELECT/INSERT/DELETE policies, plus
-- BOTH an anon and an authenticated UPDATE policy (unchanged, deliberate).
