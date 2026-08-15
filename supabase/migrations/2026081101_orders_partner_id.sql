-- Order — Partner Attribution field (docs/PARTNER_CENTER_ORDER_ATTRIBUTION_
-- PROPOSAL.md, APPROVED/APPLIED per Product Owner Revision 2026-07-31,
-- Decision 4: "Order Integration is NOT blocked. Add Partner (optional) to
-- Order. Store partner_id only. Do NOT calculate Compensation. Do NOT
-- create Settlement. Do NOT publish new Business Events.")
--
-- Scope: ONE nullable column on `orders`. Nothing else is touched — no
-- Compensation table, no Settlement table, no new Business Event, no
-- Business Event publish call. `partners` must already exist (see
-- 20260810_partner_center_module.sql) before this migration runs.

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_partner_id ON orders(partner_id);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'partner_id';
-- SELECT conname, confrelid::regclass FROM pg_constraint WHERE conrelid = 'orders'::regclass AND contype = 'f' AND conname LIKE '%partner_id%';
