-- Persistent, atomic order-number sequence (BUG-ORDER-LIFECYCLE-001 Phase 1)
-- — replaces generateOrderNumber's live-row-count with a real counter,
-- fixing both the deletion-reuse and the concurrent-creation race
-- confirmed in the prior investigation. Additive only: one new table, one
-- new function, zero existing tables/columns touched.

BEGIN;

CREATE TABLE IF NOT EXISTS order_number_counters (
  business_date date PRIMARY KEY,
  last_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_number_counters ENABLE ROW LEVEL SECURITY;

-- authenticated-only, matching every Phase 1A/1B table in this schema —
-- no anon policy.
CREATE POLICY "Allow full access to authenticated" ON order_number_counters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- One-time seed so the very first order created after this migration
-- doesn't collide with orders already created today via the old
-- count-based scheme (a real risk if this deploys mid-day). Purely a
-- read of the existing `orders` table + one INSERT into the brand-new
-- table — no existing row is touched.
INSERT INTO order_number_counters (business_date, last_sequence)
SELECT CURRENT_DATE, count(*)
FROM orders
WHERE order_number LIKE 'OD-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-%'
ON CONFLICT (business_date) DO NOTHING;

-- Atomic increment-and-return. The INSERT ... ON CONFLICT DO UPDATE
-- pattern is race-free under Postgres's own row-level locking — two
-- concurrent callers for the same date cannot both receive the same
-- sequence number, unlike the old SELECT-count-then-compute approach.
CREATE OR REPLACE FUNCTION generate_order_sequence(p_business_date date)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sequence integer;
BEGIN
  INSERT INTO order_number_counters (business_date, last_sequence, updated_at)
  VALUES (p_business_date, 1, now())
  ON CONFLICT (business_date)
  DO UPDATE SET last_sequence = order_number_counters.last_sequence + 1, updated_at = now()
  RETURNING last_sequence INTO v_sequence;

  RETURN v_sequence;
END;
$$;

REVOKE ALL ON FUNCTION generate_order_sequence(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_order_sequence(date) TO authenticated;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT * FROM order_number_counters WHERE business_date = CURRENT_DATE;
--   Expect last_sequence = today's actual live order count.
-- SELECT generate_order_sequence(CURRENT_DATE);  -- run twice
--   Expect two consecutive integers, each one higher than the seeded value.
