-- Stage 21D (Product Owner "PRODUCTION AUTO-SYNC ACTIVE RECEIVING ACCOUNT
-- GUARD", 2026-08-17) — DEV ONLY.
--
-- Finding from Stage 21C's live Production verification: the automatic
-- Payment -> Money/Debt sync derives eligibility purely from
-- receiving_account_id -> money_changer_partner_id, and never checked
-- receiving_accounts.is_active. A payment pointed at a deactivated
-- (retired) receiving account would still silently sync to the ledger as
-- if that account were live — a real gap, not by original design (the
-- "derive purely from the data relationship, never payment_method text"
-- principle from Stage 19A never said anything about ignoring is_active;
-- is_active simply wasn't checked at all).
--
-- Fix: CREATE OR REPLACE sync_payment_to_money_debt_ledger() — byte-
-- identical to the version this migration replaces (2026081723's), except
-- for one inserted block. Every other line, every other check, the
-- permission boundary, the idempotency fast path, the unique-violation
-- retry, create_money_debt_ledger_entry()'s call shape (including the
-- internal-skip-permission-check flag) — all unchanged.
--
-- Behavior added: an existing receiving_accounts row with is_active=false
-- is now a hard REJECT (RAISE EXCEPTION), not a silent RETURN NULL like
-- every other "not eligible" condition in this function. This is a
-- deliberate distinction — selecting a genuinely nonexistent receiving
-- account id, or one with no Money Changer association, are both valid
-- "nothing to sync" states (a payment can still go through fine without
-- automatic ledger tracking); explicitly targeting a *retired* account is
-- treated as an error, since it almost certainly means the wrong account
-- was selected. Because create_payment_with_ledger_sync() calls this
-- function with a plain PERFORM (no exception handler), this exception
-- propagates out and rolls back the payment INSERT in the same
-- transaction — atomicity is unchanged, no orphan payment can ever be
-- created for an inactive-account attempt.
--
-- Error message is a controlled business string
-- ("Receiving Account is inactive / Tài khoản nhận tiền đang tạm ngưng."),
-- never a raw Postgres constraint message — surfaced via
-- lib/orders/order.repository.ts's existing OrderRepositoryError wrapping,
-- same shape as this function's own other RAISE EXCEPTION calls.
--
-- No table/column change. No RLS change. No grant change (EXECUTE stays
-- service_role-only, unchanged since the function signature is identical).
-- No permission architecture change (Stage 19C's Option A, orders.
-- record_payment authorization, and the internal-skip-permission-check
-- flag are all untouched). No TECH_H change. No Supplier Payment change.
-- No correction/immutability change.

CREATE OR REPLACE FUNCTION public.sync_payment_to_money_debt_ledger(p_staff_id uuid, p_payment_id uuid)
 RETURNS money_debt_ledger_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment RECORD;
  v_receiving_account RECORD;
  v_money_changer_id uuid;
  v_existing money_debt_ledger_entries;
  v_new money_debt_ledger_entries;
BEGIN
  SELECT id, amount, payment_date, order_id, receiving_account_id
    INTO v_payment
    FROM payments
    WHERE id = p_payment_id;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  -- Phase 1 condition 2: must have a receiving account at all.
  IF v_payment.receiving_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Stage 21D — fetch the receiving account's own row (was previously
  -- just money_changer_partner_id) so is_active can be checked before
  -- eligibility is derived from it.
  SELECT id, is_active, money_changer_partner_id
    INTO v_receiving_account
    FROM receiving_accounts
    WHERE id = v_payment.receiving_account_id;

  -- A nonexistent receiving_account_id is still a silent no-op — unchanged
  -- from before, not part of this stage's scope.
  IF v_receiving_account.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Stage 21D — the new guard. An inactive (retired) receiving account is
  -- a hard reject, not a silent skip.
  IF NOT v_receiving_account.is_active THEN
    RAISE EXCEPTION 'Receiving Account is inactive / Tài khoản nhận tiền đang tạm ngưng.' USING ERRCODE = '23514';
  END IF;

  v_money_changer_id := v_receiving_account.money_changer_partner_id;

  -- Phase 1 condition 3 / Phase 5: eligibility comes from the data
  -- relationship only.
  IF v_money_changer_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Phase 1 condition 4 (payments.amount is already CHECK > 0 at the
  -- table level, so this is defensive symmetry, not a new gate).
  IF v_payment.amount IS NULL OR v_payment.amount <= 0 THEN
    RETURN NULL;
  END IF;

  -- Stage 19C — the new authorization boundary for automatic sync. Only
  -- reached once the payment is confirmed eligible (above) — an
  -- ineligible payment never even reaches a permission check, matching
  -- Stage 19A's original "not every payment triggers this" behavior.
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: a staff id is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: staff % not found', p_staff_id USING ERRCODE = '42501';
  END IF;
  IF NOT money_debt_ledger_staff_has_permission(p_staff_id, 'orders.record_payment') THEN
    RAISE EXCEPTION 'Forbidden: orders.record_payment permission required to sync a payment to the Money/Debt ledger' USING ERRCODE = '42501';
  END IF;

  -- Phase 1 condition 5 / Phase 3: idempotency fast path — already synced.
  SELECT *
    INTO v_existing
    FROM money_debt_ledger_entries
    WHERE linked_payment_id = p_payment_id
      AND transaction_type = 'Customer Payment via Money Changer';

  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  BEGIN
    v_new := create_money_debt_ledger_entry(
      p_staff_id,
      'Customer Payment via Money Changer',
      v_money_changer_id,
      'Money Changer',
      'VND',
      v_payment.amount,
      'IN',
      v_payment.payment_date,
      v_payment.id,
      v_payment.order_id,
      NULL,
      NULL,
      NULL,
      -- Stage 19C — the one and only call site in the codebase that ever
      -- sets this to TRUE. Authorization for this write was already
      -- performed two statements above (orders.record_payment), not
      -- skipped — this substitutes one already-verified check for
      -- create_money_debt_ledger_entry()'s own default check, it does not
      -- remove authorization entirely.
      true
    );
    RETURN v_new;
  EXCEPTION WHEN unique_violation THEN
    SELECT *
      INTO v_existing
      FROM money_debt_ledger_entries
      WHERE linked_payment_id = p_payment_id
        AND transaction_type = 'Customer Payment via Money Changer';
    RETURN v_existing;
  END;
END;
$function$;

-- Signature unchanged (uuid, uuid) — no DROP needed, no grant change.
