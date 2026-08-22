-- products.reserveProduct -> reserve_product() RPC (Phase 1A, INV-020).
--
-- ============================================================
-- AUTHORIZATION MODEL FINDING (read before touching this file)
-- ============================================================
-- INV-020's own instruction was: "Do not automatically reuse
-- inventory.adjust... Reuse the exact existing permission architecture that
-- currently authorizes Order mutation/reservation." That architecture was
-- traced to app/api/orders/_authorization.ts's authorizeOrderWrite(), which
-- is NOT a permissions/role_permissions permission-key check like
-- inventory.adjust. It is two things: (1) ORDERS_WRITE_SCOPE_BY_ROLE_KEY, a
-- hardcoded role->scope map the file's own header comment labels a
-- "TEMPORARY COMPATIBILITY LAYER" (Package 4A, PARTIAL APPROVED) with an
-- explicit instruction — "Do NOT copy ORDERS_WRITE_SCOPE_BY_ROLE_KEY or
-- isOrderInWriteScope into any other module... not a precedent to silently
-- reuse from here" — and (2) isOrderInWriteScope(), an order-specific Data
-- Scope check (Own/Team/All) matched against orders.sales_owner, which
-- requires knowing *which order* a reservation belongs to. reserveProduct()
-- is called from addProductToOrder() with only a product_id — no order_id
-- reaches this layer today, and INV-020 §5 itself directs the RPC contract
-- toward "a product identifier as the mutation target," not an expanded
-- one. A permissions-table check for a stable "orders.write"-style key was
-- also confirmed NOT to exist (only orders.record_payment/view_payment are
-- seeded).
--
-- Reproducing authorizeOrderWrite's logic here would require either (a)
-- copying the explicitly-do-not-copy role/scope mapping and Data-Scope
-- logic into a second, harder-to-delete location (a live migration, not a
-- single TS file) — directly undermining that file's own stated reason for
-- being isolated ("can be deleted in one place" once Package 4D lands), or
-- (b) inventing a narrower substitute not authorized by this task ("Do not
-- create a new permission key without explicit authorization" / "Do not
-- silently... broaden the task"). Per INV-020 §17's Failure Rule ("the
-- existing business eligibility rule is ambiguous... STOP and report"),
-- this function does NOT attempt either. What IS safely, non-ambiguously
-- reproducible without copying anything is required instead: the caller
-- must be authenticated (EXECUTE revoked from anon/PUBLIC) AND must resolve
-- to a real, current staff record, via inventory_current_staff_id() —
-- already a generic helper (INV-016), and already flagged in that
-- migration's own comments as intended for reuse by this exact later work.
-- This is a real, meaningful floor (an authenticated Supabase Auth session
-- with no matching staff row is rejected) but it is NOT role-scoped and NOT
-- order-Data-Scope-scoped. authorizeOrderWrite at the app layer remains the
-- ONLY enforcement of "does this staff member's role/Data-Scope permit
-- writing to this order" — completely unchanged by this migration. This
-- gap is intentional and reported, not an oversight; see INV-020's final
-- report for the full evidence trail.
--
-- Everything else in this task (atomicity, status vocabulary, function
-- shape) follows the INV-016 pattern exactly.
--
-- Scope: reserve_product() only. No change to inventory_current_staff_id()
-- or inventory_staff_has_permission() (reused as-is, unmodified). No RLS
-- policy, trigger, or other RPC touched. No new permission key created.

BEGIN;

-- SECURITY INVOKER (locked preference, unchanged from every other RPC in
-- this domain) — its own UPDATE is covered by the existing authenticated-
-- only products RLS UPDATE policy (INV-012B), not by function privilege.
CREATE OR REPLACE FUNCTION reserve_product(p_product_id uuid)
RETURNS products
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product products;
BEGIN
  IF inventory_current_staff_id() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: caller does not resolve to a staff record'
      USING ERRCODE = '42501';
  END IF;

  UPDATE products
  SET status = 'Reserved'
  WHERE id = p_product_id
    AND status = 'Available'
  RETURNING * INTO v_product;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % is not Available (already reserved by another order, or not sellable)', p_product_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_product;
END;
$$;

-- Same anon/PUBLIC closure as adjust_product_inventory (INV-016) — no
-- legitimate flow needs anonymous or unauthenticated-role access.
REVOKE ALL ON FUNCTION reserve_product(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_product(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION reserve_product(uuid) TO authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname = 'reserve_product';
-- Expect: prosecdef = false (INVOKER), proconfig = {search_path=public}.
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_name = 'reserve_product';
-- Expect: authenticated, service_role, postgres only — no anon, no PUBLIC.
-- Concurrency: two simultaneous `SELECT reserve_product('<id>')` calls
-- against the same Available product must resolve to exactly one success
-- and one "not Available" failure — never both succeeding, never both
-- failing when the product started Available.
