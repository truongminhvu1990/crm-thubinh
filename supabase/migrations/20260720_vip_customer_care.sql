-- VIP Customer Care (Sprint v1.1.0).
-- Purely additive: 4 new nullable columns on `customers`, plus extending
-- `tag_options`'s category CHECK constraint with one new value so Tags can
-- reuse the exact same Creatable Multi-Select + tag_options infrastructure
-- already used for favorite_type/favorite_color/purchase_purpose (see
-- 20260716_crm_baseline_master_data_tag_options.sql, extended the same way
-- by 20260713_product_settings_v1_1.sql for product_jade_grade). No table
-- is created or dropped, no existing column is altered/removed.
--
-- Note for the record: `customers.next_reminder_date` / `next_reminder_priority`
-- already exist from an earlier, differently-named "VIP Care Center" effort
-- (20260709_vip_care_center_fields.sql) but are dormant - no code in this
-- repo reads or writes them. This task's brief asks for `next_followup_date`
-- / `followup_note` specifically, so those are added fresh rather than
-- reusing the dormant pair; flagged here rather than silently reconciled.
--
-- Customer Timeline (status changed / tag added / tag removed / follow-up
-- updated) deliberately does NOT get its own new table - it's built by
-- appending typed entries into the customer's existing `notes` JSON column
-- (already the mechanism behind the current "Timeline" card), reusing an
-- already-approved field instead of introducing a new one.

BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_tags text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_status text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS next_followup_date date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS followup_note text;

ALTER TABLE tag_options DROP CONSTRAINT IF EXISTS tag_options_category_check;
ALTER TABLE tag_options ADD CONSTRAINT tag_options_category_check
  CHECK (category IN (
    'favorite_color', 'jade_type', 'purchase_purpose', 'product_jade_grade', 'customer_tag'
  ));

-- Seed the preset tags named in the brief (VIP, Potential, Wholesale,
-- Retail, Important, Follow Up) so they're selectable immediately - unlike
-- the fully-freeform categories above, this list was given explicitly as
-- named examples rather than "created inline as users type them."
INSERT INTO tag_options (category, value)
VALUES
  ('customer_tag', 'VIP'),
  ('customer_tag', 'Potential'),
  ('customer_tag', 'Wholesale'),
  ('customer_tag', 'Retail'),
  ('customer_tag', 'Important'),
  ('customer_tag', 'Follow Up')
ON CONFLICT (category, value) DO NOTHING;

-- Backfill existing rows to the default pipeline state so the Customer
-- List/Detail status badge never renders as "unset" for pre-existing data.
UPDATE customers SET customer_status = 'New' WHERE customer_status IS NULL;

COMMIT;

-- Verification (read-only, run after applying):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'customers'
--   AND column_name IN ('customer_tags','customer_status','next_followup_date','followup_note');
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'tag_options_category_check';
-- SELECT value FROM tag_options WHERE category = 'customer_tag' ORDER BY value;
