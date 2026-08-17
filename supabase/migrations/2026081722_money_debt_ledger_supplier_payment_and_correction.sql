-- Stage 19B (Product Owner "COMPLETE MONEY/DEBT BUSINESS FLOW", 2026-08-17)
-- DEV ONLY — not applied to Production by this migration file's existence.
--
-- Adds two new capabilities on top of the existing, unmodified Money & Debt
-- Ledger foundation (2026081714/15/16, 2026081721):
--
-- 1. Supplier Payment via Money Changer — a Money Changer's own VND pool
--    (built up by 'Customer Payment via Money Changer' IN rows, §Stage 19)
--    pays a Supplier in CNY. Modeled as a paired transaction, exactly like
--    'Buy CNY' (same transaction_group/fx_rate mechanism, D4 precedent) —
--    one VND OUT row against the Money Changer, one CNY OUT row against the
--    Supplier, so both the VND deduction and the CNY amount stay visible
--    (never collapsing to only one side). Balance is derived the same way
--    it already is everywhere else in this module — Σ IN − Σ OUT per
--    (party_id, currency), live, via the existing getBalance()/
--    getAllBalances() — no new balance column, no consumption-tracking
--    table. Guarded against taking a Money Changer's VND balance negative
--    (Phase 11) unless a future Product Owner decision explicitly
--    authorizes overdraft — none exists today.
--
-- 2. Edit-not-Delete corrections — the ledger stays unconditionally
--    immutable (2026081716's trigger is untouched, still blocks
--    UPDATE/DELETE/TRUNCATE for every role including service_role). A
--    "correction" is a new 'Adjustment' row carrying a `corrects_entry_id`
--    back-reference to the entry it corrects, inheriting that entry's
--    party/currency/linked_payment_id/linked_order_id, and its own
--    IN/OUT-and-amount are the *delta*, not a restated total. Reusing
--    'Adjustment' this way needed exactly one new nullable, purely-additive
--    parameter on create_money_debt_ledger_entry() to store the
--    back-reference at INSERT time (the only time it's settable — there is
--    no UPDATE path, ever) — every existing caller that omits it is
--    byte-for-byte unaffected. A correction that would reduce a Money
--    Changer's balance below zero (e.g. shrinking an IN below what's
--    already been consumed by a Supplier Payment via Money Changer) is
--    rejected, not silently applied — same guard, same reasoning as (1).
--
-- No delete function exists anywhere in this migration or the ones before
-- it, and this migration does not add one — D7 (immutable once created)
-- still holds without exception.

-- ============================================================================
-- 1. corrects_entry_id — self-referencing, nullable, purely additive.
-- ============================================================================

ALTER TABLE money_debt_ledger_entries
  ADD COLUMN corrects_entry_id uuid NULL REFERENCES money_debt_ledger_entries(id) ON DELETE RESTRICT;

COMMENT ON COLUMN money_debt_ledger_entries.corrects_entry_id IS
  'Stage 19B — set only on Adjustment rows created via create_money_debt_ledger_correction(). Points at the entry this row corrects. The original entry is never changed (D7); this is the only mechanism for "editing" a voucher.';

-- ============================================================================
-- 2. Widen the transaction_type / type_shape CHECK constraints for the new
--    paired type, matching 'Buy CNY's own shape exactly (transaction_group +
--    fx_rate required, currency/direction differ per leg so not pinned here).
-- ============================================================================

ALTER TABLE money_debt_ledger_entries
  DROP CONSTRAINT money_debt_ledger_entries_transaction_type_check;

ALTER TABLE money_debt_ledger_entries
  ADD CONSTRAINT money_debt_ledger_entries_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'Customer Payment TECH_H'::text,
    'VND Held By Money Changer'::text,
    'Buy CNY'::text,
    'CNY Held By Supplier'::text,
    'Deposit'::text,
    'Deposit Consumed'::text,
    'Supplier Payment'::text,
    'Adjustment'::text,
    'Customer Payment via Money Changer'::text,
    'Supplier Payment via Money Changer'::text
  ]));

ALTER TABLE money_debt_ledger_entries
  DROP CONSTRAINT money_debt_ledger_type_shape;

ALTER TABLE money_debt_ledger_entries
  ADD CONSTRAINT money_debt_ledger_type_shape
  CHECK (
    ((transaction_type = 'Customer Payment TECH_H'::text) AND (currency = 'VND'::text) AND (direction = 'IN'::text) AND (linked_payment_id IS NOT NULL))
    OR ((transaction_type = 'VND Held By Money Changer'::text) AND (currency = 'VND'::text))
    OR ((transaction_type = 'Buy CNY'::text) AND (transaction_group IS NOT NULL) AND (fx_rate IS NOT NULL))
    OR ((transaction_type = 'CNY Held By Supplier'::text) AND (currency = 'CNY'::text) AND (direction = 'IN'::text))
    OR ((transaction_type = 'Deposit'::text) AND (currency = 'CNY'::text) AND (direction = 'IN'::text))
    OR ((transaction_type = 'Deposit Consumed'::text) AND (currency = 'CNY'::text) AND (direction = 'OUT'::text))
    OR ((transaction_type = 'Supplier Payment'::text) AND (currency = 'CNY'::text) AND (direction = 'OUT'::text))
    OR (transaction_type = 'Adjustment'::text)
    OR ((transaction_type = 'Customer Payment via Money Changer'::text) AND (currency = 'VND'::text) AND (direction = 'IN'::text) AND (linked_payment_id IS NOT NULL))
    OR ((transaction_type = 'Supplier Payment via Money Changer'::text) AND (transaction_group IS NOT NULL) AND (fx_rate IS NOT NULL))
  );

-- ============================================================================
-- 3. create_money_debt_ledger_entry — DROP+CREATE to add one new optional,
--    trailing parameter (p_corrects_entry_id). Every other line is
--    byte-identical to the version created by 2026081714 and left untouched
--    since. Existing callers (createLedgerEntry(), sync_payment_to_money_
--    debt_ledger()) that don't pass this parameter get NULL, same as today.
-- ============================================================================

DROP FUNCTION create_money_debt_ledger_entry(uuid, text, uuid, text, text, numeric, text, date, uuid, uuid, text, text);

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
  p_corrects_entry_id uuid DEFAULT NULL::uuid
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
  IF NOT money_debt_ledger_staff_has_permission(p_staff_id, 'money_debt_ledger.create') THEN
    RAISE EXCEPTION 'Forbidden: money_debt_ledger.create permission required' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.create_money_debt_ledger_entry(uuid, text, uuid, text, text, numeric, text, date, uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_money_debt_ledger_entry(uuid, text, uuid, text, text, numeric, text, date, uuid, uuid, text, text, uuid) TO service_role;

-- ============================================================================
-- 4. create_supplier_payment_via_money_changer — new paired-write RPC.
--    VND OUT leg against the Money Changer, CNY OUT leg against the
--    Supplier, sharing one transaction_group + fx_rate (same structural
--    pattern as create_buy_cny_ledger_transaction). Rejects if the Money
--    Changer's current VND balance can't cover the computed VND amount.
-- ============================================================================

CREATE FUNCTION public.create_supplier_payment_via_money_changer(
  p_staff_id uuid,
  p_money_changer_partner_id uuid,
  p_supplier_partner_id uuid,
  p_cny_amount numeric,
  p_fx_rate numeric,
  p_transaction_date date DEFAULT CURRENT_DATE,
  p_reference text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text
)
 RETURNS SETOF money_debt_ledger_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vnd_amount numeric;
  v_current_balance numeric;
  v_group_sequence integer;
  v_group text;
  v_code_sequence integer;
  v_vnd_code text;
  v_cny_code text;
  v_vnd_row money_debt_ledger_entries;
  v_cny_row money_debt_ledger_entries;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: a staff id is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: staff % not found', p_staff_id USING ERRCODE = '42501';
  END IF;
  IF NOT money_debt_ledger_staff_has_permission(p_staff_id, 'money_debt_ledger.create') THEN
    RAISE EXCEPTION 'Forbidden: money_debt_ledger.create permission required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM partners WHERE id = p_money_changer_partner_id AND partner_type = 'Money Changer') THEN
    RAISE EXCEPTION 'Partner % is not a Money Changer', p_money_changer_partner_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM partners WHERE id = p_supplier_partner_id AND partner_type = 'Supplier') THEN
    RAISE EXCEPTION 'Partner % is not a Supplier', p_supplier_partner_id;
  END IF;

  IF p_cny_amount IS NULL OR p_cny_amount <= 0 THEN
    RAISE EXCEPTION 'CNY amount must be greater than 0';
  END IF;
  IF p_fx_rate IS NULL OR p_fx_rate <= 0 THEN
    RAISE EXCEPTION 'fx_rate must be greater than 0';
  END IF;

  v_vnd_amount := p_cny_amount * p_fx_rate;

  SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0)
    INTO v_current_balance
    FROM money_debt_ledger_entries
    WHERE party_id = p_money_changer_partner_id AND currency = 'VND';

  IF v_current_balance - v_vnd_amount < 0 THEN
    RAISE EXCEPTION 'Insufficient Money Changer VND balance: has %, needs % (CNY % x rate %)',
      v_current_balance, v_vnd_amount, p_cny_amount, p_fx_rate
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(DISTINCT transaction_group) INTO v_group_sequence
  FROM money_debt_ledger_entries
  WHERE transaction_group LIKE 'SPMC-' || to_char(now(), 'YYYYMMDD') || '-%';
  v_group := 'SPMC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_group_sequence + 1)::text, 6, '0');

  SELECT COUNT(*) INTO v_code_sequence
  FROM money_debt_ledger_entries
  WHERE entry_code LIKE 'MDL-' || to_char(now(), 'YYYYMMDD') || '-%';
  v_vnd_code := 'MDL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_code_sequence + 1)::text, 6, '0');
  v_cny_code := 'MDL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_code_sequence + 2)::text, 6, '0');

  INSERT INTO money_debt_ledger_entries (
    entry_code, transaction_date, transaction_type, party_type, party_id,
    currency, amount, direction, transaction_group, fx_rate, reference, note, created_by
  ) VALUES (
    v_vnd_code, p_transaction_date, 'Supplier Payment via Money Changer', 'Money Changer', p_money_changer_partner_id,
    'VND', v_vnd_amount, 'OUT', v_group, p_fx_rate, p_reference, p_note, p_staff_id
  )
  RETURNING * INTO v_vnd_row;

  INSERT INTO money_debt_ledger_entries (
    entry_code, transaction_date, transaction_type, party_type, party_id,
    currency, amount, direction, transaction_group, fx_rate, reference, note, created_by
  ) VALUES (
    v_cny_code, p_transaction_date, 'Supplier Payment via Money Changer', 'Supplier', p_supplier_partner_id,
    'CNY', p_cny_amount, 'OUT', v_group, p_fx_rate, p_reference, p_note, p_staff_id
  )
  RETURNING * INTO v_cny_row;

  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (p_staff_id, 'money_debt_ledger_supplier_payment_via_money_changer_created', 'money_debt_ledger', v_vnd_row.id);
  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (p_staff_id, 'money_debt_ledger_supplier_payment_via_money_changer_created', 'money_debt_ledger', v_cny_row.id);

  RETURN QUERY SELECT * FROM money_debt_ledger_entries WHERE id IN (v_vnd_row.id, v_cny_row.id) ORDER BY currency;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_supplier_payment_via_money_changer(uuid, uuid, uuid, numeric, numeric, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_payment_via_money_changer(uuid, uuid, uuid, numeric, numeric, date, text, text) TO service_role;

-- ============================================================================
-- 5. create_money_debt_ledger_correction — the "Edit" mechanism. Never
--    updates/deletes the original row; always creates a new Adjustment row
--    carrying the delta and a corrects_entry_id back-reference, inheriting
--    party/currency/links from the original. Rejects a correction that
--    would take a Money Changer's balance negative.
-- ============================================================================

CREATE FUNCTION public.create_money_debt_ledger_correction(
  p_staff_id uuid,
  p_corrects_entry_id uuid,
  p_amount numeric,
  p_direction text,
  p_reference text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text
)
 RETURNS money_debt_ledger_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original money_debt_ledger_entries;
  v_current_balance numeric;
  v_row money_debt_ledger_entries;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: a staff id is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: staff % not found', p_staff_id USING ERRCODE = '42501';
  END IF;
  IF NOT money_debt_ledger_staff_has_permission(p_staff_id, 'money_debt_ledger.create') THEN
    RAISE EXCEPTION 'Forbidden: money_debt_ledger.create permission required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_original FROM money_debt_ledger_entries WHERE id = p_corrects_entry_id;
  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'Entry % not found', p_corrects_entry_id;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Correction amount must be greater than 0 (this is a delta, not a restated total)';
  END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'A valid direction (IN/OUT) is required for the correction delta';
  END IF;

  IF v_original.party_type = 'Money Changer' AND p_direction = 'OUT' THEN
    SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0)
      INTO v_current_balance
      FROM money_debt_ledger_entries
      WHERE party_id = v_original.party_id AND currency = v_original.currency;

    IF v_current_balance - p_amount < 0 THEN
      RAISE EXCEPTION 'This correction would take Money Changer %''s % balance negative: has %, correction reduces by %',
        v_original.party_id, v_original.currency, v_current_balance, p_amount
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_row := create_money_debt_ledger_entry(
    p_staff_id,
    'Adjustment',
    v_original.party_id,
    v_original.party_type,
    v_original.currency,
    p_amount,
    p_direction,
    CURRENT_DATE,
    v_original.linked_payment_id,
    v_original.linked_order_id,
    COALESCE(p_reference, 'Correction of ' || v_original.entry_code),
    p_note,
    p_corrects_entry_id
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_money_debt_ledger_correction(uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_money_debt_ledger_correction(uuid, uuid, numeric, text, text, text) TO service_role;
