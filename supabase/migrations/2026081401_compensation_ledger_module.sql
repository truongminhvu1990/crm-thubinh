-- Compensation Ledger (docs/15_COMPENSATION_LEDGER_SPEC.md, LOCKED Rev 2) —
-- Product Owner Implementation Task 2026-07-31.
--
-- Scope: ONE new table (`compensation_ledger_entries`) plus 2 new
-- permission rows, plus ONE new database trigger ON `settlements`. Does
-- NOT modify Settlement's or Compensation's own tables, columns, RLS
-- policies, or application code in any way.
--
-- ============================================================
-- Mechanism note, read before anything else: why a DB trigger.
-- ============================================================
-- §11 (LOCKED) is explicit: "there is no user-facing management action for
-- any permission to gate" — Ledger Entries are created automatically upon
-- Settlement reaching Completed, never by any direct user action. No
-- `compensation_ledger.create`/`manage` permission exists at all (by
-- design, per the spec). Combined with this task's own "Do NOT modify
-- Settlement," the usual pattern used everywhere else in this project so
-- far (Order calls into Compensation's service; Settlement calls into
-- Compensation's service) is unavailable here — that pattern requires
-- editing the *upstream* module's own existing function
-- (lib/settlement/settlement.service.ts's completeSettlement), which is
-- exactly what's forbidden. A staff-initiated action (the pattern used for
-- Settlement's own Hand-Off step) is also unavailable — there is no
-- permission to gate a manual trigger, and the spec explicitly rules one
-- out. The only mechanism left that is genuinely automatic AND never
-- touches Settlement's own application code is a **database trigger** on
-- `settlements` itself: real, live, event-driven automation at the schema
-- layer, not a simulated/manual stand-in. This is a deliberate departure
-- from this project's usual "direct synchronous call" realization of
-- Business Event Subscription — flagged here and in the delivery report,
-- not hidden.
--
-- Granularity: ONE Ledger Entry per completed Settlement (not per
-- Settlement Item) — matches Ledger Detail's own "Settlement Reference"
-- (singular) plus a drill-through to that Settlement's own Items, rather
-- than one entry per item. Entry Amount = the Settlement's own Total
-- (SUM of its Settlement Items, docs/14_SETTLEMENT_SPEC.md §6 Revision 4).
--
-- Immutability (§3, §11, LOCKED): no UPDATE or DELETE policy is granted to
-- any role, and the trigger function is SECURITY DEFINER so it can insert
-- regardless of which role's session performs the Settlement UPDATE —
-- meaning the trigger is the ONLY path that can ever write a row here.
-- Application code (lib/compensationLedger/*) is read-only by construction,
-- not just by convention.

BEGIN;

CREATE TABLE IF NOT EXISTS compensation_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  ledger_entry_code text NOT NULL UNIQUE,

  recipient_type text NOT NULL DEFAULT 'Partner',
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,

  settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,

  -- §6: "An Adjustment is represented as a new Ledger Entry" — the value
  -- other than 'Settlement' this column would carry, if an Adjustment
  -- mechanism is ever built. Not designed or triggered by anything in this
  -- migration; every entry this trigger produces is 'Settlement'.
  entry_type text NOT NULL DEFAULT 'Settlement',

  entry_amount numeric NOT NULL,
  -- §7: derived at write time from this same Recipient's prior Entries —
  -- never recalculated afterward, never independently edited.
  running_balance numeric NOT NULL,

  entry_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
  -- No updated_at column — nothing here is ever updated (§3 Append-only).
);

CREATE INDEX IF NOT EXISTS idx_compensation_ledger_entries_partner_id ON compensation_ledger_entries(partner_id);
CREATE INDEX IF NOT EXISTS idx_compensation_ledger_entries_settlement_id ON compensation_ledger_entries(settlement_id);
CREATE INDEX IF NOT EXISTS idx_compensation_ledger_entries_created_at ON compensation_ledger_entries(created_at);

-- RLS: read-only for every application role. Deliberately NOT the "Allow
-- full access" pattern used everywhere else in this schema — Ledger's own
-- immutability rule is a Business Rule, not just an application-layer
-- convention, so it's enforced here too. No INSERT/UPDATE/DELETE policy is
-- granted to anon or authenticated — the trigger's SECURITY DEFINER
-- function is the only way a row is ever written.
ALTER TABLE compensation_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read to anon" ON compensation_ledger_entries;
CREATE POLICY "Allow read to anon" ON compensation_ledger_entries FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow read to authenticated" ON compensation_ledger_entries;
CREATE POLICY "Allow read to authenticated" ON compensation_ledger_entries FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Trigger: consumes "Settlement Completed" (docs/14_SETTLEMENT_SPEC.md §8,
-- §9) the moment `settlements.status` transitions to 'Completed'.
-- ============================================================

CREATE OR REPLACE FUNCTION record_compensation_ledger_entry()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric;
  v_prev_balance numeric;
  v_sequence integer;
  v_code text;
  v_new_id uuid;
BEGIN
  IF NEW.status = 'Completed' AND (OLD.status IS DISTINCT FROM 'Completed') THEN
    SELECT COALESCE(SUM(c.calculated_amount), 0) INTO v_total
    FROM settlement_items si
    JOIN compensations c ON c.id = si.compensation_id
    WHERE si.settlement_id = NEW.id;

    SELECT running_balance INTO v_prev_balance
    FROM compensation_ledger_entries
    WHERE partner_id = NEW.partner_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
    v_prev_balance := COALESCE(v_prev_balance, 0);

    SELECT COUNT(*) INTO v_sequence
    FROM compensation_ledger_entries
    WHERE ledger_entry_code LIKE 'LEDG-' || to_char(now(), 'YYYYMMDD') || '-%';
    v_code := 'LEDG-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_sequence + 1)::text, 6, '0');

    INSERT INTO compensation_ledger_entries
      (id, ledger_entry_code, recipient_type, partner_id, settlement_id, entry_type, entry_amount, running_balance)
    VALUES
      (gen_random_uuid(), v_code, 'Partner', NEW.partner_id, NEW.id, 'Settlement', v_total, v_prev_balance + v_total)
    RETURNING id INTO v_new_id;

    -- Timeline entry, same activity_logs table every other module's own
    -- Timeline reads from (lib/activityLog.service.ts getActivityLogsByEntity).
    INSERT INTO activity_logs (staff_id, action, entity, entity_id)
    VALUES (NULL, 'ledger_entry_created', 'compensation_ledger', v_new_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settlements_record_ledger_entry ON settlements;
CREATE TRIGGER settlements_record_ledger_entry
AFTER UPDATE ON settlements
FOR EACH ROW EXECUTE FUNCTION record_compensation_ledger_entry();

-- ============================================================
-- Permissions (docs/15_COMPENSATION_LEDGER_SPEC.md §11, LOCKED). Seeded
-- UNGRANTED — no hardcoded role mapping, per the precedent set by Partner
-- Center's own Product Owner Revision 2026-07-31, Decision 5. Note: view
-- and export ONLY — no create/update/delete/manage exists for this
-- resource at all, per the spec's own explicit decision.
-- ============================================================

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('compensation_ledger.view', 'compensation_ledger', 'view'),
  ('compensation_ledger.export', 'compensation_ledger', 'export')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'compensation_ledger_entries';
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'compensation_ledger_entries' ORDER BY ordinal_position;
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'compensation_ledger_entries'; -- expect exactly 2 rows, both SELECT
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'settlements'::regclass AND tgname = 'settlements_record_ledger_entry';
-- SELECT permission_key FROM permissions WHERE resource = 'compensation_ledger' ORDER BY permission_key;
-- Manual end-to-end check (run in Dev only): complete a Settlement (status -> Completed) and confirm exactly one new compensation_ledger_entries row appears with running_balance = previous balance + this settlement's own total_amount.
