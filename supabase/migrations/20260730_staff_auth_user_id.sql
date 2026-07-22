-- Production Authentication Hotfix V2 - Package 1: Database.
--
-- Production's `getCurrentStaffFromRequest()` resolves the calling staff
-- member purely by `auth.users.email -> staff.email` today, which is the
-- confirmed root cause of Permission Center's Production 401s (email-based
-- session resolution failing independently of proxy.ts's own, separate
-- auth check - see lib/permission/serverAuth.ts). This migration adds the
-- column needed to resolve staff by the stable `auth.users.id` instead.
--
-- Purely additive - `staff.email` is untouched and stays the fallback
-- identity signal (Package 5, Backward Compatibility) for any row not yet
-- linked to an `auth.users` account. No existing column is altered or
-- removed.
--
-- This migration does NOT populate `auth_user_id` for any row - that is a
-- separate, deliberately distinct migration
-- (20260730_staff_link_auth_user.sql, Package 4 "Admin Bootstrap") so the
-- schema change here can be reviewed/applied independently of any data
-- change, and so this file stays a pure, trivially-idempotent DDL change.

BEGIN;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'auth_user_id';
-- SELECT conname, contype FROM pg_constraint
--   WHERE conrelid = 'staff'::regclass AND conname LIKE '%auth_user_id%';
-- SELECT count(*) AS total_staff, count(auth_user_id) AS linked_staff FROM staff;
-- Confirm the pre-existing email column is untouched:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'email';
