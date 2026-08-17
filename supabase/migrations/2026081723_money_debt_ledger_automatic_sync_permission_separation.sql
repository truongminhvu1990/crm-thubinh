-- Stage 19C (Product Owner "IMPLEMENT AUTOMATIC SYNC PERMISSION SEPARATION",
-- 2026-08-17) — Option A from Stage 19B Phase 12, DEV ONLY.
--
-- Separates two distinct authorizations that were previously conflated:
--   1. Manual Money/Debt ledger operation      -> money_debt_ledger.create
--   2. Automatic Payment -> Money/Debt sync    -> orders.record_payment
--      (re-verified independently at the DB level, not merely trusted from
--      the Next.js layer that already checked it before ever reaching here)
--
-- Boundary preserved exactly as specified:
--   - create_money_debt_ledger_entry()'s DEFAULT behavior (every existing
--     caller, including the manual create_money_debt_ledger_entry.
--     TypeScript wrapper `createLedgerEntry()` used by
--     POST /api/money-debt-ledger) is completely unchanged — it still
--     requires money_debt_ledger.create, exactly as before.
--   - The new p_internal_skip_create_permission_check parameter is NOT
--     added to CreateMoneyDebtLedgerEntryInput / createLedgerEntry() in the
--     TypeScript layer (see the accompanying code diff) — there is no
--     public API parameter, no client-controllable "bypass=true", nothing
--     reachable from the browser. It is set to TRUE in exactly one place
--     in the entire codebase: sync_payment_to_money_debt_ledger()'s own
--     internal, function-to-function call below, after that function has
--     independently re-verified orders.record_payment for the same
--     p_staff_id. EXECUTE on every function in this file remains
--     service_role-only, same as every write path in this module.
--   - No SQL grant to any role. No role_permissions row touched by this
--     migration. Production is untouched — this file is applied to Dev
--     only by this stage's own explicit instruction.
--   - Audit trail unchanged: create_money_debt_ledger_entry() still writes
--     its own activity_logs row on every insert, regardless of which
--     permission path authorized the call.

-- ============================================================================
-- 1. create_money_debt_ledger_entry — DROP+CREATE to add one new optional,
--    trailing, internal-only parameter. Every other line is unchanged from
--    the Stage 19B (2026081722) version.
-- ============================================================================

DROP FUNCTION create_money_debt_ledger_entry(uuid, text, uuid, text, text, numeric, text, date, uuid, uuid, text, text, uuid);

CREATE FUNCTION public.create_money_debt_ledger_entry(
  p_staff_id uuid,
  p_transaction_type text,
  p_party_id uuid,
  p_party_type text,
  p_currency text,
  p_amount numeric,
  p_direction text DEFAULT NULL::text,
  p_transaction_date date DEFAULT CURRENT_DATE,
  p_linked_payment_id uuid DEFAULT NULL::uuid,
  p_linked_order_id uuid DEFAULT NULL::uuid,
  p_reference text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_corrects_entry_id uuid DEFAULT NULL::uuid,
  -- Stage 19C — internal-only. Never set by createLedgerEntry() (the
  -- manual-creation TypeScript wrapper), never accepted from any request
  -- body, never documented as a public parameter. The single legitimate
  -- caller is sync_payment_to_money_debt_ledger() below, which has already
  -- independently verified orders.record_payment for this exact p_staff_id
  -- before setting this to TRUE. Anyone else calling this function (there
  -- is no one else, since EXECUTE is service_role-only) gets the normal,
  -- unweakened money_debt_ledger.create check.
  p_internal_skip_create_permission_check boolean DEFAULT false
)
 RETURNS money_debt_ledger_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_direction text;
  v_sequence integer;
  v_code text;
  v_payment_amount numeric;
  v_already_reconciled numeric;
  v_row money_debt_ledger_entries;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: a staff id is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: staff % not found', p_staff_id USING ERRCODE = '42501';
  END IF;
  IF NOT p_internal_skip_create_permission_check THEN
    IF NOT money_debt_ledger_staff_has_permission(p_staff_id, 'money_debt_ledger.create') THEN
      RAISE EXCEPTION 'Forbidden: money_debt_ledger.create permission required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_transaction_type = 'Buy CNY' THEN
    RAISE EXCEPTION 'Buy CNY must be created via create_buy_cny_ledger_transaction(), not this function';
  END IF;

  v_direction := CASE p_transaction_type
    WHEN 'Customer Payment TECH_H' THEN 'IN'
    WHEN 'CNY Held By Supplier' THEN 'IN'
    WHEN 'Deposit' THEN 'IN'
    WHEN 'Deposit Consumed' THEN 'OUT'
    WHEN 'Supplier Payment' THEN 'OUT'
    ELSE p_direction -- 'VND Held By Money Changer' / 'Adjustment' — caller-specified
  END;

  IF v_direction IS NULL OR v_direction NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'A valid direction (IN/OUT) is required for transaction_type %', p_transaction_type;
  END IF;

  IF p_transaction_type = 'Customer Payment TECH_H' THEN
    IF p_linked_payment_id IS NULL THEN
      RAISE EXCEPTION 'linked_payment_id is required for Customer Payment TECH_H';
    END IF;

    SELECT amount INTO v_payment_amount FROM payments WHERE id = p_linked_payment_id;
    IF v_payment_amount IS NULL THEN
      RAISE EXCEPTION 'Payment % not found', p_linked_payment_id;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_already_reconciled
    FROM money_debt_ledger_entries
    WHERE linked_payment_id = p_linked_payment_id
      AND transaction_type = 'Customer Payment TECH_H';

    IF v_already_reconciled + p_amount > v_payment_amount THEN
      RAISE EXCEPTION 'Reconciling % would exceed Payment %''s own amount (% already reconciled of %)',
        p_amount, p_linked_payment_id, v_already_reconciled, v_payment_amount;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_sequence
  FROM money_debt_ledger_entries
  WHERE entry_code LIKE 'MDL-' || to_char(now(), 'YYYYMMDD') || '-%';
  v_code := 'MDL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_sequence + 1)::text, 6, '0');

  INSERT INTO money_debt_ledger_entries (
    entry_code, transaction_date, transaction_type, party_type, party_id,
    currency, amount, direction, linked_payment_id, linked_order_id,
    reference, note, created_by, corrects_entry_id
  ) VALUES (
    v_code, p_transaction_date, p_transaction_type, p_party_type, p_party_id,
    p_currency, p_amount, v_direction, p_linked_payment_id, p_linked_order_id,
    p_reference, p_note, p_staff_id, p_corrects_entry_id
  )
  RETURNING * INTO v_row;

  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (p_staff_id, 'money_debt_ledger_entry_created', 'money_debt_ledger', v_row.id);

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_money_debt_ledger_entry(uuid, text, uuid, text, text, numeric, text, date, uuid, uuid, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_money_debt_ledger_entry(uuid, text, uuid, text, text, numeric, text, date, uuid, uuid, text, text, uuid, boolean) TO service_role;

-- ============================================================================
-- 2. sync_payment_to_money_debt_ledger — now independently re-verifies
--    orders.record_payment for p_staff_id (the new authorization boundary
--    for automatic sync) instead of relying on create_money_debt_ledger_
--    entry()'s money_debt_ledger.create check, then calls that function
--    with the internal skip flag set. Eligibility logic (Stage 19A,
--    unchanged) still runs first — an ineligible payment still returns
--    NULL before any permission check, same as before.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_payment_to_money_debt_ledger(p_staff_id uuid, p_payment_id uuid)
 RETURNS money_debt_ledger_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment RECORD;
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

  -- Phase 1 condition 3 / Phase 5: eligibility comes from the data
  -- relationship only.
  SELECT money_changer_partner_id
    INTO v_money_changer_id
    FROM receiving_accounts
    WHERE id = v_payment.receiving_account_id;

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

-- Grants unchanged (service_role-only) — DROP not needed since the
-- signature (uuid, uuid) is unchanged, CREATE OR REPLACE above suffices.

-- ============================================================================
-- 3. create_payment_with_ledger_sync — adds its own independent
--    orders.record_payment check before inserting the payment row, so the
--    payment write itself is defended at the DB level the same way every
--    other governed write in this module is (not solely trusted from the
--    Next.js layer, which already checks this before calling in — this is
--    defense-in-depth, matching create_buy_cny_ledger_transaction's own
--    precedent of re-verifying what the app layer already verified).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_payment_with_ledger_sync(p_staff_id uuid, p_order_id uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_note text DEFAULT NULL::text, p_receiving_account_id uuid DEFAULT NULL::uuid)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment payments;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: a staff id is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: staff % not found', p_staff_id USING ERRCODE = '42501';
  END IF;
  IF NOT money_debt_ledger_staff_has_permission(p_staff_id, 'orders.record_payment') THEN
    RAISE EXCEPTION 'Forbidden: orders.record_payment permission required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO payments (order_id, amount, payment_method, payment_date, note, receiving_account_id)
  VALUES (p_order_id, p_amount, p_payment_method, p_payment_date, p_note, p_receiving_account_id)
  RETURNING * INTO v_payment;

  -- Same transaction as the INSERT above: any exception raised inside
  -- sync_payment_to_money_debt_ledger propagates out of this function and
  -- rolls back the payment INSERT too — no orphaned payment can ever exist
  -- with a Money-Changer-linked receiving account and no matching ledger
  -- entry.
  PERFORM sync_payment_to_money_debt_ledger(p_staff_id, v_payment.id);

  RETURN v_payment;
END;
$function$;

-- Grants unchanged (service_role-only) — signature unchanged.
