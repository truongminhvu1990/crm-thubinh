-- Sprint V1.0.2: Master Data settings.
-- Single generic lookup table backing the 6 configurable dropdown
-- categories (Settings > Master Data). `value` doubles as the stored
-- identifier and the display text - there is no separate label column.

CREATE TABLE IF NOT EXISTS master_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'salesperson', 'product_source', 'favorite_color',
    'jade_type', 'purchase_purpose', 'customer_stage'
  )),
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, value)
);

ALTER TABLE master_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON master_data;
CREATE POLICY "Allow full access to anon" ON master_data
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Seed values, migrated from the old hardcoded lib/customer.constants.ts and
-- lib/product.constants.ts arrays. `product_source` values already matched
-- their old value/label 1:1; the rest are seeded with the Vietnamese label
-- text since this table has no separate value/label split - existing
-- customer/product rows that stored the old English codes (e.g. "Bracelet",
-- "Lead") keep displaying correctly via the app's "unknown value falls back
-- to raw stored text" behavior, they just won't be pre-translated.
-- customer_stage keeps the literal "VIP" value because the existing VIP
-- badge does a raw `vip_level === 'VIP'` string compare.
INSERT INTO master_data (category, value, sort_order) VALUES
  ('product_source', 'Sẵn', 0),
  ('product_source', 'OD', 1),
  ('product_source', 'ODNH', 2),
  ('product_source', 'ODCAO', 3),
  ('product_source', 'ODMASTER', 4),
  ('product_source', 'ODNHVN', 5),
  ('product_source', 'Pass', 6),
  ('product_source', 'Hàng My', 7),
  ('product_source', 'Offline', 8),

  ('favorite_color', 'Xanh lục', 0),
  ('favorite_color', 'Tím oải hương', 1),
  ('favorite_color', 'Trắng', 2),
  ('favorite_color', 'Vàng', 3),
  ('favorite_color', 'Đen', 4),

  ('jade_type', 'Vòng tay', 0),
  ('jade_type', 'Nhẫn', 1),
  ('jade_type', 'Mặt dây chuyền', 2),
  ('jade_type', 'Tượng điêu khắc', 3),
  ('jade_type', 'Chuỗi hạt', 4),

  ('purchase_purpose', 'Dùng cho bản thân', 0),
  ('purchase_purpose', 'Quà tặng', 1),
  ('purchase_purpose', 'Phong thủy', 2),
  ('purchase_purpose', 'Đầu tư', 3),

  ('customer_stage', 'Khách tiềm năng', 0),
  ('customer_stage', 'Quan tâm', 1),
  ('customer_stage', 'Đang đàm phán', 2),
  ('customer_stage', 'Đã mua hàng', 3),
  ('customer_stage', 'VIP', 4)
ON CONFLICT (category, value) DO NOTHING;

-- salesperson: no seed rows, matching the old (empty) SALESPEOPLE array.
