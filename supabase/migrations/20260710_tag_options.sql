-- Sprint V1.0.3: freeform creatable tags for favorite_color, jade_type,
-- and purchase_purpose - created inline from the field that uses them,
-- with no admin screen. master_data (see the master_data migration) never
-- includes these 3 categories, so there's nothing to migrate out of it.

CREATE TABLE IF NOT EXISTS tag_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'favorite_color', 'jade_type', 'purchase_purpose'
  )),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, value)
);

ALTER TABLE tag_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON tag_options;
CREATE POLICY "Allow full access to anon" ON tag_options
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- No seed rows - values are created inline as users type them (Creatable
-- Select), the first time each one is used.
