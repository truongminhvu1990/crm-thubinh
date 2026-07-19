-- Customer Address V2.
-- Adds a Country level above the existing Market/Local Area
-- (customers.province/district). No existing column is renamed or removed;
-- province stays "Market" and district stays "Local Area".
-- Country is a new Settings-managed master_data category, no seed rows -
-- populated entirely from Settings, same pattern as Market.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS country text;

-- Existing customers: default to Việt Nam. province/district are untouched.
UPDATE customers SET country = 'Việt Nam' WHERE country IS NULL;

ALTER TABLE master_data DROP CONSTRAINT IF EXISTS master_data_category_check;
ALTER TABLE master_data ADD CONSTRAINT master_data_category_check
  CHECK (category IN (
    'salesperson', 'product_source', 'customer_stage',
    'product_category', 'product_color', 'market', 'country'
  ));
