-- Money & Debt Ledger — EXECUTE privilege correction (2026-08-16).
-- Follow-up to 2026081714_money_debt_ledger_module.sql, per the Dev
-- verification's live finding: this project has schema-level
-- ALTER DEFAULT PRIVILEGES (confirmed via pg_default_acl, granted by
-- `postgres`/`supabase_admin`) that grant EXECUTE on every new public-
-- schema function DIRECTLY to anon/authenticated/service_role, independent
-- of the PUBLIC pseudo-role. 2026081714's `REVOKE ALL ... FROM PUBLIC`
-- only removed the PUBLIC-pseudo-role grant — it never touched that
-- separate, project-specific direct grant, so `anon`/`authenticated`
-- still held EXECUTE on both write functions after that migration was
-- applied (confirmed live via has_function_privilege()).
--
-- Scope: ONLY the EXECUTE privilege state of the 4 Money & Debt Ledger
-- functions, plus the minimum function-body change required to keep the
-- application working once `authenticated` genuinely loses EXECUTE (see
-- "Why the function bodies change" below). Does NOT touch
-- money_debt_ledger_entries' own columns/constraints/indexes/RLS policies
-- (all untouched, still exactly as 2026081714 left them), does not touch
-- transaction types, partner types, or permissions rows.
--
-- ============================================================
-- Why the function bodies change (the one non-trivial part of this fix):
-- ============================================================
-- The previous design resolved "who is calling" via auth.uid() inside the
-- function (money_debt_ledger_current_staff_id()) — that only resolves to
-- a real value when the request carries an end-user's own session JWT,
-- i.e. when invoked through the `authenticated` role via the anon-key +
-- user-session client. Once `authenticated` has NO EXECUTE (this
-- migration's whole point), the application's write path MUST move to
-- Postgres's `service_role` — the only role left standing — via this
-- project's own existing, established server-only pattern
-- (lib/supabase/admin.ts's createAdminClient(), already used by
-- lib/auth/createStaffWithAuth.ts; not a new role, not invented here).
-- A service_role call carries no end-user JWT at all — auth.uid() would
-- always be NULL under it — so the auth.uid()-based check could no longer
-- ever succeed, not even for a fully legitimate call.
--
-- This is not a business-rule change: "the acting staff member must
-- genuinely hold money_debt_ledger.create" (D6/D7) is still verified
-- inside the database, unconditionally, on every call — only *how* the
-- function learns which staff member is acting has to change, because the
-- previous mechanism (auth.uid()) is structurally incompatible with the
-- now-required service_role invocation path. Both write functions gain one
-- new required parameter, p_staff_id, supplied by the trusted server
-- AFTER it has already run requirePermission() itself — the same
-- "authorization already done by the caller, DB still independently
-- re-verifies before writing" shape createStaffWithAuth already uses for
-- Auth Admin operations. Since the only credential that can reach these
-- functions at all is now the service_role key (never sent to the
-- browser, per lib/supabase/admin.ts's own doc comment), a caller-supplied
-- p_staff_id is no longer spoofable by an untrusted browser client the way
-- the original 2026081714 design's p_created_by was — the trust boundary
-- moved from "the DB independently verifies the session" to "only the
-- trusted server can reach this function at all, and the DB still
-- independently re-verifies the permission for whichever staff_id that
-- trusted server asserts."
--
-- money_debt_ledger_current_staff_id() itself is UNCHANGED (still a valid,
-- correct session-based lookup) — it is simply no longer called from
-- inside the other two functions, since no session exists under
-- service_role. Left in place, EXECUTE-corrected, in case a future
-- session-bound caller ever needs it directly.

BEGIN;

-- ============================================================
-- 1. money_debt_ledger_current_staff_id — signature unchanged, so
--    CREATE OR REPLACE preserves its existing object identity and does
--    NOT reset its ACL by itself; the explicit REVOKE below is still
--    required because the previous migration's REVOKE only targeted
--    PUBLIC, never anon/authenticated directly (root cause above).
-- ============================================================

REVOKE ALL ON FUNCTION money_debt_ledger_current_staff_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION money_debt_ledger_current_staff_id() TO service_role;

-- ============================================================
-- 2. money_debt_ledger_staff_has_permission — signature changes
--    (p_staff_id added, no longer resolves the caller via auth.uid()
--    internally) — DROP + CREATE, since a different parameter list is a
--    different function object in Postgres, then explicitly correct its
--    privileges (a fresh object gets this project's default-ACL grants
--    applied again on creation — see the migration's opening comment).
-- ============================================================

DROP FUNCTION IF EXISTS money_debt_ledger_staff_has_permission(text);

CREATE FUNCTION money_debt_ledger_staff_has_permission(p_staff_id uuid, p_permission_key text)
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

REVOKE ALL ON FUNCTION money_debt_ledger_staff_has_permission(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION money_debt_ledger_staff_has_permission(uuid, text) TO service_role;

-- ============================================================
-- 3. create_money_debt_ledger_entry — p_staff_id added (first parameter),
--    identity/authorization now keyed off it instead of auth.uid(). Every
--    other business rule (direction derivation, Buy CNY refusal,
--    over-reconciliation guard, entry_code generation, activity_logs
--    write) is byte-for-byte unchanged from 2026081714.
-- ============================================================

DROP FUNCTION IF EXISTS create_money_debt_ledger_entry(
  text, uuid, text, text, numeric, text, date, uuid, uuid, text, text
);

CREATE FUNCTION create_money_debt_ledger_entry(
  p_staff_id uuid,
  p_transaction_type text,
  p_party_id uuid,
  p_party_type text,
  p_currency text,
  p_amount numeric,
  p_direction text DEFAULT NULL,
  p_transaction_date date DEFAULT CURRENT_DATE,
  p_linked_payment_id uuid DEFAULT NULL,
  p_linked_order_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS money_debt_ledger_entries
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_direction text;
  v_sequence integer;
  v_code text;
  v_payment_amount numeric;
  v_already_reconciled numeric;
  v_row money_debt_ledger_entries;
BEGIN
  -- Authorization boundary — unchanged in substance from 2026081714, only
  -- re-keyed off the explicitly-supplied, trusted-server-asserted
  -- p_staff_id instead of auth.uid() (see this file's opening comment).
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
    reference, note, created_by
  ) VALUES (
    v_code, p_transaction_date, p_transaction_type, p_party_type, p_party_id,
    p_currency, p_amount, v_direction, p_linked_payment_id, p_linked_order_id,
    p_reference, p_note, p_staff_id
  )
  RETURNING * INTO v_row;

  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (p_staff_id, 'money_debt_ledger_entry_created', 'money_debt_ledger', v_row.id);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION create_money_debt_ledger_entry(
  uuid, text, uuid, text, text, numeric, text, date, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_money_debt_ledger_entry(
  uuid, text, uuid, text, text, numeric, text, date, uuid, uuid, text, text
) TO service_role;

-- ============================================================
-- 4. create_buy_cny_ledger_transaction — same p_staff_id addition, same
--    reasoning. Atomicity (both rows inside one function body, no
--    EXCEPTION-catching block) is unchanged from 2026081714.
-- ============================================================

DROP FUNCTION IF EXISTS create_buy_cny_ledger_transaction(
  uuid, numeric, numeric, numeric, date, text, text
);

CREATE FUNCTION create_buy_cny_ledger_transaction(
  p_staff_id uuid,
  p_party_id uuid,
  p_vnd_amount numeric,
  p_cny_amount numeric,
  p_fx_rate numeric,
  p_transaction_date date DEFAULT CURRENT_DATE,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS SETOF money_debt_ledger_entries
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
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

  IF p_vnd_amount IS NULL OR p_vnd_amount <= 0 THEN
    RAISE EXCEPTION 'VND amount must be greater than 0';
  END IF;
  IF p_cny_amount IS NULL OR p_cny_amount <= 0 THEN
    RAISE EXCEPTION 'CNY amount must be greater than 0';
  END IF;
  IF p_fx_rate IS NULL OR p_fx_rate <= 0 THEN
    RAISE EXCEPTION 'fx_rate must be greater than 0';
  END IF;

  SELECT COUNT(DISTINCT transaction_group) INTO v_group_sequence
  FROM money_debt_ledger_entries
  WHERE transaction_group LIKE 'FX-' || to_char(now(), 'YYYYMMDD') || '-%';
  v_group := 'FX-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_group_sequence + 1)::text, 6, '0');

  SELECT COUNT(*) INTO v_code_sequence
  FROM money_debt_ledger_entries
  WHERE entry_code LIKE 'MDL-' || to_char(now(), 'YYYYMMDD') || '-%';
  v_vnd_code := 'MDL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_code_sequence + 1)::text, 6, '0');
  v_cny_code := 'MDL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((v_code_sequence + 2)::text, 6, '0');

  INSERT INTO money_debt_ledger_entries (
    entry_code, transaction_date, transaction_type, party_type, party_id,
    currency, amount, direction, transaction_group, fx_rate, reference, note, created_by
  ) VALUES (
    v_vnd_code, p_transaction_date, 'Buy CNY', 'Money Changer', p_party_id,
    'VND', p_vnd_amount, 'OUT', v_group, p_fx_rate, p_reference, p_note, p_staff_id
  )
  RETURNING * INTO v_vnd_row;

  INSERT INTO money_debt_ledger_entries (
    entry_code, transaction_date, transaction_type, party_type, party_id,
    currency, amount, direction, transaction_group, fx_rate, reference, note, created_by
  ) VALUES (
    v_cny_code, p_transaction_date, 'Buy CNY', 'Money Changer', p_party_id,
    'CNY', p_cny_amount, 'IN', v_group, p_fx_rate, p_reference, p_note, p_staff_id
  )
  RETURNING * INTO v_cny_row;

  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (p_staff_id, 'money_debt_ledger_buy_cny_created', 'money_debt_ledger', v_vnd_row.id);
  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (p_staff_id, 'money_debt_ledger_buy_cny_created', 'money_debt_ledger', v_cny_row.id);

  RETURN QUERY SELECT * FROM money_debt_ledger_entries WHERE id IN (v_vnd_row.id, v_cny_row.id) ORDER BY currency;
END;
$$;

REVOKE ALL ON FUNCTION create_buy_cny_ledger_transaction(
  uuid, uuid, numeric, numeric, numeric, date, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_buy_cny_ledger_transaction(
  uuid, uuid, numeric, numeric, numeric, date, text, text
) TO service_role;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) FROM pg_proc p WHERE p.proname IN ('create_money_debt_ledger_entry','create_buy_cny_ledger_transaction','money_debt_ledger_current_staff_id','money_debt_ledger_staff_has_permission');
-- SELECT p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') FROM pg_proc p CROSS JOIN pg_roles r WHERE p.proname IN ('create_money_debt_ledger_entry','create_buy_cny_ledger_transaction','money_debt_ledger_current_staff_id','money_debt_ledger_staff_has_permission') AND r.rolname IN ('anon','authenticated','service_role','public') ORDER BY p.proname, r.rolname; -- expect FALSE for anon/authenticated/public, TRUE for service_role
-- Manual negative check (Dev only, anon key, no session): confirm supabase.rpc('create_money_debt_ledger_entry', {...}) is now rejected at the privilege layer itself (PostgREST/Postgres "permission denied for function"), not merely by the function's own internal check.
