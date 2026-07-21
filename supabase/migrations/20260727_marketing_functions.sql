-- Marketing CRM Foundation (Sprint v3.0.0), Package 1b - Dynamic Segment
-- evaluation + Dashboard/Birthday Center aggregate functions.
--
-- Same rationale as 20260724_reports_bi_functions.sql: "which customers
-- match a segment's condition set" and every Dashboard/Birthday count is
-- computed entirely in Postgres, never by fetching raw customers/
-- customer_purchases rows into JS to filter (Spec Feature 13). No new
-- table, no cache/snapshot - conditions are passed in as a jsonb parameter
-- (from marketing_segment_conditions when evaluating a saved segment, or
-- from an unsaved draft when the Segment Builder's Live Preview runs before
-- Save), matching MARKETING_DATABASE.md §8's "assembled at the application
-- layer from stored conditions at query time" design.
--
-- Condition JSON shape per row: {"field": <one of the 13 CHECK-constrained
-- keys>, "operator": <one of the 9 CHECK-constrained keys>, "value": <see
-- below>}. Value shape by field/operator (documented once here, mirrored in
-- lib/marketing/marketing.repository.ts):
--   - purchase_count / lifetime_revenue: number (equals/greater_than/
--     less_than) or [number, number] (between).
--   - last_purchase / first_purchase: ISO date string (before/after), or a
--     plain integer N (within_last_days - "in the last N days"). last_purchase
--     additionally treats a customer with NO purchase at all as "before" any
--     date (never having purchased trivially satisfies "no purchase since
--     X") but never satisfies "after"/"within_last_days".
--   - birthday: 'today' | 'this_month' | 'MM-DD' string (equals) - month/day
--     only, no year, matching how the Birthday Center (Feature 10) and the
--     Marketing Dashboard's Birthday cards (Feature 11) read the same field.
--   - province / district / budget / favorite_category / favorite_product:
--     string (equals or contains).
--   - assigned_staff: staff.id uuid string (equals).
--   - favorite_color: string (contains - `customers.favorite_color` is a
--     comma-separated multi-value column, matched substring-wise).
--   - vip_level: string (equals).
--
-- LANGUAGE sql/plpgsql STABLE + SECURITY INVOKER, same as Reports BI - pure
-- reads, runs under the querying role's own RLS (a no-op here since every
-- table involved already has an unrestricted "Allow full access" policy).

BEGIN;

-- ============================================================
-- 1. marketing_next_birthday_occurrence - the next calendar date (this year
--    or next) a customer's month/day birthday falls on. Guards Feb 29 in a
--    non-leap year by falling back to Feb 28, since make_date() would
--    otherwise raise. Shared by the Dashboard's Birthday cards, Birthday
--    Center, and the Segment Builder's Birthday condition, so all three
--    surfaces can never disagree on what "today"/"this week" means.
-- ============================================================

CREATE OR REPLACE FUNCTION marketing_next_birthday_occurrence(p_birthday date)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_month int := extract(month FROM p_birthday);
  v_day int := extract(day FROM p_birthday);
  v_year int := extract(year FROM CURRENT_DATE);
  v_result date;
BEGIN
  BEGIN
    v_result := make_date(v_year, v_month, v_day);
  EXCEPTION WHEN OTHERS THEN
    v_result := make_date(v_year, v_month, v_day - 1);
  END;
  IF v_result < CURRENT_DATE THEN
    BEGIN
      v_result := make_date(v_year + 1, v_month, v_day);
    EXCEPTION WHEN OTHERS THEN
      v_result := make_date(v_year + 1, v_month, v_day - 1);
    END;
  END IF;
  RETURN v_result;
END;
$$;

-- ============================================================
-- 2. marketing_match_condition - evaluates ONE condition against one
--    customer's precomputed metrics. Centralizing every field/operator
--    branch in one function (rather than inlining a nested CASE per field
--    into the set-returning query below) keeps the matching rules in one
--    place to extend later. Defensive: any parse failure (e.g. malformed
--    value) is caught and treated as "does not match" rather than failing
--    the whole segment evaluation.
-- ============================================================

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
        WHEN 'before' THEN RETURN p_last_purchase IS NULL OR p_last_purchase < (p_value#>>'{}')::date;
        WHEN 'after' THEN RETURN p_last_purchase IS NOT NULL AND p_last_purchase > (p_value#>>'{}')::date;
        WHEN 'within_last_days' THEN RETURN p_last_purchase IS NOT NULL AND p_last_purchase >= CURRENT_DATE - (p_value#>>'{}')::int;
        ELSE RETURN false;
      END CASE;

    WHEN 'first_purchase' THEN
      CASE p_operator
        WHEN 'before' THEN RETURN p_first_purchase IS NOT NULL AND p_first_purchase < (p_value#>>'{}')::date;
        WHEN 'after' THEN RETURN p_first_purchase IS NOT NULL AND p_first_purchase > (p_value#>>'{}')::date;
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

-- ============================================================
-- 3. marketing_segment_match_ids - every customer.id matching a condition
--    set under the given AND/OR logic. Zero conditions matches everyone
--    (Segment Builder's empty-state design, MARKETING_UI.md §4.1).
-- ============================================================

CREATE OR REPLACE FUNCTION marketing_segment_match_ids(p_conditions jsonb DEFAULT '[]'::jsonb, p_logic text DEFAULT 'AND')
RETURNS TABLE (customer_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH customer_metrics AS (
    SELECT
      c.id, c.birthday, c.province, c.district, c.assigned_staff_id,
      c.favorite_color, c.budget, c.vip_level,
      pm.purchase_count, pm.lifetime_revenue, pm.last_purchase, pm.first_purchase,
      fav.favorite_category, fav.favorite_product
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS purchase_count, SUM(sale_price) AS lifetime_revenue,
             MAX(sale_date) AS last_purchase, MIN(sale_date) AS first_purchase
      FROM customer_purchases GROUP BY customer_id
    ) pm ON pm.customer_id = c.id
    LEFT JOIN LATERAL (
      SELECT p.category AS favorite_category, p.product_name AS favorite_product
      FROM customer_purchases cp2
      JOIN products p ON p.id = cp2.product_id
      WHERE cp2.customer_id = c.id
      GROUP BY p.category, p.product_name
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) fav ON true
  ),
  conditions AS (
    SELECT elem->>'field' AS field, elem->>'operator' AS operator, elem->'value' AS value
    FROM jsonb_array_elements(COALESCE(p_conditions, '[]'::jsonb)) AS elem
  ),
  matches AS (
    SELECT
      cm.id AS customer_id,
      marketing_match_condition(
        cnd.field, cnd.operator, cnd.value,
        cm.purchase_count, cm.lifetime_revenue, cm.last_purchase, cm.first_purchase, cm.birthday,
        cm.province, cm.district, cm.assigned_staff_id, cm.favorite_category, cm.favorite_product,
        cm.favorite_color, cm.budget, cm.vip_level
      ) AS is_match
    FROM customer_metrics cm
    CROSS JOIN conditions cnd
  ),
  per_customer AS (
    SELECT customer_id, bool_and(is_match) AS all_match, bool_or(is_match) AS any_match
    FROM matches
    GROUP BY customer_id
  )
  SELECT cm.id AS customer_id
  FROM customer_metrics cm
  LEFT JOIN per_customer pc ON pc.customer_id = cm.id
  WHERE
    jsonb_array_length(COALESCE(p_conditions, '[]'::jsonb)) = 0
    OR (p_logic = 'OR' AND pc.any_match)
    OR (p_logic <> 'OR' AND pc.all_match);
$$;

-- ============================================================
-- 4. marketing_segment_customer_count / _list - Feature 3 (Segment
--    Preview) and Segment Detail's live stats. _list is LIMIT/OFFSET-bound
--    (Feature 13 - never fetch-all-then-slice).
-- ============================================================

CREATE OR REPLACE FUNCTION marketing_segment_customer_count(p_conditions jsonb DEFAULT '[]'::jsonb, p_logic text DEFAULT 'AND')
RETURNS bigint
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT COUNT(*) FROM marketing_segment_match_ids(p_conditions, p_logic);
$$;

CREATE OR REPLACE FUNCTION marketing_segment_customer_list(
  p_conditions jsonb DEFAULT '[]'::jsonb,
  p_logic text DEFAULT 'AND',
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (id uuid, customer_code text, full_name text, phone text)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT c.id, c.customer_code, c.full_name, c.phone
  FROM customers c
  JOIN marketing_segment_match_ids(p_conditions, p_logic) m ON m.customer_id = c.id
  ORDER BY c.full_name
  LIMIT p_limit OFFSET p_offset;
$$;

-- ============================================================
-- 5. marketing_dashboard_counts - Feature 11's 7 cards, one round trip.
--    No-Purchase-N-Days treats "never purchased" the same as "last
--    purchase older than N days" (both are customers marketing should
--    re-engage), matching the Segment Builder's `last_purchase`/`before`
--    semantics above.
-- ============================================================

CREATE OR REPLACE FUNCTION marketing_dashboard_counts()
RETURNS TABLE (
  segment_count bigint,
  campaign_count bigint,
  birthday_today bigint,
  birthday_this_month bigint,
  no_purchase_30 bigint,
  no_purchase_60 bigint,
  no_purchase_90 bigint
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH last_purchase AS (
    SELECT customer_id, MAX(sale_date) AS last_date FROM customer_purchases GROUP BY customer_id
  )
  SELECT
    (SELECT COUNT(*) FROM marketing_segments),
    (SELECT COUNT(*) FROM marketing_campaigns),
    (SELECT COUNT(*) FROM customers WHERE birthday IS NOT NULL AND marketing_next_birthday_occurrence(birthday) = CURRENT_DATE),
    (SELECT COUNT(*) FROM customers WHERE birthday IS NOT NULL AND extract(month FROM birthday) = extract(month FROM CURRENT_DATE)),
    (SELECT COUNT(*) FROM customers c LEFT JOIN last_purchase lp ON lp.customer_id = c.id WHERE lp.last_date IS NULL OR lp.last_date < CURRENT_DATE - 30),
    (SELECT COUNT(*) FROM customers c LEFT JOIN last_purchase lp ON lp.customer_id = c.id WHERE lp.last_date IS NULL OR lp.last_date < CURRENT_DATE - 60),
    (SELECT COUNT(*) FROM customers c LEFT JOIN last_purchase lp ON lp.customer_id = c.id WHERE lp.last_date IS NULL OR lp.last_date < CURRENT_DATE - 90);
$$;

-- ============================================================
-- 6. marketing_birthday_customers - Feature 10 (Birthday Center)'s three
--    buckets. p_bucket in ('today','week','month'); p_search scoped to
--    'month' only per MARKETING_UI.md §7 (Today/This Week are short lists).
-- ============================================================

CREATE OR REPLACE FUNCTION marketing_birthday_customers(p_bucket text DEFAULT 'today', p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, customer_code text, full_name text, phone text, birthday date, vip_level text)
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.customer_code, c.full_name, c.phone, c.birthday, c.vip_level
  FROM customers c
  WHERE c.birthday IS NOT NULL
    AND (
      (p_bucket = 'today' AND marketing_next_birthday_occurrence(c.birthday) = CURRENT_DATE)
      OR (p_bucket = 'week' AND marketing_next_birthday_occurrence(c.birthday) BETWEEN CURRENT_DATE AND CURRENT_DATE + 6)
      OR (p_bucket = 'month' AND extract(month FROM c.birthday) = extract(month FROM CURRENT_DATE))
    )
    AND (p_search IS NULL OR p_search = '' OR c.full_name ILIKE '%' || p_search || '%')
  ORDER BY marketing_next_birthday_occurrence(c.birthday);
END;
$$;

-- ============================================================
-- 7. Grants - same "anon + authenticated" shape as every function/policy
--    in this schema.
-- ============================================================

GRANT EXECUTE ON FUNCTION marketing_next_birthday_occurrence(date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION marketing_match_condition(text, text, jsonb, bigint, numeric, date, date, date, text, text, uuid, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION marketing_segment_match_ids(jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION marketing_segment_customer_count(jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION marketing_segment_customer_list(jsonb, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION marketing_dashboard_counts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION marketing_birthday_customers(text, text) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT * FROM marketing_dashboard_counts();
-- SELECT * FROM marketing_birthday_customers('today', NULL);
-- SELECT marketing_segment_customer_count('[]'::jsonb, 'AND'); -- should equal total customer count
-- SELECT marketing_segment_customer_count('[{"field":"vip_level","operator":"equals","value":"VIP"}]'::jsonb, 'AND');
-- SELECT * FROM marketing_segment_customer_list('[]'::jsonb, 'AND', 5, 0);
