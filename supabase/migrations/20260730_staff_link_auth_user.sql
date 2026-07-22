-- Production Authentication Hotfix V2 - Package 4: Admin Bootstrap
-- (linking, never auto-creation).
--
-- Links EXISTING staff rows to EXISTING auth.users accounts by matching
-- staff.email to auth.users.email, case-insensitively - the one
-- deterministic correlation already available between the two tables,
-- since that is exactly the identity signal `getCurrentStaffFromRequest()`
-- has relied on until now. This migration:
--   - Never creates a new staff row.
--   - Never creates a new auth.users account.
--   - Never changes a role, permission, or any other existing column.
--   - Only sets `staff.auth_user_id` on rows that already exist, for
--     accounts that already exist, matched by an identity signal that was
--     already the sole basis for authentication before this hotfix.
-- No automatic privilege escalation: a staff row's role/access after this
-- migration is exactly what it was before it ran - this only lets
-- getCurrentStaffFromRequest() (lib/permission/serverAuth.ts) resolve that
-- same row via the new auth_user_id path (Priority 1) instead of falling
-- through to the email path (Priority 2).
--
-- Idempotent: only touches rows where `auth_user_id IS NULL`, so re-running
-- is a no-op for rows already linked by a prior run of this same file.
-- Rows whose email has no matching auth.users account (or whose email is
-- NULL) are left unlinked and keep resolving via the email fallback
-- (Package 5, Backward Compatibility) until manually reconciled.
--
-- Depends on 20260730_staff_auth_user_id.sql having already run (adds the
-- `auth_user_id` column this UPDATE writes to).

BEGIN;

UPDATE staff
SET auth_user_id = au.id
FROM auth.users au
WHERE staff.auth_user_id IS NULL
  AND staff.email IS NOT NULL
  AND lower(staff.email) = lower(au.email);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT count(*) AS total_staff, count(auth_user_id) AS linked_staff FROM staff;
-- Rows still unlinked (expected to keep resolving via email fallback):
-- SELECT id, staff_code, full_name, email FROM staff WHERE auth_user_id IS NULL;
-- Confirm every linked row's auth_user_id truly matches an existing
-- auth.users account with the same email (expect 0 mismatches):
-- SELECT s.id, s.email AS staff_email, au.email AS auth_email
-- FROM staff s JOIN auth.users au ON au.id = s.auth_user_id
-- WHERE lower(s.email) <> lower(au.email);
