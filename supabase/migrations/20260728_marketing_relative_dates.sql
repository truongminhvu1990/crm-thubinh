-- Marketing CRM Foundation (Sprint v3.0.0) - fix for
-- 20260727_marketing_functions.sql: marketing_match_condition's
-- last_purchase/first_purchase 'before'/'after' operators originally only
-- accepted an absolute ISO date string. That breaks Dynamic segments'
-- "re-evaluated live, never a stored snapshot" requirement (Spec §2.1) for
-- the No-Purchase-30/60/90-Days templates specifically - a condition value
-- frozen at template-selection time (e.g. "before 2026-06-21") would stay
-- pinned to that date forever instead of rolling forward with today.
--
-- Fix: 'before'/'after' on last_purchase/first_purchase now accept EITHER
-- an ISO date string (absolute, unchanged) OR a plain jsonb number N,
-- interpreted as "N days before today's date, recomputed on every
-- evaluation" - the same relative semantics 'within_last_days' already
-- used. No table/column change - CREATE OR REPLACE on the existing
-- function only.

BEGIN;

CREATE OR REPLACE FUNCTION marketing_match_condition(
  p_field text,
  p_operator text,
  p_value jsonb,
  p_purchase_count bigint,
  p_lifetime_revenue numeric,
  p_last_purchase date,
  p_first_purchase date,
  p_birthday date,
  p_province text,
  p_district text,
  p_assigned_staff_id uuid,
  p_favorite_category text,
  p_favorite_product text,
  p_favorite_color text,
  p_budget text,
  p_vip_level text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_threshold date;
BEGIN
  CASE p_field
    WHEN 'purchase_count' THEN
      CASE p_operator
        WHEN 'equals' THEN RETURN COALESCE(p_purchase_count, 0) = (p_value#>>'{}')::numeric;
        WHEN 'not_equals' THEN RETURN COALESCE(p_purchase_count, 0) <> (p_value#>>'{}')::numeric;
        WHEN 'greater_than' THEN RETURN COALESCE(p_purchase_count, 0) > (p_value#>>'{}')::numeric;
        WHEN 'less_than' THEN RETURN COALESCE(p_purchase_count, 0) < (p_value#>>'{}')::numeric;
        WHEN 'between' THEN RETURN COALESCE(p_purchase_count, 0) BETWEEN (p_value->>0)::numeric AND (p_value->>1)::numeric;
        ELSE RETURN false;
      END CASE;

    WHEN 'lifetime_revenue' THEN
      CASE p_operator
        WHEN 'equals' THEN RETURN COALESCE(p_lifetime_revenue, 0) = (p_value#>>'{}')::numeric;
        WHEN 'not_equals' THEN RETURN COALESCE(p_lifetime_revenue, 0) <> (p_value#>>'{}')::numeric;
        WHEN 'greater_than' THEN RETURN COALESCE(p_lifetime_revenue, 0) > (p_value#>>'{}')::numeric;
        WHEN 'less_than' THEN RETURN COALESCE(p_lifetime_revenue, 0) < (p_value#>>'{}')::numeric;
        WHEN 'between' THEN RETURN COALESCE(p_lifetime_revenue, 0) BETWEEN (p_value->>0)::numeric AND (p_value->>1)::numeric;
        ELSE RETURN false;
      END CASE;

    WHEN 'last_purchase' THEN
      CASE p_operator
        WHEN 'before' THEN
          v_threshold := CASE WHEN jsonb_typeof(p_value) = 'number' THEN CURRENT_DATE - (p_value#>>'{}')::int ELSE (p_value#>>'{}')::date END;
          RETURN p_last_purchase IS NULL OR p_last_purchase < v_threshold;
        WHEN 'after' THEN
          v_threshold := CASE WHEN jsonb_typeof(p_value) = 'number' THEN CURRENT_DATE - (p_value#>>'{}')::int ELSE (p_value#>>'{}')::date END;
          RETURN p_last_purchase IS NOT NULL AND p_last_purchase > v_threshold;
        WHEN 'within_last_days' THEN RETURN p_last_purchase IS NOT NULL AND p_last_purchase >= CURRENT_DATE - (p_value#>>'{}')::int;
        ELSE RETURN false;
      END CASE;

    WHEN 'first_purchase' THEN
      CASE p_operator
        WHEN 'before' THEN
          v_threshold := CASE WHEN jsonb_typeof(p_value) = 'number' THEN CURRENT_DATE - (p_value#>>'{}')::int ELSE (p_value#>>'{}')::date END;
          RETURN p_first_purchase IS NOT NULL AND p_first_purchase < v_threshold;
        WHEN 'after' THEN
          v_threshold := CASE WHEN jsonb_typeof(p_value) = 'number' THEN CURRENT_DATE - (p_value#>>'{}')::int ELSE (p_value#>>'{}')::date END;
          RETURN p_first_purchase IS NOT NULL AND p_first_purchase > v_threshold;
        WHEN 'within_last_days' THEN RETURN p_first_purchase IS NOT NULL AND p_first_purchase >= CURRENT_DATE - (p_value#>>'{}')::int;
        ELSE RETURN false;
      END CASE;

    WHEN 'birthday' THEN
      IF p_birthday IS NULL THEN RETURN false; END IF;
      CASE (p_value#>>'{}')
        WHEN 'today' THEN RETURN marketing_next_birthday_occurrence(p_birthday) = CURRENT_DATE;
        WHEN 'this_month' THEN RETURN extract(month FROM p_birthday) = extract(month FROM CURRENT_DATE);
        ELSE RETURN to_char(p_birthday, 'MM-DD') = (p_value#>>'{}');
      END CASE;

    WHEN 'province' THEN
      CASE p_operator
        WHEN 'equals' THEN RETURN p_province = (p_value#>>'{}');
        WHEN 'contains' THEN RETURN p_province ILIKE '%' || (p_value#>>'{}') || '%';
        ELSE RETURN false;
      END CASE;

    WHEN 'district' THEN
      CASE p_operator
        WHEN 'equals' THEN RETURN p_district = (p_value#>>'{}');
        WHEN 'contains' THEN RETURN p_district ILIKE '%' || (p_value#>>'{}') || '%';
        ELSE RETURN false;
      END CASE;

    WHEN 'assigned_staff' THEN
      RETURN p_assigned_staff_id IS NOT NULL AND p_assigned_staff_id::text = (p_value#>>'{}');

    WHEN 'favorite_category' THEN
      CASE p_operator
        WHEN 'equals' THEN RETURN p_favorite_category = (p_value#>>'{}');
        WHEN 'contains' THEN RETURN p_favorite_category ILIKE '%' || (p_value#>>'{}') || '%';
        ELSE RETURN false;
      END CASE;

    WHEN 'favorite_product' THEN
      CASE p_operator
        WHEN 'equals' THEN RETURN p_favorite_product = (p_value#>>'{}');
        WHEN 'contains' THEN RETURN p_favorite_product ILIKE '%' || (p_value#>>'{}') || '%';
        ELSE RETURN false;
      END CASE;

    WHEN 'favorite_color' THEN
      RETURN p_favorite_color ILIKE '%' || (p_value#>>'{}') || '%';

    WHEN 'budget' THEN
      CASE p_operator
        WHEN 'equals' THEN RETURN p_budget = (p_value#>>'{}');
        WHEN 'contains' THEN RETURN p_budget ILIKE '%' || (p_value#>>'{}') || '%';
        ELSE RETURN false;
      END CASE;

    WHEN 'vip_level' THEN
      RETURN p_vip_level = (p_value#>>'{}');

    ELSE
      RETURN false;
  END CASE;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT marketing_segment_customer_count('[{"field":"last_purchase","operator":"before","value":30}]'::jsonb, 'AND'); -- relative, rolling
-- SELECT marketing_segment_customer_count('[{"field":"last_purchase","operator":"before","value":"2026-01-01"}]'::jsonb, 'AND'); -- absolute, unchanged
