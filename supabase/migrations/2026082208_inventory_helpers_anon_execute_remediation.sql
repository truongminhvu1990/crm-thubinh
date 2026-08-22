-- inventory_current_staff_id() / inventory_staff_has_permission() — close
-- unintended anonymous EXECUTE exposure (Phase 1A, INV-016A).
--
-- Confirmed finding (discovered during INV-021, reused here as the trigger
-- for this dedicated remediation): both helpers were created in INV-016
-- (2026082205_adjust_product_inventory_rpc_authorization.sql) with
-- `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;` only —
-- no explicit `REVOKE ... FROM anon`. This project's Supabase default
-- privilege setup grants EXECUTE on new public-schema functions to `anon`
-- directly, independent of the PUBLIC pseudo-role, so revoking from PUBLIC
-- alone left a direct `anon` grant in place. Confirmed live via
-- information_schema.routine_privileges before this migration: both
-- functions list `anon` alongside `authenticated`/`service_role`/`postgres`.
--
-- Dependency analysis (Section 5, this task) — every database function
-- whose source references either helper, found by searching pg_proc.prosrc
-- project-wide:
--   adjust_product_inventory()  (INV-016) — SECURITY INVOKER,
--     EXECUTE: authenticated/service_role/postgres only (anon already
--     revoked at the outer-function level since INV-016).
--   reserve_product()           (INV-020) — SECURITY INVOKER, same grants.
--   release_product()           (INV-021) — SECURITY INVOKER, same grants.
-- All three call inventory_current_staff_id() (release_product and
-- reserve_product) and/or inventory_staff_has_permission() (only
-- adjust_product_inventory) as ordinary nested function calls. Because all
-- three outer functions are SECURITY INVOKER (not DEFINER), Postgres
-- evaluates EXECUTE privilege for these nested calls against the actual
-- invoking database role — i.e., whatever role called the outer RPC in the
-- first place (authenticated, in every legitimate path, since anon already
-- has no EXECUTE on any of the three outer RPCs). There is no
-- SECURITY DEFINER link in this chain that would let a lower-privileged
-- nested call ride on an elevated definer's own rights - the invoker's own
-- privileges are what's checked at every level. Conclusion: `authenticated`
-- EXECUTE on both helpers is load-bearing and must be preserved exactly as
-- INV-016 established it; `anon` EXECUTE was never reachable through any
-- legitimate call chain (anon cannot invoke any of the three outer RPCs),
-- so revoking anon's direct grant on the helpers changes no legitimate
-- behavior — it only closes the ability to call these two helpers directly,
-- bypassing every outer RPC entirely.
--
-- Scope: privilege-only. No change to either function's body, staff
-- resolution logic, permission semantics, or search_path (all confirmed
-- unchanged by CREATE OR REPLACE not being used here at all — this
-- migration issues only REVOKE/GRANT statements, no CREATE OR REPLACE).
-- adjust_product_inventory/reserve_product/release_product themselves are
-- not touched.

BEGIN;

REVOKE ALL ON FUNCTION inventory_current_staff_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION inventory_current_staff_id() FROM anon;
GRANT EXECUTE ON FUNCTION inventory_current_staff_id() TO authenticated;

REVOKE ALL ON FUNCTION inventory_staff_has_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION inventory_staff_has_permission(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION inventory_staff_has_permission(uuid, text) TO authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_name IN ('inventory_current_staff_id','inventory_staff_has_permission')
--   ORDER BY routine_name, grantee;
-- Expect: authenticated, service_role, postgres only for both — no anon, no PUBLIC.
