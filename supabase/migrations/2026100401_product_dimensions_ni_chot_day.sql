-- Product Ni-Chột-Dày (Product Owner spec, 2026-10-04).
--
-- Adds the three body dimensions of a jadeite bracelet ("Vòng") / ring
-- ("Nhẫn"), in millimeters:
--   dimension_ni_mm   Ni   = inner diameter (wrist size / ring size)
--   dimension_chot_mm Chột = body width
--   dimension_day_mm  Dày  = body thickness
--
-- Deliberately minimal and additive:
--   * nullable, no default, no NOT NULL, no backfill - existing products
--     (including the Available Vòng/Nhẫn ones) stay NULL until entered by
--     hand through the Product form;
--   * no CHECK constraints - the PO has not approved numeric bounds, and the
--     "Available Vòng/Nhẫn require all three" rule is a manual-Product-save
--     rule enforced in lib/productDimension.ts / lib/product.service.ts,
--     NOT a database invariant (system-driven status changes such as order
--     revert / return-to-supplier must keep working);
--   * products.size is NOT touched (type, data, meaning all unchanged);
--   * the combined "Ni-Chột-Dày" string is never stored.
--
-- Idempotent: safe to re-run.

ALTER TABLE products ADD COLUMN IF NOT EXISTS dimension_ni_mm numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimension_chot_mm numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimension_day_mm numeric;

COMMENT ON COLUMN products.dimension_ni_mm IS 'Ni (mm): inner diameter / wrist size (Vòng) or ring size (Nhẫn). Nullable. Independent of legacy products.size.';
COMMENT ON COLUMN products.dimension_chot_mm IS 'Chột (mm): body width. Nullable.';
COMMENT ON COLUMN products.dimension_day_mm IS 'Dày (mm): body thickness. Nullable.';
