-- Admin Order Delete — EXECUTE privilege correction (2026-08-16), following
-- the exact pattern already established and Dev-verified for Money & Debt
-- Ledger (2026081715_money_debt_ledger_execute_privilege_fix.sql). Read that
-- migration's own header comment for the full root-cause explanation of why
-- this project needs an explicit REVOKE naming PUBLIC, anon, AND
-- authenticated (not just PUBLIC) — this migration applies the identical
-- fix to a different function, not a new investigation.
--
-- Product Owner Security Review (2026-08-16): the original
-- 2026081702_admin_order_delete_reconciliation.sql defined
-- delete_order_with_reconciliation(p_order_id uuid) as SECURITY INVOKER
-- with GRANT EXECUTE TO anon, authenticated. Because every table this
-- function touches (orders, compensations, customer_purchases,
-- sales_commissions, products) already carries this schema's own
-- "Allow full access" RLS policy for anon/authenticated, SECURITY INVOKER
-- gave the function's caller the exact same effective access as calling
-- those tables directly — meaning the ONLY thing standing between a public
-- anon-key holder and a full destructive order delete was the Next.js
-- route's own role check (authResult.role.role_key === "Owner",
-- app/api/orders/[id]/route.ts) and order.service.ts's Compensation
-- Confirmed/Handed-Off pre-check. Both are application-layer only; a direct
-- supabase.rpc('delete_order_with_reconciliation', {...}) call bypassed
-- both entirely.
--
-- ============================================================
-- Fix (mirrors 2026081715's design exactly):
-- ============================================================
-- 1. New signature: delete_order_with_reconciliation(p_staff_id uuid,
--    p_order_id uuid) — the OLD 1-argument signature is DROPped outright
--    (not left granted-but-unused), so no caller can ever reach the
--    unauthenticated original again.
-- 2. SECURITY DEFINER + SET search_path = public — needed because
--    service_role calls carry no end-user session, so the function must
--    read staff/roles itself regardless of the caller's own RLS view.
-- 3. EXECUTE is explicitly REVOKEd from PUBLIC, anon, AND authenticated,
--    and GRANTed only to service_role — the application must now call this
--    through lib/supabase/admin.ts's createAdminClient() (already
--    established by Money & Debt Ledger and Auth Admin operations, not a
--    new pattern), after the route's own requirePermission/role check has
--    already run (defense in depth, not a replacement for it).
-- 4. The function body independently re-verifies, unconditionally, on every
--    call regardless of how it was reached:
--      a. p_staff_id is non-null and resolves to a real, active-role staff
--         row (mirrors money_debt_ledger_staff_has_permission's own
--         staff/role resolution — role_id-then-role-key fallback, the same
--         algorithm lib/permission/serverAuth.ts already uses);
--      b. that role's role_key is exactly 'Owner' — this feature has no
--         permission key of its own (Product Owner instruction: "keep the
--         existing role_key-based model, don't invent a new permission key
--         just for convenience"), so the DB check re-expresses the same
--         hardcoded role comparison app/api/orders/[id]/route.ts already
--         makes, not a new authorization model;
--      c. the target order exists;
--      d. no Confirmed or Handed Off compensation exists for this order —
--         previously an app-only pre-check (order.service.ts's deleteOrder,
--         via findCompensationStatusesForOrder); now enforced a second
--         time, inside the function itself, so a direct RPC call cannot
--         skip it.
--    A direct RPC call now fails at up to 3 independent layers even if the
--    first two were somehow bypassed: (1) no EXECUTE grant for
--    anon/authenticated at all — Postgres refuses the call before the
--    function body ever runs; (2) an authenticated-turned-service_role
--    caller whose asserted p_staff_id doesn't resolve to an Owner is
--    rejected by the function's own role check; (3) the Compensation
--    Confirmed/Handed-Off check still applies even for a genuine Owner.
--
-- ============================================================
-- Explicitly NOT changed by this migration (Product Owner Security Review
-- decision, 2026-08-16):
-- ============================================================
-- - The reconciliation sequence itself (sales_commissions ->
--   customer_purchases -> compensations -> products -> orders) is
--   byte-for-byte identical to 2026081702's original.
-- - Product status is restored to 'Active', matching 2026081702 (NOT
--   2026081713's 'Available') — Product Status Standardization is a
--   separate, not-yet-approved feature; using 'Available' here would set a
--   deleted order's products to a status literal the rest of this
--   Production-approved codebase does not yet recognize as sellable,
--   silently removing them from the sellable pool. This decision is
--   explicit, not an oversight.
-- - 2026081713_fix_delete_reconciliation_product_status.sql is NOT applied
--   in this release at all.
-- - No new permission key is created; Owner is the only authorized role,
--   matching the existing app-level design exactly.
-- - Transactionality is unchanged: this is still a single PL/pgSQL function
--   body, i.e. a single implicit transaction — any error at any point
--   (including the new authorization checks, which now run first) aborts
--   the entire function with nothing committed. No partial delete is
--   possible.

BEGIN;

DROP FUNCTION IF EXISTS delete_order_with_reconciliation(uuid);

CREATE FUNCTION delete_order_with_reconciliation(p_staff_id uuid, p_order_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_key text;
  v_item_ids uuid[];
  v_product_ids uuid[];
  v_purchase_ids uuid[];
BEGIN
  -- (a) staff id required
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: a staff id is required' USING ERRCODE = '42501';
  END IF;

  SELECT rl.role_key INTO v_role_key
  FROM staff s
  JOIN roles rl ON rl.id = COALESCE(
    s.role_id,
    (SELECT id FROM roles WHERE role_key = s.role AND is_active LIMIT 1)
  )
  WHERE s.id = p_staff_id
    AND rl.is_active;

  IF v_role_key IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: staff % not found or has no active role', p_staff_id USING ERRCODE = '42501';
  END IF;

  -- (b) Owner only — same hardcoded role comparison the Next.js route
  -- already makes (authResult.role.role_key === "Owner"), re-verified here.
  IF v_role_key IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION 'Forbidden: only Owner may delete an order with reconciliation' USING ERRCODE = '42501';
  END IF;

  -- (c) order must exist
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- (d) Confirmed/Handed Off Compensation protection, re-enforced here (was
  -- previously app-layer only) — LOCKED Traceability principle: "a
  -- Confirmed/Handed Off record is never deleted." Since Handed Off is a
  -- hard prerequisite for a Compensation ever entering a settlement_items
  -- row, refusing every Handed-Off compensation here transitively refuses
  -- every settlement-bound one too.
  IF EXISTS (
    SELECT 1 FROM compensations
    WHERE order_id = p_order_id AND status IN ('Confirmed', 'Handed Off')
  ) THEN
    RAISE EXCEPTION 'Order has a Confirmed or Handed Off compensation — cannot delete' USING ERRCODE = '42501';
  END IF;

  -- Reconciliation sequence — byte-for-byte identical to 2026081702's
  -- original, 'Active' literal (not 2026081713's 'Available').
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), COALESCE(array_agg(product_id), ARRAY[]::uuid[])
  INTO v_item_ids, v_product_ids
  FROM order_items
  WHERE order_id = p_order_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_purchase_ids
  FROM customer_purchases
  WHERE order_item_id = ANY(v_item_ids);

  IF array_length(v_purchase_ids, 1) > 0 THEN
    DELETE FROM sales_commissions WHERE purchase_id = ANY(v_purchase_ids);
    DELETE FROM customer_purchases WHERE id = ANY(v_purchase_ids);
  END IF;

  DELETE FROM compensations WHERE order_id = p_order_id;

  IF array_length(v_product_ids, 1) > 0 THEN
    UPDATE products
    SET status = 'Active'
    WHERE id = ANY(v_product_ids) AND status IN ('Reserved', 'Sold');
  END IF;

  DELETE FROM orders WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_order_with_reconciliation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_order_with_reconciliation(uuid, uuid) TO service_role;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) FROM pg_proc p WHERE p.proname = 'delete_order_with_reconciliation';
-- -- expect exactly ONE row, arguments "p_staff_id uuid, p_order_id uuid" — the old 1-arg signature must be gone entirely.
-- SELECT p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') FROM pg_proc p CROSS JOIN pg_roles r WHERE p.proname = 'delete_order_with_reconciliation' AND r.rolname IN ('anon','authenticated','service_role','public') ORDER BY r.rolname;
-- -- expect FALSE for anon/authenticated/public, TRUE for service_role.
-- Manual negative check (Dev only, anon key, no session): confirm supabase.rpc('delete_order_with_reconciliation', {p_staff_id: '<any-uuid>', p_order_id: '<any-uuid>'}) is rejected at the privilege layer itself (PostgREST/Postgres "permission denied for function"), not merely by the function's own internal check.
-- Manual negative check (Dev only, service_role, a real non-Owner staff id): confirm the call raises 'Forbidden: only Owner may delete an order with reconciliation'.
-- Manual negative check (Dev only, service_role, a real Owner staff id, an order with a Confirmed or Handed Off compensation): confirm the call raises 'Order has a Confirmed or Handed Off compensation — cannot delete'.
-- Manual positive check (Dev only, service_role, a real Owner staff id, an eligible test order): confirm the call succeeds and the order, its items, payments, customer_purchases, sales_commissions, and compensations rows are all gone, and any Reserved/Sold product returns to 'Active'.
