-- Production Authentication Hotfix V2 - Package 3 follow-up: DB-level email
-- uniqueness.
--
-- Closes the gap named in the prior hotfix migration's Self Review: staff
-- email uniqueness was application-level only (getStaffByEmail, checked
-- from app/settings/staff/page.tsx and now also from lib/staff.service.ts
-- addStaff()/updateStaff() themselves - "move validation into the Staff
-- API, never rely on UI validation only") and could still be bypassed by
-- any write outside those call paths. A partial unique index closes it at
-- the database layer.
--
-- - `lower(email)` - case-insensitive, matching the case-insensitive
--   comparison the application layer now also uses (getStaffByEmail).
-- - `WHERE email IS NOT NULL` - deliberately partial, per explicit
--   instruction not to add NOT NULL yet. Any number of NULL-email rows
--   remain allowed; only non-NULL duplicates are rejected.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS staff_email_unique
ON staff(lower(email))
WHERE email IS NOT NULL;

COMMIT;

-- ============================================================
-- Verification:
-- ============================================================
-- PRE-FLIGHT - run BEFORE applying the migration above, not after. Expect
-- 0 rows; any row returned here means the CREATE UNIQUE INDEX will fail
-- until those duplicates are reconciled:
-- SELECT lower(email) AS email_lc, count(*), array_agg(id) AS staff_ids
-- FROM staff
-- WHERE email IS NOT NULL
-- GROUP BY lower(email)
-- HAVING count(*) > 1;
--
-- POST-APPLY (read-only, run after applying):
-- SELECT indexname, indexdef FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'staff' AND indexname = 'staff_email_unique';
-- Confirm email is still nullable (NOT NULL deliberately not added):
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'email';
