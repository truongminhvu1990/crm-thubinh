-- Stage 19 (Product Owner Locked Business Contract, 2026-08-17) — Automatic
-- Payment -> Money/Debt Ledger sync for the generic Receiving Account ->
-- Money Changer flow. DEV ONLY. Not applied to Production by this
-- migration alone — a separate, later, explicitly authorized stage.
--
-- ============================================================
-- Why this migration exists (Phase 3/6/7 findings from this stage's own
-- investigation, not assumed):
-- ============================================================
-- Phase 7 finding: create_money_debt_ledger_entry()'s own duplicate/
-- over-reconciliation guard is hardcoded to
-- `IF p_transaction_type = 'Customer Payment TECH_H'` only (see
-- 2026081715_money_debt_ledger_execute_privilege_fix.sql) — it does NOT
-- protect any other transaction_type. Combined with D9's own deliberate
-- absence of a table-wide unique constraint on linked_payment_id (multiple
-- rows per payment are legitimate for historical TECH_H partial
-- reconciliation), a brand-new transaction_type for this generic flow
-- would have ZERO duplicate protection at either the RPC or schema level
-- if nothing else changed. Per this stage's own Phase 3 instruction, this
-- finding is reported here (this comment) and the necessary protection is
-- added as a PARTIAL unique index scoped to only the new transaction_type
-- below — the existing TECH_H behavior (D9, multiple rows per payment) is
-- completely unaffected, since the partial index's WHERE clause excludes
-- every other transaction_type.
--
-- Phase 9 finding: none of the 8 existing transaction_type values fit.
-- 'Customer Payment TECH_H' is explicitly historical-only (its own name
-- says so, and Stage 4-7's locked decisions repeatedly forbid merging the
-- historical path into the generic one). New value added:
-- 'Customer Payment via Money Changer' — mirrors this table's own existing
-- naming convention (naming the counterparty relationship, same shape as
-- 'VND Held By Money Changer'/'CNY Held By Supplier') without encoding any
-- bank/owner/Money-Changer name into the value itself (Phase 5).
--
-- Phase 10 finding: direction is 'IN' — money received by/through a Money
-- Changer on the business's behalf, the same business meaning as
-- 'Customer Payment TECH_H' (§9 of the original spec: TECH_H's own
-- direction is 'IN' for the identical underlying business event, a
-- customer payment reaching the business via a Money Changer
-- intermediary). currency is 'VND' — Payment.amount has no currency field
-- anywhere in this codebase (OrderPayment has none, AddPaymentModal always
-- formats/labels amounts as VND) — every customer Payment is implicitly
-- VND, matching the existing 'Customer Payment TECH_H' shape exactly.
--
-- Phase 6 finding (Option A, chosen): a plain PostgREST `.insert()` and a
-- separate `.rpc()` call are two independent network round-trips/
-- transactions — there is no way to make them atomic from the application
-- layer alone. `payments` itself has never been written via a stored
-- procedure (always a plain INSERT, app-layer-validated only, no DB-level
-- re-check — unlike Money/Debt writes, which have always independently
-- re-verified). This migration adds ONE new atomic wrapper function
-- (create_payment_with_ledger_sync) that performs the payment INSERT and
-- calls the existing, unmodified, fully-governed
-- create_money_debt_ledger_entry() — via a second new function,
-- sync_payment_to_money_debt_ledger, itself independently callable for
-- Phase 13/14's explicit retry/idempotency/concurrency testing — all
-- inside one Postgres function body, i.e. one transaction: if the ledger
-- write fails for any reason (including the acting staff member not
-- holding money_debt_ledger.create — see the explicit callout in this
-- stage's own report), the payment insert is rolled back too. No silent
-- partial success is possible (Phase 6's explicit requirement) — the
-- caller gets one clear success or one clear failure, never a payment
-- that exists with no matching ledger entry it was supposed to have.
--
-- Phase 8 finding: authenticated staff context (a real staff.id uuid) IS
-- available server-side at Payment creation time
-- (authorizeOrderWrite()'s own returned `staff` object, in
-- app/api/orders/[id]/payments/route.ts) — it was simply never threaded
-- past the API route before this stage. order.service.ts's addPayment
-- gains one new optional parameter to carry it through; no code change
-- ships in this migration file itself (see this stage's separate
-- TypeScript changes).
--
-- Scope: two new functions, one new partial unique index, two ALTERed
-- CHECK constraints (widening the allowed transaction_type set only —
-- every existing branch/value is preserved byte-for-byte, nothing
-- removed or reinterpreted). Does NOT touch payments/orders/settlements
-- data, does NOT touch TECH_H_PAYMENT_METHODS (a TypeScript-only
-- constant, entirely untouched by this or any SQL file), does NOT modify
-- create_money_debt_ledger_entry()/create_buy_cny_ledger_transaction()
-- (both called, neither altered), does NOT touch receiving_accounts'
-- own schema/constraints from 1719/1720.

BEGIN;

-- ============================================================
-- 1. Widen the transaction_type CHECK constraints to allow the one new
--    value. Every existing value is preserved unchanged.
-- ============================================================

ALTER TABLE money_debt_ledger_entries
  DROP CONSTRAINT money_debt_ledger_entries_transaction_type_check;

ALTER TABLE money_debt_ledger_entries
  ADD CONSTRAINT money_debt_ledger_entries_transaction_type_check CHECK (transaction_type IN (
    'Customer Payment TECH_H',
    'VND Held By Money Changer',
    'Buy CNY',
    'CNY Held By Supplier',
    'Deposit',
    'Deposit Consumed',
    'Supplier Payment',
    'Adjustment',
    'Customer Payment via Money Changer'
  ));

ALTER TABLE money_debt_ledger_entries
  DROP CONSTRAINT money_debt_ledger_type_shape;

ALTER TABLE money_debt_ledger_entries
  ADD CONSTRAINT money_debt_ledger_type_shape CHECK (
    (transaction_type = 'Customer Payment TECH_H' AND currency = 'VND' AND direction = 'IN' AND linked_payment_id IS NOT NULL) OR
    (transaction_type = 'VND Held By Money Changer' AND currency = 'VND') OR
    (transaction_type = 'Buy CNY' AND transaction_group IS NOT NULL AND fx_rate IS NOT NULL) OR
    (transaction_type = 'CNY Held By Supplier' AND currency = 'CNY' AND direction = 'IN') OR
    (transaction_type = 'Deposit' AND currency = 'CNY' AND direction = 'IN') OR
    (transaction_type = 'Deposit Consumed' AND currency = 'CNY' AND direction = 'OUT') OR
    (transaction_type = 'Supplier Payment' AND currency = 'CNY' AND direction = 'OUT') OR
    (transaction_type = 'Adjustment') OR
    (transaction_type = 'Customer Payment via Money Changer' AND currency = 'VND' AND direction = 'IN' AND linked_payment_id IS NOT NULL)
  );

-- ============================================================
-- 2. Idempotency guard (Phase 3) — a partial unique index scoped ONLY to
--    the new transaction_type. Historical 'Customer Payment TECH_H'
--    D9 behavior (multiple rows per payment, partial reconciliation) is
--    completely unaffected — this index's WHERE clause excludes it
--    entirely. This is a real, database-level, concurrency-safe
--    guarantee (Postgres unique indexes are enforced atomically even
--    under concurrent transactions) — not an application-only check.
-- ============================================================

CREATE UNIQUE INDEX idx_money_debt_ledger_unique_auto_sync_payment
  ON money_debt_ledger_entries(linked_payment_id)
  WHERE transaction_type = 'Customer Payment via Money Changer';

-- ============================================================
-- 3. sync_payment_to_money_debt_ledger — idempotent, standalone,
--    directly callable (Phase 13/14's own explicit retry/concurrency
--    test target). Given an EXISTING payment id, conditionally creates
--    exactly one 'Customer Payment via Money Changer' ledger row via the
--    existing, unmodified create_money_debt_ledger_entry() RPC — never a
--    direct INSERT into money_debt_ledger_entries (Phase 7's explicit
--    requirement). Returns NULL (not an error) when the payment simply
--    isn't eligible (no receiving account, or the receiving account has
--    no Money Changer association) — eligibility is derived entirely from
--    the payment -> receiving_accounts -> money_changer_partner_id data
--    relationship (Phase 5), never from payment_method text content, bank
--    name, owner name, note, or any H/K pattern.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_payment_to_money_debt_ledger(
  p_staff_id uuid,
  p_payment_id uuid
)
RETURNS money_debt_ledger_entries
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
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
      NULL
    );
    RETURN v_new;
  EXCEPTION WHEN unique_violation THEN
    -- Lost a genuine concurrent race to another sync call for the same
    -- payment (Phase 14) — the unique index above already guaranteed only
    -- one of them could win the INSERT; return the winner's row instead
    -- of raising, so every concurrent caller observes the same single
    -- successful result (idempotent success, never a duplicate, never an
    -- error surfaced for losing a race that was itself expected/safe).
    SELECT *
      INTO v_existing
      FROM money_debt_ledger_entries
      WHERE linked_payment_id = p_payment_id
        AND transaction_type = 'Customer Payment via Money Changer';
    RETURN v_existing;
  END;
END;
$$;

REVOKE ALL ON FUNCTION sync_payment_to_money_debt_ledger(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_payment_to_money_debt_ledger(uuid, uuid) TO service_role;

-- ============================================================
-- 4. create_payment_with_ledger_sync — the atomic Option A wrapper used
--    at Payment-creation time. Only ever invoked by order.repository.ts
--    when input.receiving_account_id is present (see this stage's
--    TypeScript changes) — every payment with no receiving account keeps
--    using the existing, completely unchanged plain INSERT path, zero new
--    risk introduced for Cash/PayPal/Other/non-Money-Changer Bank
--    Transfer payments. All existing application-layer validation
--    (amount, order status, receiving-account existence/active-check,
--    Bank-Transfer-requires-account / non-Bank-Transfer-must-be-null)
--    still runs exactly as before, in order.service.ts's addPayment,
--    BEFORE this function is ever called — this function does not
--    re-implement or replace any of that (Phase 11: existing Stage 3-9
--    validation is preserved unchanged).
-- ============================================================

CREATE OR REPLACE FUNCTION create_payment_with_ledger_sync(
  p_staff_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_note text DEFAULT NULL,
  p_receiving_account_id uuid DEFAULT NULL
)
RETURNS payments
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment payments;
BEGIN
  INSERT INTO payments (order_id, amount, payment_method, payment_date, note, receiving_account_id)
  VALUES (p_order_id, p_amount, p_payment_method, p_payment_date, p_note, p_receiving_account_id)
  RETURNING * INTO v_payment;

  -- Same transaction as the INSERT above: any exception raised inside
  -- sync_payment_to_money_debt_ledger (e.g. the acting staff member does
  -- not hold money_debt_ledger.create) propagates out of this function
  -- and rolls back the payment INSERT too — no orphaned payment can ever
  -- exist with a Money-Changer-linked receiving account and no matching
  -- ledger entry (Phase 6's explicit "no silent partial success"
  -- requirement).
  PERFORM sync_payment_to_money_debt_ledger(p_staff_id, v_payment.id);

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION create_payment_with_ledger_sync(uuid, uuid, numeric, text, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_payment_with_ledger_sync(uuid, uuid, numeric, text, date, text, uuid) TO service_role;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT conname FROM pg_constraint WHERE conrelid='money_debt_ledger_entries'::regclass AND conname IN ('money_debt_ledger_entries_transaction_type_check','money_debt_ledger_type_shape');
-- SELECT indexname FROM pg_indexes WHERE indexname='idx_money_debt_ledger_unique_auto_sync_payment';
-- SELECT proname FROM pg_proc WHERE proname IN ('sync_payment_to_money_debt_ledger','create_payment_with_ledger_sync');
-- SELECT p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') FROM pg_proc p CROSS JOIN pg_roles r WHERE p.proname IN ('sync_payment_to_money_debt_ledger','create_payment_with_ledger_sync') AND r.rolname IN ('anon','authenticated','service_role','public'); -- expect FALSE for anon/authenticated/public, TRUE for service_role
