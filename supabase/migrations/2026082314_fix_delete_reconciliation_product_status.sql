-- Fix delete_order_with_reconciliation's stale product-status release
-- (BUG-ORDER-LIFECYCLE-001 Phase 1, item 2) — confirmed live via
-- pg_get_functiondef immediately before authoring this migration: the
-- function currently writes status = 'Active' when releasing Reserved/
-- Sold products, a value retired by the Product Status Standardization
-- (docs/02_PRODUCT_SPEC.md §7, LOCKED four-value model: Available/
-- Reserved/Sold/Archived). The correct value is 'Available', matching
-- releaseProduct()'s own behavior for the non-admin delete path.
--
-- Scope: ONE literal changed. Every other line (p_staff_id/role
-- re-verification, order-existence check, Confirmed/Handed-Off
-- compensation guard, sales_commissions/customer_purchases/compensations
-- reconciliation, SECURITY DEFINER, search_path pinning, the final
-- orders delete) is reproduced byte-for-byte from the confirmed live
-- definition. No delete behavior, permission, or authorization change.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_order_with_reconciliation(p_staff_id uuid, p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role_key text;
  v_item_ids uuid[];
  v_product_ids uuid[];
  v_purchase_ids uuid[];
BEGIN
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

  IF v_role_key IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION 'Forbidden: only Owner may delete an order with reconciliation' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM compensations
    WHERE order_id = p_order_id AND status IN ('Confirmed', 'Handed Off')
  ) THEN
    RAISE EXCEPTION 'Order has a Confirmed or Handed Off compensation — cannot delete' USING ERRCODE = '42501';
  END IF;

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
    SET status = 'Available'
    WHERE id = ANY(v_product_ids) AND status IN ('Reserved', 'Sold');
  END IF;

  DELETE FROM orders WHERE id = p_order_id;
END;
$function$;

-- Reasserted defensively (CREATE OR REPLACE preserves existing grants
-- automatically, but this makes the intended state explicit and
-- self-verifying rather than relying on that implicitly).
REVOKE ALL ON FUNCTION delete_order_with_reconciliation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_order_with_reconciliation(uuid, uuid) TO service_role;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'delete_order_with_reconciliation';
--   Expect: SET status = 'Available' (not 'Active'), everything else unchanged.
-- SELECT rolname, has_function_privilege(oid, 'delete_order_with_reconciliation(uuid,uuid)'::regprocedure, 'EXECUTE')
--   FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
--   Expect FALSE, FALSE, TRUE — unchanged from before this migration.
