-- Settlement Paid (Finance Project #1 — Money & Debt, Phase A) — Product
-- Owner Approval, 2026-08-21. Adds a `Paid` terminal state to Settlement,
-- reached only from Completed, cascading every member Compensation still
-- Handed Off -> Paid in the same transaction — proving
-- Compensation -> Handed Off -> Paid -> Payment Reference so reporting can
-- distinguish earned/pending, handed off, and actually paid.
--
-- Schema Protection (Product Owner instruction): does NOT touch orders,
-- payments, money_debt_ledger_entries, operating_expenses, or
-- sales_commissions. No new parallel ledger table.
--
-- Write-path pattern mirrors Money & Debt Ledger's own governed RPC design
-- exactly, post-privilege-fix (2026081715_money_debt_ledger_execute_
-- privilege_fix.sql): a SECURITY DEFINER function callable only via
-- service_role (never anon/authenticated), taking a trusted-server-asserted
-- p_staff_id (already requirePermission()-checked by the Next.js route) and
-- independently re-verifying settlement.manage before writing anything. No
-- new permission key — reuses settlement.manage, the same permission the
-- existing submit/approve/complete/cancel actions already require.
--
-- Scope: 4 new columns on `settlements`, 1 new column on `compensations`,
-- CHECK constraints added to both status columns (previously
-- unconstrained plain text since 2026081201/2026081301 — purely additive,
-- every existing row's status already conforms), 1 new authorization
-- helper function, 1 new RPC (mark_settlement_paid), RLS tightened on both
-- tables so `authenticated`/`anon` can never set status='Paid' via a direct
-- client-side UPDATE — the state machine can only reach Paid through this
-- RPC. As a side effect, this also makes any row already at status='Paid'
-- immutable to direct client UPDATE (any resulting row with status='Paid'
-- fails the WITH CHECK, regardless of which column changed) — Handed-
-- Off/Paid financial history staying un-silently-modifiable is exactly the
-- property Phase B's cancellation-reversal design also depends on.

BEGIN;

-- ============================================================
-- 1. New columns
-- ============================================================

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS receiving_account_id uuid REFERENCES receiving_accounts(id) ON DELETE RESTRICT;

ALTER TABLE compensations
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- ============================================================
-- 2. Status CHECK constraints — additive safety net, not a behavior change:
--    every existing row's status already conforms to the sets below.
-- ============================================================

ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_status_check;
ALTER TABLE settlements
  ADD CONSTRAINT settlements_status_check
  CHECK (status IN ('Draft', 'Pending', 'Approved', 'Completed', 'Paid', 'Cancelled'));

ALTER TABLE compensations DROP CONSTRAINT IF EXISTS compensations_status_check;
ALTER TABLE compensations
  ADD CONSTRAINT compensations_status_check
  CHECK (status IN ('Draft', 'Pending', 'Confirmed', 'Cancelled', 'Handed Off', 'Paid'));

-- ============================================================
-- 3. RLS tightening — every other column/transition on both tables is
--    unchanged (still full access to authenticated/anon, matching every
--    other write path these two tables already support); only a direct
--    UPDATE landing status='Paid' is rejected. service_role (what the RPC
--    below runs as) bypasses RLS entirely by default in Postgres/Supabase —
--    the same mechanism Money & Debt Ledger's own write functions rely on —
--    so this restriction only ever blocks a direct client-side call, never
--    the governed RPC path.
-- ============================================================

DROP POLICY IF EXISTS "Allow full access to authenticated" ON settlements;
CREATE POLICY "Allow authenticated select" ON settlements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON settlements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update except direct Paid transition" ON settlements
  FOR UPDATE TO authenticated USING (true) WITH CHECK (status <> 'Paid');
CREATE POLICY "Allow authenticated delete" ON settlements FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow full access to anon" ON settlements;
CREATE POLICY "Allow anon select" ON settlements FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert" ON settlements FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update except direct Paid transition" ON settlements
  FOR UPDATE TO anon USING (true) WITH CHECK (status <> 'Paid');
CREATE POLICY "Allow anon delete" ON settlements FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON compensations;
CREATE POLICY "Allow authenticated select" ON compensations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON compensations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update except direct Paid transition" ON compensations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (status <> 'Paid');
CREATE POLICY "Allow authenticated delete" ON compensations FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow full access to anon" ON compensations;
CREATE POLICY "Allow anon select" ON compensations FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert" ON compensations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update except direct Paid transition" ON compensations
  FOR UPDATE TO anon USING (true) WITH CHECK (status <> 'Paid');
CREATE POLICY "Allow anon delete" ON compensations FOR DELETE TO anon USING (true);

-- ============================================================
-- 4. Authorization helper — module-scoped (matches the project's own
--    per-module naming convention, e.g. money_debt_ledger_*), same shape as
--    money_debt_ledger_staff_has_permission(p_staff_id, p_permission_key)
--    post-2026081715: trusted p_staff_id, no auth.uid() resolution
--    (service_role calls carry no end-user session for auth.uid() to
--    resolve).
-- ============================================================

CREATE OR REPLACE FUNCTION settlement_staff_has_permission(p_staff_id uuid, p_permission_key text)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM staff s
    JOIN roles rl ON rl.id = COALESCE(
      s.role_id,
      (SELECT id FROM roles WHERE role_key = s.role AND is_active LIMIT 1)
    )
    JOIN role_permissions rp ON rp.role_id = rl.id
    JOIN permissions perm ON perm.id = rp.permission_id
    WHERE s.id = p_staff_id
      AND rl.is_active
      AND perm.permission_key = p_permission_key
      AND perm.is_active
  );
$$;

REVOKE ALL ON FUNCTION settlement_staff_has_permission(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settlement_staff_has_permission(uuid, text) TO service_role;

-- ============================================================
-- 5. mark_settlement_paid — the only path that can ever set
--    settlements.status='Paid' or compensations.status='Paid'. Completed ->
--    Paid only. Cascades every member Compensation still Handed Off ->
--    Paid inside the SAME function body (one Postgres transaction), so a
--    Settlement can never end up Paid while a member Compensation is left
--    behind at Handed Off — no partial-cascade state is reachable.
-- ============================================================

CREATE OR REPLACE FUNCTION mark_settlement_paid(
  p_staff_id uuid,
  p_settlement_id uuid,
  p_payment_reference text,
  p_receiving_account_id uuid
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
  IF v_status <> 'Completed' THEN
    RAISE EXCEPTION 'Cannot mark as Paid from status "%": only Completed settlements can be marked Paid', v_status;
  END IF;

  IF p_payment_reference IS NULL OR btrim(p_payment_reference) = '' THEN
    RAISE EXCEPTION 'payment_reference is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM receiving_accounts WHERE id = p_receiving_account_id) THEN
    RAISE EXCEPTION 'Receiving account % not found', p_receiving_account_id;
  END IF;

  UPDATE settlements
  SET status = 'Paid',
      paid_at = now(),
      paid_by = p_staff_id,
      payment_reference = p_payment_reference,
      receiving_account_id = p_receiving_account_id
  WHERE id = p_settlement_id
  RETURNING * INTO v_row;

  FOR v_comp_id IN
    SELECT si.compensation_id
    FROM settlement_items si
    JOIN compensations c ON c.id = si.compensation_id
    WHERE si.settlement_id = p_settlement_id
      AND c.status = 'Handed Off'
  LOOP
    UPDATE compensations SET status = 'Paid', paid_at = now() WHERE id = v_comp_id;
    INSERT INTO activity_logs (staff_id, action, entity, entity_id)
    VALUES (p_staff_id, 'compensation_paid', 'compensation', v_comp_id);
  END LOOP;

  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (p_staff_id, 'settlement_paid', 'settlement', p_settlement_id);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION mark_settlement_paid(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_settlement_paid(uuid, uuid, text, uuid) TO service_role;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'settlements' AND column_name IN ('paid_at','paid_by','payment_reference','receiving_account_id');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'compensations' AND column_name = 'paid_at';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'settlements'::regclass AND contype = 'c';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'compensations'::regclass AND contype = 'c';
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename IN ('settlements','compensations') ORDER BY tablename, cmd;
-- SELECT p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') FROM pg_proc p CROSS JOIN pg_roles r WHERE p.proname IN ('mark_settlement_paid','settlement_staff_has_permission') AND r.rolname IN ('anon','authenticated','service_role','public') ORDER BY p.proname, r.rolname; -- expect FALSE for anon/authenticated/public, TRUE for service_role
-- Manual negative check (Dev only, anon key, no session): supabase.rpc('mark_settlement_paid', {...}) must be rejected at the privilege layer (no EXECUTE grant), not merely by the function's own internal check.
-- Manual negative check (Dev only, direct client, authenticated session): supabase.from('settlements').update({status:'Paid'}).eq('id', ...) must be rejected by RLS (no rows updated / permission error), never silently succeed.
-- Manual negative check (Dev only, as a signed-in staff member who does NOT hold settlement.manage): confirm the API route's own requirePermission check rejects first (403); if that were somehow bypassed, the RPC itself raises 'Forbidden: settlement.manage permission required'.
-- Manual end-to-end check (Dev only): complete a Settlement holding >=1 Handed Off compensation, call mark_settlement_paid via the UI's "Mark as Paid" action, confirm settlement.status='Paid' with paid_at/paid_by/payment_reference/receiving_account_id all set, and every member compensation that was 'Handed Off' is now 'Paid' with paid_at set.
