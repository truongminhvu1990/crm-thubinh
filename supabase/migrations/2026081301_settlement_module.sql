-- Settlement (docs/14_SETTLEMENT_SPEC.md, LOCKED Rev 3) — Product Owner
-- Implementation Task 2026-07-31, revised same day per Product Owner
-- Revision (Module: Settlement, "REVISION REQUIRED").
--
-- Scope: TWO new tables (`settlements`, `settlement_items`) plus 2 new
-- permission rows. Does NOT touch `compensations` structurally — no column
-- added there; Compensation's own status column already supports
-- 'Handed Off' (added when Compensation itself was built). Compensation
-- Ledger is explicitly NOT touched (zero-code, per direct instruction).
--
-- Revision history on this exact table shape:
--   Rev 1 (this file's original version): `settlements.compensation_id`
--   was a single, UNIQUE, NOT NULL column — exactly one Compensation per
--   Settlement, matching docs/14_SETTLEMENT_SPEC.md §8 literally.
--   Rev 2 (Product Owner Revision, same day, Decision 1): that 1:1 shape
--   is REMOVED. `settlement_items` is introduced as a proper junction:
--   Settlement 1:N Settlement Items N:1 Compensation. This is now the
--   authoritative shape — the table hasn't been applied to any real
--   database yet, so this file is rewritten in place rather than patched
--   with a second migration.
--
-- Decision 2 (same Revision): Settlement creation may only select
-- Compensation already in 'Handed Off' status — never 'Confirmed'. This
-- means the Confirmed -> Handed Off transition must happen as ITS OWN,
-- separate step, before any Settlement is created (not as a side effect of
-- creation, which Rev 1's design used). See
-- lib/settlement/settlement.service.ts for the two-step flow this implies
-- (Hand Off pool, then Create Settlement from that pool).
--
-- Decision 5 (same Revision): a Compensation may belong to at most ONE
-- Settlement Item — enforced here via `settlement_items.compensation_id`
-- being UNIQUE, the same "never settle twice" backstop Rev 1's design had,
-- just relocated to the junction table.
--
-- Decision 4 (same Revision): Settlement Total is always
-- SUM(Settlement Items) — deliberately NOT a stored column on `settlements`
-- (nothing to drift out of sync); computed at read time in
-- lib/settlement/settlement.service.ts from the joined Compensation
-- amounts.

BEGIN;

CREATE TABLE IF NOT EXISTS settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  settlement_code text NOT NULL UNIQUE,

  recipient_type text NOT NULL DEFAULT 'Partner',
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,

  -- §7 — business-configurable, no CHECK constraint (Extensibility).
  settlement_method text NOT NULL DEFAULT 'Bank Transfer',

  status text NOT NULL DEFAULT 'Draft',
  requested_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  completed_at timestamptz,
  completed_by text,
  cancelled_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_settlement_code ON settlements(settlement_code);
CREATE INDEX IF NOT EXISTS idx_settlements_partner_id ON settlements(partner_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);

DROP TRIGGER IF EXISTS settlements_set_updated_at ON settlements;
CREATE TRIGGER settlements_set_updated_at
BEFORE UPDATE ON settlements
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON settlements;
CREATE POLICY "Allow full access to anon" ON settlements FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON settlements;
CREATE POLICY "Allow full access to authenticated" ON settlements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- settlement_items — the junction table Decision 1 introduces.
-- ============================================================

CREATE TABLE IF NOT EXISTS settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,

  -- Decision 5: a Compensation may belong to at most one Settlement Item,
  -- system-wide (not just within one Settlement) — UNIQUE across the whole
  -- table, not a composite UNIQUE(settlement_id, compensation_id).
  compensation_id uuid NOT NULL UNIQUE REFERENCES compensations(id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement_id ON settlement_items(settlement_id);

ALTER TABLE settlement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON settlement_items;
CREATE POLICY "Allow full access to anon" ON settlement_items FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON settlement_items;
CREATE POLICY "Allow full access to authenticated" ON settlement_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Permissions (docs/14_SETTLEMENT_SPEC.md §12, LOCKED). Seeded UNGRANTED —
-- no hardcoded role mapping, per the precedent set by Partner Center's own
-- Product Owner Revision 2026-07-31, Decision 5.
INSERT INTO permissions (permission_key, resource, action) VALUES
  ('settlement.view', 'settlement', 'view'),
  ('settlement.manage', 'settlement', 'manage')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('settlements', 'settlement_items');
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'settlements' ORDER BY ordinal_position;
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'settlement_items' ORDER BY ordinal_position;
-- SELECT conname FROM pg_constraint WHERE conrelid = 'settlement_items'::regclass AND contype = 'u'; -- expect compensation_id
-- SELECT permission_key FROM permissions WHERE resource = 'settlement' ORDER BY permission_key;
