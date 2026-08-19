-- Consignment Permissions — Product Owner-approved, narrowly-scoped
-- EXCEPTION to D12 ("reuse existing permissions only, no consignment.*
-- keys"). Per direct Product Owner decision (Blocker 1 Resolution): after
-- a read-only audit confirmed no existing permission key safely covers
-- any of the three Consignment-entity actions (see the delivery report's
-- Permission Coverage Audit for the exact per-action evidence), the
-- Product Owner authorized exactly three new keys, and only these three —
-- this exception is not extended to any other action.
--
-- DRAFT ONLY until applied — same standing rule as every prior migration
-- in this feature (docs/P7_AUDIT_LOGGING.md §4).
--
-- resource.action naming (docs/PERMISSION_SPEC.md Decision 3, LOCKED):
--   consignment.view    — viewing a Consignment record and its financial
--                          figures (Fee, Customer Payable, Customer Paid,
--                          Customer Outstanding).
--   consignment.create  — recording a new Consignment (RECEIVED), and
--                          progressing it to AVAILABLE_FOR_SALE — the
--                          latter has no separate PO-authorized action of
--                          its own (only three actions were authorized);
--                          it is treated as part of managing a
--                          Consignment's own pre-sale intake lifecycle,
--                          not a new business concept.
--   consignment.return  — recording a Return (D5/D01).
--
-- Seeded UNGRANTED, no hardcoded role mapping — the same convention every
-- module since Partner Center has followed (Partner Center Decision 5):
-- an Owner/Admin assigns these later via the Permission Matrix UI. No
-- role_permissions row is inserted by this migration.

BEGIN;

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('consignment.view', 'consignment', 'view'),
  ('consignment.create', 'consignment', 'create'),
  ('consignment.return', 'consignment', 'return')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run manually after applying.
-- ============================================================
-- SELECT permission_key FROM permissions WHERE resource = 'consignment' ORDER BY permission_key;
-- SELECT count(*) FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
--   WHERE p.resource = 'consignment'; -- expect 0 — seeded ungranted.
