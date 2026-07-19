-- P7 Production Hardening — Authorization Review, Finding 1.
-- DRAFTED ONLY. NOT APPLIED. Requires explicit Product Owner approval
-- before being run against Development, per this project's standing
-- database rule (no schema/policy change without approval).
--
-- Problem: every existing RLS policy in this schema is scoped
-- `TO anon` only (see docs/P7_AUTHORIZATION_REVIEW.md, Finding 1). Once a
-- user is signed in via Supabase Auth, PostgREST resolves their Postgres
-- role from the session JWT as `authenticated`, not `anon` — a role with
-- zero matching policies gets zero rows on read and a rejected write.
--
-- Fix: add an identical `TO authenticated` policy alongside every existing
-- `TO anon` policy, same `USING (true) WITH CHECK (true)` shape. This does
-- NOT change who can do what — the locked design (docs/INVENTORY_UI.md
-- §1.12, docs/ORDERS_UI.md §20) is "any authenticated staff member, full
-- access, no roles" — it only makes that already-approved model actually
-- reach Postgres for real logged-in sessions instead of only for the
-- anonymous key. Purely additive: no existing policy is dropped or edited,
-- no table/column is touched.
--
-- Does NOT touch `knowledge_entries` — that table has no RLS at all by
-- explicit Product Owner requirement (supabase/migrations/20260717_knowledge_vault_module.sql),
-- a different, deliberate decision outside this fix's scope.

BEGIN;

CREATE POLICY "Allow full access to authenticated" ON customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON master_data
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON tag_options
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON customer_purchases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON product_batches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON product_images
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON order_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- Verification (read-only, run after applying):
-- SELECT tablename, policyname, roles FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;
-- Expect two policies per table above: one `{anon}`, one `{authenticated}`.
