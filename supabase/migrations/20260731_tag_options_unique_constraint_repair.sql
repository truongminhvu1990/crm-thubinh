-- Production Repair: tag_options is missing UNIQUE(category, value).
--
-- Root cause (see 20260720_vip_customer_care.sql's seed
-- INSERT INTO tag_options ... ON CONFLICT (category, value) DO NOTHING):
-- that statement assumes UNIQUE(category, value) already exists on
-- `tag_options`, as defined in 20260716_crm_baseline_master_data_tag_options.sql
-- (and originally 20260710_tag_options.sql). Production is missing that
-- constraint, so the ON CONFLICT clause has no matching unique/exclusion
-- constraint to target, failing with 42P10.
--
-- This migration only touches `tag_options`. No other table is modified.
--
-- Safety: a plain `ADD CONSTRAINT ... UNIQUE` would fail with a generic
-- 23505 unique-violation if duplicate (category, value) rows already
-- exist, without saying which rows. The DO block below checks for
-- duplicates first and RAISE EXCEPTIONs with the offending count and a
-- pointer to the diagnostic query, so the transaction aborts with an
-- actionable message instead of an opaque constraint-violation error.
--
-- Idempotent: the second DO block only runs ADD CONSTRAINT if a
-- constraint with this exact name isn't already registered on
-- `tag_options` in pg_constraint, so re-running this file after a
-- successful apply is a no-op.

BEGIN;

-- 1. Detect duplicates before attempting to create the constraint.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT category, value
    FROM tag_options
    GROUP BY category, value
    HAVING count(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'tag_options has % duplicate (category, value) group(s) — resolve before adding UNIQUE(category, value). Run: SELECT category, value, count(*), array_agg(id) FROM tag_options GROUP BY category, value HAVING count(*) > 1;', dup_count;
  END IF;
END $$;

-- 2. Create the constraint, skipped if it already exists (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tag_options'::regclass
      AND conname = 'tag_options_category_value_key'
  ) THEN
    ALTER TABLE tag_options
    ADD CONSTRAINT tag_options_category_value_key
    UNIQUE (category, value);
  END IF;
END $$;

COMMIT;

-- ============================================================
-- Verification:
-- ============================================================
-- PRE-FLIGHT - run BEFORE applying, not after. Expect 0 rows; any row
-- returned here is exactly what the DO block above will also detect and
-- abort on:
-- SELECT category, value, count(*), array_agg(id) AS tag_option_ids
-- FROM tag_options
-- GROUP BY category, value
-- HAVING count(*) > 1;
--
-- POST-APPLY (read-only, run after applying):
-- SELECT conname, contype, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'tag_options'::regclass
--   AND conname = 'tag_options_category_value_key';
--
-- Confirm no other table's constraints changed (expect only the row
-- above; no unrelated constraint additions):
-- SELECT conrelid::regclass AS table_name, conname
-- FROM pg_constraint
-- WHERE conname = 'tag_options_category_value_key';
