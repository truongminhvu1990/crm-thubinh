-- Customer Market V1.
-- Replaces the hardcoded Province/District dependent-dropdown UI with a
-- Settings-managed "Market" master-data category + a freeform "Local Area"
-- text field. Reuses the existing customers.province/district columns -
-- no schema change, no data migration needed: whatever a customer's
-- province already was, it already is the market value (old rows just
-- show as an extra selectable option, via the app's established
-- "unknown value stays selectable" fallback, until re-picked from the
-- curated Settings list). No seed rows - populated entirely from Settings.

ALTER TABLE master_data DROP CONSTRAINT IF EXISTS master_data_category_check;
ALTER TABLE master_data ADD CONSTRAINT master_data_category_check
  CHECK (category IN (
    'salesperson', 'product_source', 'customer_stage',
    'product_category', 'product_color', 'market'
  ));
