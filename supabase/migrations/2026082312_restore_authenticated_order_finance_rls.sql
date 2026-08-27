-- order_events / payments — restore authenticated RLS access (BUG recovery,
-- Product Owner Authorization, 2026-08-23).
--
-- ============================================================
-- PROVENANCE (read before touching this file again)
-- ============================================================
-- Root cause, confirmed via live Production query (ktvrgnhpdarsachxlguy/
-- crm-thubinh) immediately before authoring this file:
-- 2026082214_permission_center_payments_order_events_rls_lockdown.sql
-- dropped the sole existing policy on both order_events and payments
-- ("Allow full access", roles={public}, ALL, USING true, WITH CHECK true),
-- on the mistaken assumption that a separate "Allow full access to
-- authenticated" policy already existed underneath it and would survive
-- the DROP. No such separate policy ever existed for either table — the
-- dropped policy was the only one. Both tables have carried RLS enabled
-- with ZERO policies since that migration was applied (confirmed present
-- in supabase_migrations.schema_migrations), meaning every INSERT/SELECT/
-- UPDATE/DELETE from every non-owner role, including authenticated, has
-- been unconditionally denied — this is why authenticated Order creation
-- fails with "new row violates row-level security policy for table
-- order_events" (OrderRepository.appendOrderEvent), and why addPayment's
-- direct-INSERT path (the non-receiving_account_id branch) will fail
-- identically the moment it is next exercised.
--
-- Scope: exactly these two tables. Restores authenticated-only access —
-- matches 2026082214's OWN stated intent (its verification-query comment
-- expected exactly "Allow full access to authenticated", roles=
-- {authenticated}, per table). Does not recreate any anon/public policy;
-- anon continues to have zero access to either table, same as every other
-- Phase 1A/1B lockdown target in this schema (INV-030/032/033/035/F-M5/
-- F-L5/BUG-002). GRANT-level authenticated privileges on both tables were
-- never removed (confirmed via information_schema.role_table_grants) —
-- RLS was always the only actual gate here, and is the only thing this
-- migration touches. No column, trigger, RPC, function body, EXECUTE
-- grant, permission key, or application code is touched. orders/
-- order_items are deliberately out of scope for this migration (they
-- still carry their original, never-removed wide-open "Allow full
-- access" roles={public} policy — a separate, already-flagged issue, not
-- part of this bug and not fixed here).

BEGIN;

CREATE POLICY "Allow full access to authenticated" ON public.order_events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow full access to authenticated" ON public.payments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT tablename, policyname, roles::text, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('order_events','payments')
--   ORDER BY tablename;
-- Expect exactly one policy per table: "Allow full access to
-- authenticated", roles={authenticated}, cmd=ALL, qual=true,
-- with_check=true — no anon/public-scoped policy on either table.
--
-- SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--   WHERE oid IN ('public.order_events'::regclass, 'public.payments'::regclass);
-- Expect relrowsecurity=true, relforcerowsecurity=false on both (unchanged
-- from before this migration — this migration never touches RLS
-- enablement, only policies).
