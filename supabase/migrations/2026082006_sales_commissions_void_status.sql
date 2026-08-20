-- Compensation/Commission Void (Product Owner Authorization, 2026-08-20).
-- Adds 'Void' as a new sales_commissions.status value - the Commission
-- module's own terminal "this will never be paid" state, parallel to
-- Compensation's existing 'Cancelled' (which is reused as-is, per LOCKED
-- Decision 1 of this authorization - no new status invented there).
-- Existing values (Pending/Approved/Paid) and their own transition rules
-- are unchanged; this only widens the CHECK constraint's allowed set.

BEGIN;

ALTER TABLE sales_commissions DROP CONSTRAINT IF EXISTS sales_commissions_status_check;
ALTER TABLE sales_commissions
  ADD CONSTRAINT sales_commissions_status_check
  CHECK (status IN ('Pending', 'Approved', 'Paid', 'Void'));

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'sales_commissions'::regclass AND conname = 'sales_commissions_status_check';
-- Expect: CHECK (status = ANY (ARRAY['Pending','Approved','Paid','Void']))
