-- Lot Product-Level Status, D1 (Product Owner Authorization, 2026-08-19).
-- Decision 2 (LOCKED): Return to Supplier must record the actual moment the
-- return happened, distinct from `product_batches.return_due_date` (that
-- column is the batch's own return DEADLINE, not any single product's
-- actual return date - different entity, different meaning, not a
-- duplicate field).
--
-- Nullable, no default - "không tự điền ngày nếu chưa có hành động trả
-- thực tế" (LOCKED): every existing row and every product that has never
-- been returned stays NULL forever. Only `returnProductToSupplier()`
-- (lib/product.service.ts) is ever allowed to write it, alongside the
-- status transition to 'Returned' in the same UPDATE - see that function's
-- own doc comment for the enforcement (not a DB CHECK, since products.status
-- itself carries no CHECK constraint to hang a cross-column rule off of).

ALTER TABLE products ADD COLUMN IF NOT EXISTS returned_at timestamptz;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'products' AND column_name = 'returned_at';
