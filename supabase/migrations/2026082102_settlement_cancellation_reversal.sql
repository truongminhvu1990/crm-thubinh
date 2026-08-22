-- Settlement Cancellation Reversal (Finance Project #1 — Money & Debt,
-- Phase B) — Product Owner Approval, 2026-08-21. Closes the known
-- limitation stated in the original cancelSettlement() implementation
-- (2026081301_settlement_module.sql): cancelling a Settlement left every
-- member Compensation permanently stuck at 'Handed Off', unrecoverable.
--
-- Business rules (Option B, Product Owner-locked):
--   1. A member Compensation not yet Paid (i.e. still 'Handed Off' at the
--      moment of cancellation — the only status a member of a Draft/
--      Pending/Approved Settlement can ever be in) is reverted to
--      'Confirmed', freeing it to be handed off into a different Settlement
--      later. History is preserved, never deleted.
--   2. A Compensation already 'Paid' is structurally impossible to reach
--      here: Paid only exists on a Settlement that has already reached
--      'Completed' (mark_settlement_paid(), Phase A), and this function
--      only accepts Draft/Pending/Approved settlements — a Completed/Paid
--      Settlement can never be cancelled. No runtime check "skips Paid";
--      it is simply unreachable by construction, matching the Product
--      Owner's own "Handed-Off/Paid financial history must never be
--      silently modified" instruction without adding a redundant guard.
--   3. Cancellation is atomic (one function body, one Postgres transaction,
--      no EXCEPTION-catching block) and safe against double-cancellation
--      (the status guard runs before any write; a second call on an
--      already-Cancelled settlement is rejected before touching anything).
--
-- Schema Protection (Product Owner instruction, unchanged from Phase A):
-- does NOT modify orders, payments, money_debt_ledger_entries,
-- operating_expenses, or sales_commissions. No new payable/ledger table —
-- this reuses the existing settlements/compensations/settlement_items
-- schema exactly, adding one boolean column.
--
-- Write-path pattern mirrors mark_settlement_paid() exactly (same reasoning
-- as that migration's own header comment): this project has schema-level
-- default privileges that auto-grant EXECUTE on every new function to
-- anon/authenticated/service_role (root-caused in
-- 2026081715_money_debt_ledger_execute_privilege_fix.sql) — since this
-- function has no other gate once granted, it is SECURITY DEFINER, keyed
-- off a trusted-server-asserted p_staff_id, independently re-verifying
-- settlement.manage, and reachable only via service_role (never
-- anon/authenticated). No new permission key — reuses settlement.manage,
-- same as every other Settlement action.

BEGIN;

-- ============================================================
-- 1. settlement_items.is_active — Decision 5's original UNIQUE(
--    compensation_id) meant a Compensation could belong to at most one
--    Settlement Item EVER, system-wide, even after that Settlement Item's
--    own parent Settlement was cancelled — the exact bug this migration
--    fixes. Replacing the plain UNIQUE with a partial unique index scoped
--    to is_active preserves the "at most one ACTIVE claim" rule while
--    letting a reverted Compensation be claimed again by a future
--    Settlement Item. The now-inactive row itself is never deleted — full
--    history of which Compensations were originally bundled into a
--    cancelled Settlement remains queryable.
-- ============================================================

ALTER TABLE settlement_items ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE settlement_items DROP CONSTRAINT IF EXISTS settlement_items_compensation_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS settlement_items_compensation_id_active_key
  ON settlement_items(compensation_id) WHERE is_active;

-- ============================================================
-- 2. RLS — settlement_items previously had one blanket "Allow full access"
--    FOR ALL policy per role (2026081301). Split so SELECT/INSERT/DELETE
--    are unchanged (no existing legitimate caller writes is_active today —
--    createSettlement's own INSERT relies on the column default, never
--    sets it explicitly), and UPDATE gets a WITH CHECK that rejects any
--    direct client write landing is_active=false. cancel_settlement_with_
--    reversal() runs as service_role, which bypasses RLS entirely by
--    default — same mechanism the Phase A Paid-transition guard and Money
--    & Debt Ledger's own write functions already rely on — so this only
--    ever blocks a direct client-side call, never the governed RPC path.
-- ============================================================

DROP POLICY IF EXISTS "Allow full access to authenticated" ON settlement_items;
CREATE POLICY "Allow authenticated select" ON settlement_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON settlement_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update except direct deactivation" ON settlement_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (is_active);
CREATE POLICY "Allow authenticated delete" ON settlement_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow full access to anon" ON settlement_items;
CREATE POLICY "Allow anon select" ON settlement_items FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert" ON settlement_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update except direct deactivation" ON settlement_items
  FOR UPDATE TO anon USING (true) WITH CHECK (is_active);
CREATE POLICY "Allow anon delete" ON settlement_items FOR DELETE TO anon USING (true);

-- ============================================================
-- 3. cancel_settlement_with_reversal — the only path that can ever set
--    settlements.status='Cancelled' via this reversal-aware flow (plain
--    'Cancelled' as a bare status value is not itself newly restricted —
--    this function is simply the only place that ALSO performs the
--    reversal cascade correctly, so the application's cancelSettlement()
--    service function is updated to call this instead of a bare UPDATE).
--    Draft/Pending/Approved -> Cancelled only. Reverts every member
--    Compensation still 'Handed Off' -> 'Confirmed' and deactivates its
--    settlement_items row, inside the SAME function body (one Postgres
--    transaction) — no partial-cascade state is reachable.
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_settlement_with_reversal(
  p_staff_id uuid,
  p_settlement_id uuid
)
RETURNS settlements
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_row settlements;
  v_comp_id uuid;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: a staff id is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: staff % not found', p_staff_id USING ERRCODE = '42501';
  END IF;
  IF NOT settlement_staff_has_permission(p_staff_id, 'settlement.manage') THEN
    RAISE EXCEPTION 'Forbidden: settlement.manage permission required' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status FROM settlements WHERE id = p_settlement_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Settlement % not found', p_settlement_id;
  END IF;
  -- Idempotency/double-cancel safety: this check runs before any write, so
  -- a second call against an already-Cancelled (or any terminal) Settlement
  -- is rejected outright — it can never re-run the reversal cascade or
  -- touch a Compensation a second time.
  IF v_status NOT IN ('Draft', 'Pending', 'Approved') THEN
    RAISE EXCEPTION 'Cannot cancel from status "%": only Draft/Pending/Approved settlements can be cancelled', v_status;
  END IF;

  UPDATE settlements
  SET status = 'Cancelled', cancelled_at = now()
  WHERE id = p_settlement_id
  RETURNING * INTO v_row;

  -- Reversal cascade — scoped to is_active settlement_items rows whose
  -- compensation is still 'Handed Off'. A Paid compensation can never
  -- match this WHERE clause (see this migration's header comment on why
  -- that's structurally guaranteed, not merely filtered here).
  FOR v_comp_id IN
    SELECT si.compensation_id
    FROM settlement_items si
    JOIN compensations c ON c.id = si.compensation_id
    WHERE si.settlement_id = p_settlement_id
      AND si.is_active
      AND c.status = 'Handed Off'
  LOOP
    UPDATE compensations SET status = 'Confirmed' WHERE id = v_comp_id;
    INSERT INTO activity_logs (staff_id, action, entity, entity_id)
    VALUES (p_staff_id, 'compensation_reverted_to_confirmed', 'compensation', v_comp_id);
  END LOOP;

  UPDATE settlement_items SET is_active = false WHERE settlement_id = p_settlement_id AND is_active;

  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (p_staff_id, 'settlement_cancelled', 'settlement', p_settlement_id);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION cancel_settlement_with_reversal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_settlement_with_reversal(uuid, uuid) TO service_role;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'settlement_items' AND column_name = 'is_active';
-- SELECT conname FROM pg_constraint WHERE conrelid = 'settlement_items'::regclass AND contype = 'u'; -- expect 0 rows (the old full-table UNIQUE is gone)
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'settlement_items' AND indexname = 'settlement_items_compensation_id_active_key'; -- expect a partial UNIQUE INDEX ... WHERE is_active
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'settlement_items' ORDER BY cmd;
-- SELECT p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') FROM pg_proc p CROSS JOIN pg_roles r WHERE p.proname = 'cancel_settlement_with_reversal' AND r.rolname IN ('anon','authenticated','service_role','public'); -- expect FALSE for anon/authenticated/public, TRUE for service_role
-- Manual negative check (Dev only, anon key, no session): supabase.rpc('cancel_settlement_with_reversal', {...}) must be rejected at the privilege layer.
-- Manual negative check (Dev only, direct client, authenticated session): supabase.from('settlement_items').update({is_active:false}).eq('id', ...) must be rejected by RLS.
-- Manual end-to-end check (Dev only): create a Settlement with >=1 Handed Off compensation, cancel it, confirm settlement.status='Cancelled', every member compensation that was 'Handed Off' is back to 'Confirmed', its settlement_items row has is_active=false, and that same compensation can now be handed off again and included in a brand-new Settlement.
-- Manual idempotency check (Dev only): call cancel_settlement_with_reversal a second time on the same (now Cancelled) settlement id — confirm it raises the "Cannot cancel from status" exception and does not touch any compensation a second time.
