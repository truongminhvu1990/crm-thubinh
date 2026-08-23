-- 2026082301_bug002_phase1a_rls_anon_lockdown.sql
--
-- BUG-002 Phase 1A — RLS anon/public policy removal for 11 tables.
--
-- STATUS AS OF THIS FILE: this migration documents a change that was
-- found ALREADY LIVE in Production (ktvrgnhpdarsachxlguy) during a
-- reconciliation audit, with no corresponding entry in
-- supabase_migrations.schema_migrations and no matching file previously
-- committed to this repository. This file's purpose is to make the
-- repository and migration history reflect that already-applied reality.
-- It is reconciled via `supabase migration repair --status applied
-- 2026082301` against Production (recording the version without
-- re-executing), NOT via `db push`. Every statement below is idempotent
-- (`DROP POLICY IF EXISTS`) and safe to actually execute if that ever
-- becomes necessary — it would simply be a no-op against a database
-- already in this state.
--
-- Drops only anon/public policies; every `authenticated` policy is left
-- untouched. No schema change, no function change, no permission change
-- outside these targeted RLS policies.
--
-- Explicitly OUT of this batch:
--   permission_sensitive_fields, consignments, consignment_financial_records,
--   payments, order_events, activity_logs, customers/marketing_* tables.

-- ============================================================
-- 1. settlements
-- ============================================================
DROP POLICY IF EXISTS "Allow anon select" ON public.settlements;
DROP POLICY IF EXISTS "Allow anon insert" ON public.settlements;
DROP POLICY IF EXISTS "Allow anon update except direct Paid transition" ON public.settlements;
DROP POLICY IF EXISTS "Allow anon delete" ON public.settlements;
-- KEEP: "Allow authenticated select/insert/update except direct Paid transition/delete"

-- ============================================================
-- 2. settlement_items
-- ============================================================
DROP POLICY IF EXISTS "Allow anon select" ON public.settlement_items;
DROP POLICY IF EXISTS "Allow anon insert" ON public.settlement_items;
DROP POLICY IF EXISTS "Allow anon update except direct deactivation" ON public.settlement_items;
DROP POLICY IF EXISTS "Allow anon delete" ON public.settlement_items;
-- KEEP: "Allow authenticated select/insert/update except direct deactivation/delete"

-- ============================================================
-- 3. compensations
-- ============================================================
DROP POLICY IF EXISTS "Allow anon select" ON public.compensations;
DROP POLICY IF EXISTS "Allow anon insert" ON public.compensations;
DROP POLICY IF EXISTS "Allow anon update except direct Paid transition" ON public.compensations;
DROP POLICY IF EXISTS "Allow anon delete" ON public.compensations;
-- KEEP: "Allow authenticated select/insert/update except direct Paid transition/delete"

-- ============================================================
-- 4. compensation_ledger_entries
-- ============================================================
DROP POLICY IF EXISTS "Allow read to anon" ON public.compensation_ledger_entries;
-- KEEP: "Allow read to authenticated"

-- ============================================================
-- 5. compensation_policies
-- ============================================================
DROP POLICY IF EXISTS "Allow full access to anon" ON public.compensation_policies;
-- KEEP: "Allow full access to authenticated"

-- ============================================================
-- 6. consignment_settlements
-- ============================================================
DROP POLICY IF EXISTS "Allow full access to anon" ON public.consignment_settlements;
-- KEEP: "Allow full access to authenticated"

-- ============================================================
-- 7. consignment_settlement_items
-- ============================================================
DROP POLICY IF EXISTS "Allow full access to anon" ON public.consignment_settlement_items;
-- KEEP: "Allow full access to authenticated"

-- ============================================================
-- 8. partners
-- ============================================================
DROP POLICY IF EXISTS "Allow full access to anon" ON public.partners;
-- KEEP: "Allow full access to authenticated"

-- ============================================================
-- 9. money_debt_ledger_entries
-- ============================================================
DROP POLICY IF EXISTS "Allow read to anon" ON public.money_debt_ledger_entries;
-- KEEP: "Allow read to authenticated"

-- ============================================================
-- 10. operating_expenses
-- ============================================================
DROP POLICY IF EXISTS "Allow full access" ON public.operating_expenses;
-- KEEP: "Allow full access to authenticated"

-- ============================================================
-- 11. report_column_preferences
-- ============================================================
DROP POLICY IF EXISTS "Allow full access to anon" ON public.report_column_preferences;
-- KEEP: "Allow full access to authenticated"

-- ============================================================
-- Rollback
-- ============================================================
-- Re-create the dropped policies verbatim using the exact using/with_check
-- expressions captured in the BUG-002 audit trail, e.g.:
-- CREATE POLICY "Allow anon select" ON public.settlements FOR SELECT TO anon USING (true);
-- CREATE POLICY "Allow anon insert" ON public.settlements FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY "Allow anon update except direct Paid transition" ON public.settlements
--   FOR UPDATE TO anon USING (true) WITH CHECK (status <> 'Paid');
-- CREATE POLICY "Allow anon delete" ON public.settlements FOR DELETE TO anon USING (true);
-- ...repeat per table/policy. DROP POLICY is metadata-only, so rollback is
-- low-risk and near-instant either as a follow-up migration or an ad-hoc query.
