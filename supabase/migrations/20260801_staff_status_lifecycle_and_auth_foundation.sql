-- Staff Identity & Authentication Foundation - Product Owner review (PARTIAL
-- APPROVED), Required Changes 1/3/4.
--
-- 1. Staff Status must support Active/Inactive/Locked/Archived (was
--    Active/Inactive only). Widens the existing `staff_status_check`
--    constraint - same idempotent DROP+ADD pattern already used by
--    20260715_master_data_country_category_fix.sql and others in this repo
--    for widening a CHECK's allowed value set.
--
-- 3. Authentication lifecycle foundation - two new nullable timestamp
--    columns. Deliberately no separate "Never Logged In" boolean/status:
--    that state is just `last_login_at IS NULL`, so a redundant column
--    would only be able to drift out of sync with the timestamp it
--    duplicates. Purely additive, always NULL until a future package wires
--    up the actual login flow to set them - no code in this change writes
--    to either column yet ("Database foundation only", no UI/enforcement).
--
-- 4. Force Password Change foundation - one new boolean, defaulted false so
--    existing rows are unaffected. lib/auth/createStaffWithAuth.ts (this
--    same package) sets it true at creation time, since a brand new account
--    always starts on the temporary password from Business Rule 4/5. No
--    login-flow enforcement is added here - reading/acting on this flag is
--    future work, same as item 3.
--
-- No existing column is altered or removed; no data is deleted.

BEGIN;

ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_status_check;
ALTER TABLE staff ADD CONSTRAINT staff_status_check
  CHECK (status IN ('Active', 'Inactive', 'Locked', 'Archived'));

ALTER TABLE staff ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- Confirm the widened status constraint accepts all 4 values and rejects
-- anything else:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'staff'::regclass AND conname = 'staff_status_check';
--
-- Confirm the 3 new columns exist with the right types/defaults/nullability:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'staff'
--   AND column_name IN ('last_login_at', 'password_changed_at', 'must_change_password');
--
-- Confirm no existing row was affected (all pre-existing rows keep
-- must_change_password = false, last_login_at/password_changed_at = NULL):
-- SELECT count(*) FILTER (WHERE must_change_password IS true) AS flagged,
--        count(*) FILTER (WHERE last_login_at IS NOT NULL) AS has_login,
--        count(*) FILTER (WHERE password_changed_at IS NOT NULL) AS has_pw_change
-- FROM staff;
