-- Money & Debt Ledger (docs/19_MONEY_DEBT_LEDGER_SPEC.md, DRAFT Rev 1) —
-- Product Owner Implementation Authorization, 2026-08-15. Revised 2026-08-16
-- per the pre-Dev security review's BLOCKED_BEFORE_DEV finding — see the
-- "Security boundary" note in section 2 below for what changed and why.
-- Still NOT applied to any database.
--
-- Scope: ONE new table (`money_debt_ledger_entries`), TWO new SECURITY
-- DEFINER write functions plus TWO small SECURITY DEFINER helper functions
-- that back their own internal authorization check, THREE new permission
-- rows. Does not modify `payments`, `orders`, `partners`, `staff`, `roles`,
-- `role_permissions`, or any other existing table, column, RLS policy, or
-- business rule.
--
-- ============================================================
-- Design summary (see docs/19_MONEY_DEBT_LEDGER_SPEC.md for the full
-- business/architecture rationale):
-- ============================================================
-- D3/D4 — one physical row = one currency movement; BUY_CNY is two rows
--   sharing one `transaction_group` value (not a parent table — a plain
--   shared text reference, since a BUY_CNY group has no single natural
--   parent row of its own).
-- D5/D8 — no balance table, no stored running_balance. Balance is always
--   SUM(amount) WHERE direction='IN' minus WHERE direction='OUT', computed
--   at read time by the application layer (lib/moneyDebtLedger).
-- D6/D7 — immutability follows Compensation Ledger's own precedent
--   (2026081401_compensation_ledger_module.sql): RLS grants SELECT only to
--   every application role, no INSERT/UPDATE/DELETE policy exists for
--   anon/authenticated. Unlike Compensation Ledger (trigger-only writer),
--   D6 requires authorized STAFF-initiated writes, so the sole write path
--   here is two SECURITY DEFINER functions (not a trigger) that the
--   application calls via supabase.rpc() after its own permission check
--   (`money_debt_ledger.create`).
-- D9 — `linked_payment_id`/`linked_order_id` are plain nullable
--   references; no uniqueness constraint ties a Payment to at most one
--   ledger row (D9 explicitly allows one Payment to have many). Over-
--   reconciliation of a TECH_H payment beyond its own `payments.amount` is
--   guarded inside the write function itself, not by a DB uniqueness
--   constraint.
-- D10 — no ON DELETE CASCADE anywhere on this table. `party_id`,
--   `linked_payment_id`, `linked_order_id` all use ON DELETE RESTRICT —
--   the same idiom already used by `settlement_items.compensation_id` to
--   protect financial history once it's downstream-referenced. This means
--   an Order/Payment with a linked ledger row cannot be deleted (including
--   through `delete_order_with_reconciliation()`,
--   2026081702_admin_order_delete_reconciliation.sql) while that ledger
--   row exists — flagged in docs/19_MONEY_DEBT_LEDGER_SPEC.md §26/§30 as a
--   known interaction, not resolved by weakening this FK.
-- D11 — no journal/account/receivable/payable/wallet table or column
--   anywhere in this migration.
--
-- ============================================================
-- Security boundary (2026-08-16 revision — read before touching section 2):
-- ============================================================
-- The pre-Dev review found that granting EXECUTE on both write functions to
-- `anon`/`authenticated` with no internal check let anyone holding the
-- public anon key call them directly via supabase.rpc(...) or raw
-- PostgREST, fully bypassing the Next.js route's
-- requirePermission(request, "money_debt_ledger.create") check, and let
-- the caller fabricate `created_by` (or leave it null) since it was a bare
-- parameter, not derived from the session.
--
-- Fix: Postgres grants EXECUTE on a new function to PUBLIC by default —
-- section 2 now explicitly REVOKEs that default from both write functions
-- and grants EXECUTE to `authenticated` only (never `anon`). On top of
-- that DB-level revocation, both functions now perform their OWN internal
-- authorization check before writing anything: they resolve the calling
-- session's staff row via auth.uid() (mirroring
-- lib/permission/serverAuth.ts's own auth_user_id-then-email resolution,
-- not a new identity model) and verify that staff's role actually holds
-- `money_debt_ledger.create` (querying the existing
-- roles/role_permissions/permissions tables the Permission Center already
-- owns and enforces from — DB §10's same resolution algorithm re-expressed
-- in SQL, not a new authorization model). `created_by` is now always the
-- session-resolved staff id — the functions no longer accept it as a
-- parameter, so it can no longer be spoofed by a caller.
--
-- The Next.js API route's requirePermission() check is UNCHANGED and still
-- runs first (defense in depth, and a friendlier error before ever hitting
-- Postgres) — but it is no longer the only thing standing between a public
-- anon-key holder and a financial write. A direct RPC call now fails at
-- three independent layers even if the first two were somehow skipped:
-- (1) no EXECUTE grant for `anon` at all: PostgREST/Postgres itself refuses
-- the call before the function body ever runs; (2) an `authenticated`
-- caller whose session doesn't resolve to any `staff` row, or whose role
-- doesn't hold `money_debt_ledger.create`, is rejected by the function's
-- own internal check; (3) the table's own SELECT-only RLS still means even
-- a successful write can never be followed by a direct UPDATE/DELETE.

BEGIN;

-- ============================================================
-- 1. money_debt_ledger_entries
-- ============================================================

CREATE TABLE IF NOT EXISTS money_debt_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  entry_code text NOT NULL UNIQUE,

  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'Customer Payment TECH_H',
    'VND Held By Money Changer',
    'Buy CNY',
    'CNY Held By Supplier',
    'Deposit',
    'Deposit Consumed',
    'Supplier Payment',
    'Adjustment'
  )),

  -- §6/D2: semantic label only — partners.partner_type itself is NOT
  -- constrained here or anywhere else; this CHECK scopes what THIS ledger
  -- accepts as a counterparty role, not what partners.partner_type may
  -- ever contain.
  party_type text NOT NULL CHECK (party_type IN ('Money Changer', 'Supplier')),
  party_id uuid NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,

  currency text NOT NULL CHECK (currency IN ('VND', 'CNY')),
  amount numeric NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('IN', 'OUT')),

  -- D4 — required only for 'Buy CNY' rows; absent for every single-row type.
  transaction_group text,
  -- Present only on 'Buy CNY' rows (§22 — fx_rate belongs to the FX
  -- transaction, not to every row).
  fx_rate numeric CHECK (fx_rate IS NULL OR fx_rate > 0),

  linked_payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  linked_order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,

  reference text,
  note text,

  -- Row lifecycle only (§23) — never a mechanism for altering amount/
  -- direction/party after creation. No 'Cancelled'/'Void' value: a mistake
  -- is corrected by a new 'Adjustment' row (D7), never by relabeling this
  -- one.
  status text NOT NULL DEFAULT 'Recorded' CHECK (status IN ('Recorded')),

  -- Always the SESSION-resolved staff id (see section 2's helper
  -- functions), never a caller-supplied value — closes the "fabricate
  -- created_by" gap the security review flagged alongside the EXECUTE-grant
  -- issue.
  created_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- No updated_at — nothing here is ever updated (D7, §23).

  -- Currency/direction/grouping consistency per transaction_type, enforced
  -- regardless of which write path is used (defense in depth alongside the
  -- write functions' own checks, §9 of the spec).
  CONSTRAINT money_debt_ledger_type_shape CHECK (
    (transaction_type = 'Customer Payment TECH_H' AND currency = 'VND' AND direction = 'IN' AND linked_payment_id IS NOT NULL) OR
    (transaction_type = 'VND Held By Money Changer' AND currency = 'VND') OR
    (transaction_type = 'Buy CNY' AND transaction_group IS NOT NULL AND fx_rate IS NOT NULL) OR
    (transaction_type = 'CNY Held By Supplier' AND currency = 'CNY' AND direction = 'IN') OR
    (transaction_type = 'Deposit' AND currency = 'CNY' AND direction = 'IN') OR
    (transaction_type = 'Deposit Consumed' AND currency = 'CNY' AND direction = 'OUT') OR
    (transaction_type = 'Supplier Payment' AND currency = 'CNY' AND direction = 'OUT') OR
    (transaction_type = 'Adjustment')
  )
);

CREATE INDEX IF NOT EXISTS idx_money_debt_ledger_party_currency ON money_debt_ledger_entries(party_id, currency);
CREATE INDEX IF NOT EXISTS idx_money_debt_ledger_transaction_type ON money_debt_ledger_entries(transaction_type);
CREATE INDEX IF NOT EXISTS idx_money_debt_ledger_transaction_date ON money_debt_ledger_entries(transaction_date);
CREATE INDEX IF NOT EXISTS idx_money_debt_ledger_transaction_group ON money_debt_ledger_entries(transaction_group);
CREATE INDEX IF NOT EXISTS idx_money_debt_ledger_linked_payment_id ON money_debt_ledger_entries(linked_payment_id);
CREATE INDEX IF NOT EXISTS idx_money_debt_ledger_linked_order_id ON money_debt_ledger_entries(linked_order_id);
CREATE INDEX IF NOT EXISTS idx_money_debt_ledger_created_at ON money_debt_ledger_entries(created_at);

-- Immutability (D7, §23): SELECT-only for every application role — no
-- INSERT/UPDATE/DELETE policy is granted to anon or authenticated. The two
-- SECURITY DEFINER functions below are the only path that can ever write a
-- row here, matching Compensation Ledger's own precedent
-- (compensation_ledger_entries, 2026081401_compensation_ledger_module.sql).
ALTER TABLE money_debt_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read to anon" ON money_debt_ledger_entries;
CREATE POLICY "Allow read to anon" ON money_debt_ledger_entries FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow read to authenticated" ON money_debt_ledger_entries;
CREATE POLICY "Allow read to authenticated" ON money_debt_ledger_entries FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. Authorization helpers — DB-level re-expression of the exact
--    resolution algorithm lib/permission/serverAuth.ts +
--    lib/permission/permissionCenter.service.ts already use
--    (auth_user_id-then-email staff resolution; staff.role_id-then-
--    staff.role-vs-roles.role_key role resolution; role_permissions ⋈
--    permissions for the granted-key set) — not a new authorization model,
--    the existing one, callable from inside a SECURITY DEFINER function
--    where the session's own RLS-restricted view can't be relied on.
--    SECURITY DEFINER + SET search_path here for the same reason as the
--    write functions below: these helpers read staff/roles/permissions
--    regardless of the calling role's own RLS on those tables.
-- ============================================================

CREATE OR REPLACE FUNCTION money_debt_ledger_current_staff_id()
RETURNS uuid
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT s.id
  FROM staff s
  WHERE s.auth_user_id = auth.uid()
     OR (s.auth_user_id IS NULL AND s.email = (auth.jwt() ->> 'email'))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION money_debt_ledger_current_staff_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION money_debt_ledger_current_staff_id() TO authenticated;

CREATE OR REPLACE FUNCTION money_debt_ledger_staff_has_permission(p_permission_key text)
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
    WHERE s.id = money_debt_ledger_current_staff_id()
      AND rl.is_active
      AND perm.permission_key = p_permission_key
      AND perm.is_active
  );
$$;

REVOKE ALL ON FUNCTION money_debt_ledger_staff_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION money_debt_ledger_staff_has_permission(text) TO authenticated;

-- ============================================================
-- 3. create_money_debt_ledger_entry — single-row write path, covers every
--    transaction_type except 'Buy CNY' (see §4 below for the paired path).
--    Direction is derived server-side from transaction_type wherever the
--    business meaning is one-directional (§9 of the spec) rather than
--    trusted from the caller, so a caller mistake cannot silently write a
--    movement with the wrong sign. 'VND Held By Money Changer' and
--    'Adjustment' are the only two types where the caller's own
--    p_direction is used, since both are legitimately bidirectional.
-- ============================================================

CREATE OR REPLACE FUNCTION create_money_debt_ledger_entry(
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
  v_staff_id uuid;
  v_direction text;
  v_sequence integer;
  v_code text;
  v_payment_amount numeric;
  v_already_reconciled numeric;
  v_row money_debt_ledger_entries;
BEGIN
  -- Authorization boundary (2026-08-16 fix) — the ONLY thing standing
  -- between "authenticated" and "may write" used to be the Next.js route;
  -- now it's enforced here too, unconditionally, for every caller
  -- regardless of how the function was reached.
  v_staff_id := money_debt_ledger_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no staff record for the current session' USING ERRCODE = '42501';
  END IF;
  IF NOT money_debt_ledger_staff_has_permission('money_debt_ledger.create') THEN
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

  -- Phase 5 duplicate-reconciliation guard: a TECH_H receipt row may never
  -- push the sum of all ledger rows linked to one Payment above that
  -- Payment's own amount — D9 allows multiple linked rows, just never past
  -- what was actually paid.
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
    p_reference, p_note, v_staff_id
  )
  RETURNING * INTO v_row;

  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (v_staff_id, 'money_debt_ledger_entry_created', 'money_debt_ledger', v_row.id);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION create_money_debt_ledger_entry(
  text, uuid, text, text, numeric, text, date, uuid, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_money_debt_ledger_entry(
  text, uuid, text, text, numeric, text, date, uuid, uuid, text, text
) TO authenticated;
-- Deliberately no grant to `anon` — anonymous sessions have no staff
-- record to resolve, so money_debt_ledger_current_staff_id() would always
-- return NULL for them regardless, but the grant is withheld outright
-- (least privilege) rather than relying only on that internal check.

-- ============================================================
-- 4. create_buy_cny_ledger_transaction — the D4 paired write path. Both
--    rows are inserted inside this one function body, i.e. inside one
--    Postgres statement/transaction — if anything fails partway through
--    (a constraint violation on the second row, for instance), the entire
--    function's effects roll back and neither row is left committed. This
--    is what guarantees BUY_CNY atomicity (Phase 2/10's requirement),
--    without needing an application-level transaction wrapper.
-- ============================================================

CREATE OR REPLACE FUNCTION create_buy_cny_ledger_transaction(
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
  v_staff_id uuid;
  v_group_sequence integer;
  v_group text;
  v_code_sequence integer;
  v_vnd_code text;
  v_cny_code text;
  v_vnd_row money_debt_ledger_entries;
  v_cny_row money_debt_ledger_entries;
BEGIN
  -- Same authorization boundary as create_money_debt_ledger_entry() — see
  -- the "Security boundary" note at the top of this file.
  v_staff_id := money_debt_ledger_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no staff record for the current session' USING ERRCODE = '42501';
  END IF;
  IF NOT money_debt_ledger_staff_has_permission('money_debt_ledger.create') THEN
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
    'VND', p_vnd_amount, 'OUT', v_group, p_fx_rate, p_reference, p_note, v_staff_id
  )
  RETURNING * INTO v_vnd_row;

  INSERT INTO money_debt_ledger_entries (
    entry_code, transaction_date, transaction_type, party_type, party_id,
    currency, amount, direction, transaction_group, fx_rate, reference, note, created_by
  ) VALUES (
    v_cny_code, p_transaction_date, 'Buy CNY', 'Money Changer', p_party_id,
    'CNY', p_cny_amount, 'IN', v_group, p_fx_rate, p_reference, p_note, v_staff_id
  )
  RETURNING * INTO v_cny_row;

  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (v_staff_id, 'money_debt_ledger_buy_cny_created', 'money_debt_ledger', v_vnd_row.id);
  INSERT INTO activity_logs (staff_id, action, entity, entity_id)
  VALUES (v_staff_id, 'money_debt_ledger_buy_cny_created', 'money_debt_ledger', v_cny_row.id);

  RETURN QUERY SELECT * FROM money_debt_ledger_entries WHERE id IN (v_vnd_row.id, v_cny_row.id) ORDER BY currency;
END;
$$;

REVOKE ALL ON FUNCTION create_buy_cny_ledger_transaction(
  uuid, numeric, numeric, numeric, date, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_buy_cny_ledger_transaction(
  uuid, numeric, numeric, numeric, date, text, text
) TO authenticated;
-- Deliberately no grant to `anon` — see the note above
-- create_money_debt_ledger_entry's own GRANT.

-- ============================================================
-- 5. Permissions (§25 of the spec). Seeded UNGRANTED — no hardcoded role
--    mapping, per the Partner Center Decision 5 precedent every module has
--    followed since. No `money_debt_ledger.update`/`.delete` key exists at
--    all (D7) — mirrors Compensation Ledger's own choice to simply not
--    define permissions for actions the business rule prohibits outright.
-- ============================================================

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('money_debt_ledger.view', 'money_debt_ledger', 'view'),
  ('money_debt_ledger.create', 'money_debt_ledger', 'create'),
  ('money_debt_ledger.export', 'money_debt_ledger', 'export')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'money_debt_ledger_entries';
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'money_debt_ledger_entries' ORDER BY ordinal_position;
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'money_debt_ledger_entries'; -- expect exactly 2 rows, both SELECT
-- SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('create_money_debt_ledger_entry', 'create_buy_cny_ledger_transaction', 'money_debt_ledger_current_staff_id', 'money_debt_ledger_staff_has_permission'); -- prosecdef = true for all 4
-- SELECT p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') FROM pg_proc p CROSS JOIN pg_roles r WHERE p.proname IN ('create_money_debt_ledger_entry', 'create_buy_cny_ledger_transaction') AND r.rolname IN ('anon', 'authenticated', 'public'); -- expect FALSE for anon and public, TRUE for authenticated
-- SELECT permission_key FROM permissions WHERE resource = 'money_debt_ledger' ORDER BY permission_key;
-- Manual end-to-end check (Dev only, as a staff member holding money_debt_ledger.create): call create_buy_cny_ledger_transaction(...) and confirm exactly 2 rows appear sharing one transaction_group, one VND OUT and one CNY IN, both with the same fx_rate, both with created_by = your own staff id.
-- Manual negative check (Dev only, via the Supabase JS client using ONLY the anon key, no session): confirm supabase.rpc('create_money_debt_ledger_entry', {...}) is rejected before the function body runs (no EXECUTE privilege).
-- Manual negative check (Dev only, as a signed-in staff member who does NOT hold money_debt_ledger.create): confirm the RPC call raises 'Forbidden: money_debt_ledger.create permission required'.
