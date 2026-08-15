-- Business Intelligence Dashboard — Product Owner Implementation Task
-- 2026-07-31.
--
-- Scope: ONE new permission row. No table, no column, no trigger — this
-- module reads exclusively from existing tables (orders, customers,
-- products, order_items, partners, compensations, settlements,
-- settlement_items, compensation_ledger_entries), all of which already
-- exist. "Do NOT create new business entities" is honored literally: there
-- is nothing to migrate structurally except the permission itself.

BEGIN;

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('business_intelligence.view', 'business_intelligence', 'view')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- Verification:
-- SELECT permission_key FROM permissions WHERE resource = 'business_intelligence';
