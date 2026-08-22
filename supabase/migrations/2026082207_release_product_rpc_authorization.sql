-- products.releaseProduct -> release_product() RPC (Phase 1A, INV-021).
--
-- Product Owner Decision (INV-020 Section 22 follow-up, applied here):
-- Option A — the RPC boundary enforces authenticated identity + current
-- staff resolution + an existing COARSE permission; fine-grained Order
-- Data-Scope (Own/Team/All, matched against orders.sales_owner) remains
-- application-layer-only via authorizeOrderWrite. This migration must NOT
-- copy or reimplement app/api/orders/_authorization.ts in SQL, must NOT
-- accept an order_id merely to reproduce Data-Scope, and must NOT create a
-- second temporary Data-Scope engine — all explicitly ruled out.
--
-- "Coarse permission" identified: all 4 confirmed callers of the current
-- releaseProduct() (deleteOrder non-admin path, addProductToOrder's
-- best-effort rollback, removeProductFromOrder, markOrderLost strict path)
-- are reached only through routes gated by authorizeOrderWrite, whose role
-- gate is "does this staff's role resolve to ANY Order-write scope at all"
-- — today, Owner/Manager/Sales; Marketing/Viewer/unresolvable roles are
-- denied. orders_staff_has_write_role() below reproduces exactly that
-- coarse membership fact by an independent query against staff/roles (the
-- same join shape inventory_staff_has_permission() already uses) — it does
-- NOT port ORDERS_WRITE_SCOPE_BY_ROLE_KEY's object or isOrderInWriteScope's
-- sales_owner/team comparison logic. If the set of coarse-eligible roles
-- ever changes, this function and _authorization.ts's map must both be
-- updated by whoever changes that decision — same as any other duplicated
-- fact, not a new problem introduced here.
--
-- inventory_current_staff_id() (INV-016) is reused as-is, unmodified — its
-- own migration comment already flagged it for reuse by this exact work.
--
-- Scope: release_product() + one new small helper function only. No RLS
-- policy, trigger, other RPC (reserve_product, adjust_product_inventory),
-- or application authorization file is touched. No new permission key is
-- created — this is a role-membership check, not a permissions/
-- role_permissions key.

BEGIN;

CREATE OR REPLACE FUNCTION orders_staff_has_write_role(p_staff_id uuid)
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
    WHERE s.id = p_staff_id
      AND rl.is_active
      AND rl.role_key IN ('Owner', 'Manager', 'Sales')
  );
$$;

-- REVOKE ... FROM anon is explicit and separate from FROM PUBLIC:
-- Supabase's default privilege setup grants EXECUTE on new public-schema
-- functions to anon directly (not only via the PUBLIC pseudo-role), so
-- REVOKE FROM PUBLIC alone does not remove it — confirmed by direct
-- information_schema.routine_privileges inspection on this exact function
-- after an initial apply that omitted this line.
REVOKE ALL ON FUNCTION orders_staff_has_write_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION orders_staff_has_write_role(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION orders_staff_has_write_role(uuid) TO authenticated;

-- SECURITY INVOKER (locked preference) — its own UPDATE is covered by the
-- existing authenticated-only products RLS UPDATE policy (INV-012B).
CREATE OR REPLACE FUNCTION release_product(p_product_id uuid)
RETURNS products
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_product products;
BEGIN
  v_staff_id := inventory_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: caller does not resolve to a staff record'
      USING ERRCODE = '42501';
  END IF;

  IF NOT orders_staff_has_write_role(v_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: caller does not have Order write access'
      USING ERRCODE = '42501';
  END IF;

  UPDATE products
  SET status = 'Available'
  WHERE id = p_product_id
    AND status = 'Reserved'
  RETURNING * INTO v_product;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % is not Reserved (already Available/Sold/Archived, or does not exist) — cannot release', p_product_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_product;
END;
$$;

REVOKE ALL ON FUNCTION release_product(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_product(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION release_product(uuid) TO authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT proname, prosecdef, proconfig FROM pg_proc
--   WHERE proname IN ('release_product','orders_staff_has_write_role');
-- Expect: release_product prosecdef = false (INVOKER), the helper
-- prosecdef = true; both proconfig = {search_path=public}.
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_name IN ('release_product','orders_staff_has_write_role');
-- Expect: authenticated, service_role, postgres only — no anon, no PUBLIC.
