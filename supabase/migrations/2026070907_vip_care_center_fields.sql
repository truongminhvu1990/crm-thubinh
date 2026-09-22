-- Sprint 5: VIP Care Center.
-- Everything else the spec needs (interested categories, colors, budget,
-- wrist size, preferred origin, purpose) is already modeled by existing or
-- previously-issued columns - see the review notes in the assistant message
-- for the full mapping. Only two things are genuinely new:

-- 1) `ring_size` already exists on `customers` (dormant since the original
--    schema, unused until now) and is reused here as "Preferred Ring Size",
--    the same way `wrist_size` was reused in the 20260709_jade_specialization
--    migration. Normalized to text defensively, same reasoning as that file.
ALTER TABLE customers ALTER COLUMN ring_size TYPE text USING ring_size::text;

-- 2) Follow-up scheduling has no prior representation at all: a customer can
--    have at most one open scheduled reminder. Setting these two fields is
--    "Schedule Next Contact"; clearing them (set both to null) is completing
--    it. "Customers with open follow-up" = next_reminder_date IS NOT NULL.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS next_reminder_date date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS next_reminder_priority text;

-- Prerequisite reminder (not part of this file, not re-issued here):
-- 20260709_jade_specialization_fields.sql from Sprint 3 has not been applied
-- yet either, and this sprint's Wishlist section needs its `preferred_origin`
-- and `purpose` columns. Please run that one too if it hasn't been already.
