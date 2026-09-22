-- Sprint 3: jade-business customer fields.
-- Reuses existing columns wherever the name/purpose already matches
-- (wrist_size, favorite_type, favorite_color, budget, vip_level) --
-- only genuinely new fields get a new column.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_origin text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS purpose text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_salesperson text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_viewed_product text;

-- Normalize reused columns to text so free-form values (e.g. "Bracelet,Ring"
-- for multi-select, or a budget range string) can't hit a type mismatch,
-- regardless of whatever type they currently have.
ALTER TABLE customers ALTER COLUMN wrist_size TYPE text USING wrist_size::text;
ALTER TABLE customers ALTER COLUMN favorite_type TYPE text USING favorite_type::text;
ALTER TABLE customers ALTER COLUMN favorite_color TYPE text USING favorite_color::text;
ALTER TABLE customers ALTER COLUMN budget TYPE text USING budget::text;
