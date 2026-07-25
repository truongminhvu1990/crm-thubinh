-- Staff Identity & Authentication Foundation - role_id backfill.
--
-- 20260729_permission_center_module.sql added `staff.role_id` as a purely
-- additive, nullable column (Decision 9/10) and deliberately did not
-- backfill it - every existing row kept resolving via the legacy
-- `staff.role` text -> `roles.role_key` fallback in resolveRoleForStaff()
-- (lib/permission/permissionCenter.service.ts). That fallback still works
-- today, but the Staff Identity Foundation rollout wants every row to carry
-- a real `role_id` going forward rather than depending on the fallback
-- indefinitely.
--
-- Pure 1:1 derivation, no judgment call: for any row still missing
-- `role_id`, resolve it from that row's own existing `role` text against
-- `roles.role_key` (byte-for-byte the same match resolveRoleForStaff()
-- already performs at read time). Never touches a row that already has a
-- `role_id`, and never changes `role` itself.
--
-- Idempotent: only updates rows where `role_id IS NULL`, so re-running is a
-- no-op once every row is backfilled.

BEGIN;

UPDATE staff
SET role_id = r.id
FROM roles r
WHERE staff.role_id IS NULL
  AND staff.role = r.role_key;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- Expect 0 rows - every staff row should now have a role_id:
-- SELECT id, staff_code, full_name, role FROM staff WHERE role_id IS NULL;
--
-- Confirm every linked role_id truly matches the row's own role text
-- (expect 0 mismatches):
-- SELECT s.id, s.role AS staff_role, r.role_key
-- FROM staff s JOIN roles r ON r.id = s.role_id
-- WHERE s.role <> r.role_key;
