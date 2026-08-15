-- Reporting Permission Enforcement (Product Owner Decision Q-12, Revision 3
-- of docs/REPORTING_MASTER_SPEC.md, 2026-08-14).
--
-- Scope: TWO new permission rows only. No table, no column, no trigger --
-- Reporting owns no transactional data (docs/07_REPORTING_SPEC.md §3), so
-- there is nothing to migrate structurally except the permission keys
-- themselves, per docs/07_REPORTING_SPEC.md §13's already-LOCKED set:
--   - reports.view   -- viewing any report in any of the six categories
--   - reports.export -- exporting report data
--
-- Deliberately NOT granted to any role here, matching the exact precedent
-- already set for business_intelligence.view
-- (2026081501_business_intelligence_permission.sql): a new permission key
-- is inserted unassigned, and an Owner grants it to whichever roles should
-- hold it via Permission Center's own UI. This is the established
-- convention for this schema, not a new pattern invented for this task.
--
-- IMPORTANT operational note (see delivery report): until an Owner grants
-- reports.view (and reports.export, for exporting) to at least the Owner/
-- Manager/Sales roles via Permission Center, every one of Sales Ledger,
-- Monthly Sold Products, and Payment Method Report becomes inaccessible
-- (403) to everyone, including Owner -- this is the direct, intended
-- consequence of Decision Q-12 ("enforce now"), not a bug.

BEGIN;

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('reports.view', 'reports', 'view'),
  ('reports.export', 'reports', 'export')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- Verification:
-- SELECT permission_key FROM permissions WHERE resource = 'reports';
