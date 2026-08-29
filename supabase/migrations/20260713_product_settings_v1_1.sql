-- Product Settings V1.1 (final spec) - supersedes the never-applied
-- 20260712 draft, so this goes straight from the current live schema.
--
-- Settings manages exactly 3 product master-data lists: Category, Source
-- (already existed, untouched), and Color. Size is NOT a master-data
-- category - it's a plain numeric field on products (confirmed already
-- exists on the live table, already numeric-typed, so nothing to add
-- here). notes also already exists on products - not recreated either.
-- No seed rows for the 2 new categories - populated entirely from
-- Settings.
--
-- Origin/Jade Type/Texture/Transparency/Shape/Ring Size/Bracelet Size are
-- removed from the Product form. Their existing columns are left in place
-- untouched - no data is dropped, they're just no longer read/written by
-- the app. Jade Grade stays a freeform creatable tag (tag_options).

ALTER TABLE master_data DROP CONSTRAINT IF EXISTS master_data_category_check;
ALTER TABLE master_data ADD CONSTRAINT master_data_category_check
  CHECK (category IN (
    'salesperson', 'product_source', 'customer_stage',
    'product_category', 'product_color'
  ));

ALTER TABLE tag_options DROP CONSTRAINT IF EXISTS tag_options_category_check;
ALTER TABLE tag_options ADD CONSTRAINT tag_options_category_check
  CHECK (category IN (
    'favorite_color', 'jade_type', 'purchase_purpose', 'product_jade_grade'
  ));

ALTER TABLE products ADD COLUMN IF NOT EXISTS jade_grade text;
