-- adjust_product_inventory() — RPC-internal authorization (Phase 1A, INV-016).
--
-- Root cause: the function has always been SECURITY INVOKER (confirmed
-- unchanged, pg_proc.prosecdef = false), which is correct and preserved
-- here — its own UPDATE/INSERT statements are already covered by existing
-- authenticated-role RLS on products/inventory_audit (INV-012B/INV-014).
-- The gap was that the function body performed no authorization check of
-- its own at all: any authenticated caller (and, per its GRANT EXECUTE ...
-- TO anon, PUBLIC, previously even an anonymous one) could call it
-- directly and bypass the app-layer `inventory.adjust` permission check
-- enforced only in app/api/inventory/adjustments/route.ts.
--
-- Design: adjust_product_inventory() itself REMAINS SECURITY INVOKER — no
-- change to that. It now calls two new, narrowly-scoped SECURITY DEFINER
-- helper functions to resolve the caller's identity and permission
-- reliably. This is not "the write path became DEFINER" — it is the exact
-- same pattern this codebase already uses twice in its CURRENT, LIVE form
-- (confirmed directly via pg_get_functiondef, not assumed from an older
-- migration file, which showed a superseded single-arg shape):
-- money_debt_ledger_current_staff_id()/money_debt_ledger_staff_has_
-- permission(p_staff_id uuid, p_permission_key text), and
-- revenue_attribution_staff_has_permission(p_staff_id uuid, p_permission_key
-- text) — both live on Dev today with the identical two-function shape
-- (a no-arg session-resolver + an explicit-staff-id permission-check)
-- replicated below. Reason for the pattern: an ordinary authenticated
-- caller cannot be relied on to have — or to keep having, as this
-- project's own RLS narrowing continues — direct table access to
-- staff/roles/role_permissions/permissions, so a reliable self-
-- permission-check needs a function that reads those tables independent
-- of the caller's own RLS. Both new helpers are read-only (SELECT only,
-- no INSERT/UPDATE/DELETE), STABLE, `SET search_path = public`, and
-- REVOKEd from PUBLIC with EXECUTE granted only to `authenticated` —
-- matching the existing precedent's exact current shape, not generic
-- boilerplate and not the file-only historical version.
--
-- Named with an `inventory_` prefix (not module-specific to Adjustment)
-- since both helpers are generic staff/permission-resolution utilities the
-- same domain's later RPC hardening work (Reserve/Release/Sell) can reuse
-- as-is, per this task's own framing as "the Phase 1A reference pattern
-- for later critical inventory RPC work" — matching the project's
-- established per-module-prefix convention (money_debt_ledger_*,
-- revenue_attribution_*), not introducing a new shared/global one.
--
-- Scope: adjust_product_inventory() + two new helper functions only. No
-- other RPC, table, RLS policy, or application code is touched. No new
-- permission key is created — `inventory.adjust` already exists
-- (2026081704_inventory_adjustment_reason_and_audit.sql) and is reused
-- exactly as-is.

BEGIN;

CREATE OR REPLACE FUNCTION inventory_current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM staff s
  WHERE s.auth_user_id = auth.uid()
     OR (s.auth_user_id IS NULL AND s.email = (auth.jwt() ->> 'email'))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION inventory_current_staff_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inventory_current_staff_id() TO authenticated;

CREATE OR REPLACE FUNCTION inventory_staff_has_permission(p_staff_id uuid, p_permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION inventory_staff_has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inventory_staff_has_permission(uuid, text) TO authenticated;

-- adjust_product_inventory() — SECURITY INVOKER preserved. Only change:
-- one new authorization check at the top of the function body, and a
-- pinned search_path (function-security hardening — INVOKER means a
-- search_path hijack could not itself grant elevated privilege, since the
-- function still only ever runs as the caller, but pinning it is still
-- the project's own established convention and removes any ambiguity
-- about which `products`/`inventory_audit` the unqualified names below
-- resolve to). The eligibility guard (`WHERE status = 'Available'`), the
-- audit insert, and the return value are byte-for-byte unchanged from the
-- existing function.
CREATE OR REPLACE FUNCTION adjust_product_inventory(
  p_product_id uuid,
  p_reason text,
  p_actor text,
  p_note text DEFAULT NULL
)
RETURNS products
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product products;
BEGIN
  IF NOT inventory_staff_has_permission(inventory_current_staff_id(), 'inventory.adjust') THEN
    RAISE EXCEPTION 'Unauthorized: caller does not have the inventory.adjust permission'
      USING ERRCODE = '42501';
  END IF;

  UPDATE products
  SET status = 'Archived'
  WHERE id = p_product_id
    AND status = 'Available'
  RETURNING * INTO v_product;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % is not eligible for adjustment (must currently be Available - not found, Reserved, Sold, or already Archived)', p_product_id;
  END IF;

  INSERT INTO inventory_audit (
    event_type, product_id, actor, detail, reason,
    product_status_before, product_status_after, note
  ) VALUES (
    'Inventory Adjustment',
    p_product_id,
    p_actor,
    'Điều chỉnh tồn kho: ' || p_reason,
    p_reason,
    'Available',
    'Archived',
    p_note
  );

  RETURN v_product;
END;
$$;

-- Close the broad EXECUTE exposure this function had (GRANT ... TO anon,
-- PUBLIC previously) — authorization is now enforced inside the function
-- itself, but there is no reason to leave it callable by anon/PUBLIC at
-- all, consistent with INV-011's finding that no legitimate flow needs
-- anonymous access. service_role's own separate, pre-existing explicit
-- grant is untouched by this (not part of PUBLIC, not revoked here).
REVOKE ALL ON FUNCTION adjust_product_inventory(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION adjust_product_inventory(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION adjust_product_inventory(uuid, text, text, text) TO authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT proname, prosecdef, proconfig FROM pg_proc
--   WHERE proname IN ('adjust_product_inventory','inventory_current_staff_id','inventory_staff_has_permission');
-- Expect: adjust_product_inventory prosecdef = false (still INVOKER), the
-- two helpers prosecdef = true; all three proconfig = {search_path=public}.
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_name = 'adjust_product_inventory';
-- Expect: authenticated, service_role, postgres only — no anon, no PUBLIC.
-- SELECT inventory_staff_has_permission('<a real staff id>'::uuid, 'inventory.adjust');
-- confirms the helper resolves correctly against real data.
