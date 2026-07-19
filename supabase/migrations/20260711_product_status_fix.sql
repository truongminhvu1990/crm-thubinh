-- Fix products.status inconsistency.
-- The products table predates these migrations and carried its own
-- default ('available') that was never part of the app's status model -
-- the UI, ProductForm, ProductTable, purchase.service.ts, and the Product
-- Batches feature all only ever read/write the 5 values below. This
-- normalizes existing rows to that model and fixes the default so new
-- rows land on a real status instead of the stray legacy one.

UPDATE products
SET status = 'Active'
WHERE status IS NULL OR status NOT IN ('Active', 'Paused', 'Sold', 'Discontinued', 'Returned');

ALTER TABLE products ALTER COLUMN status SET DEFAULT 'Active';
