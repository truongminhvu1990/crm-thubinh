# Production Readiness Report — Daily Data Entry Screens

Audit of the create/edit/delete screens for the five modules approved for Production data entry. Scope: `app/customers`, `app/products`, `app/batches`, `app/settings`, and every form/modal/table component they render. No code was modified, no SQL was written, nothing was redesigned — this is a review only.

**Cross-cutting caveat (applies to every module below):** this review evaluates the UI/validation layer only. It does not re-litigate the schema/environment findings from the prior "Baseline Database Recovery" and "Production Readiness" (Section 1–4) reviews in this same session — namely, that the only connected database has no baseline `customers`/`products` tables and no RLS policy on `customers`. Those are database-layer blockers, independent of the UI quality assessed here, and remain open regardless of what this report finds.

---

## 1. Customers (`app/customers`, `CustomerForm`, `CustomerModal`, `CustomerTable`, `CustomerPurchaseHistory`)

### Ready to use
- Full CRUD: list, search (name/code/phone), filter by VIP/revenue tier/market/country, add, edit, delete.
- Delete has a confirmation dialog (`AlertDialog`) with a clear "cannot be undone" warning.
- Purchase History sub-flow (add/edit/delete a purchase) correctly reverts a product's status back to `Active` on delete, and re-snapshots `source`/`salesperson` when the linked product changes.
- Notes timeline, Follow-up scheduling, and Jade Preferences sections are present and functional.

### Missing validation
- Only `full_name` and `phone` are checked, and only via a blocking `alert()` in `app/customers/page.tsx` — no format check on `phone` (any string is accepted).
- `CustomerForm` accepts an `errors` prop and has fully-built inline error display (`Input`'s `error` styling), but `CustomerModal` never passes `errors` through to it — the inline validation UI is unreachable dead code; users only ever see the generic `alert()`.
- No duplicate check on `phone` or `customer_code` before insert — two customers can be created with identical phone numbers or codes.
- `customer_code` is not required, despite being the customer's business identifier used throughout search/filtering.

### UI issues
- Native browser `alert()` is used for all error messaging instead of the inline/error-styled components already present in the codebase.

### Data consistency issues
- No dedup logic anywhere (client or server) for `phone`/`customer_code` — silent duplicate creation is possible.

### Recommended fixes
- Pass `errors` from `app/customers/page.tsx` into `CustomerModal` → `CustomerForm` so the existing inline-error UI actually activates.
- Add a duplicate-phone/duplicate-code check before save (mirrors the pattern already implemented in Settings' `isDuplicateValue`).
- Replace `alert()` calls with the same inline/error-state pattern used elsewhere.

---

## 2. Products (`app/products`, `ProductForm`, `ProductModal`, `ProductTable`, `ProductInventory`)

### Ready to use
- Full CRUD: list, search (name/code/SKU), filter by category/status/source/salesperson, add, edit, delete.
- Delete has a confirmation dialog.
- Batch linkage (`Lô hàng` dropdown) and image thumbnail display work in the list.

### Missing validation
- Same pattern as Customers: only `product_code` and `product_name` are checked via a blocking `alert()`; `ProductForm`'s `errors` prop is never wired from `ProductModal`, so its inline-error UI is unreachable.
- No numeric bounds anywhere: `discount` (%) accepts any number including negative or over 100; `cost_price`, `sale_price`, `weight`, `size`, `available`, `reserved`, `sold` all accept negative values with no client-side guard.
- No duplicate check on `product_code`/`sku`.

### UI issues
- Same `alert()`-based error pattern as Customers.
- Product images can only be added *after* the product is first saved — the form itself shows a note ("Ảnh sản phẩm được quản lý ở trang chi tiết sau khi lưu sản phẩm này") deferring all image entry to a second trip to the detail page. This is a two-step data-entry flow for any new product with photos, by design, not a bug — flagged as a throughput friction point.

### Data consistency issues
- `available`, `reserved`, and `sold` are freely hand-editable numeric fields in the form, but the actual sell workflow (`purchase.service.ts` → `markProductSold`) only ever updates `products.status`, never these three counters. The two mechanisms (status-based tracking vs. manual counters) are not connected anywhere in the reviewed code — an operator's manually-entered "Đã bán" count has no relationship to what `customer_purchases`/`status` actually record, and will drift from reality as soon as a real sale happens through the Purchase History flow instead of a manual edit.

### Recommended fixes
- Wire `errors` into `ProductModal` → `ProductForm`, same as Customers.
- Add sane bounds (non-negative) to numeric fields.
- Clarify (Product Owner decision, not proposed here) whether `available`/`reserved`/`sold` should be derived/read-only rather than freely editable, given they already conflict with the status-based tracking used elsewhere (Batch Reports, `ProductInventory` display).

---

## 3. Product Batches (`app/batches`, `BatchForm`, `BatchModal`, `BatchTable`)

### Ready to use
- Full CRUD with the most complete data-entry UX of all the reviewed modules: inline field-level errors, auto-suggested next batch code (`HX{n}`), server-side duplicate detection mapped to a friendly Vietnamese message ("Mã lô hàng đã tồn tại"), delete confirmation that correctly explains the cascade behavior (linked products are unlinked, not deleted).
- Batch statistics (`getBatchStats`) are computed live from `products.status` and `customer_purchases` rather than stored/duplicated — no drift risk of the kind found in Products.

### Missing validation
- None found beyond what's implemented — `batch_code` is required and duplicate-checked; all other fields are appropriately optional.

### UI issues
- `handleDeleteBatch` (`app/batches/page.tsx`) calls `deleteBatch()` but never checks its returned `error` — a failed delete fails silently with no user-facing feedback (the service function itself only `console.error`s).

### Data consistency issues
- None found.

### Recommended fixes
- Surface the delete error to the user (e.g. the same `alert()`/inline-error pattern used for save failures elsewhere), for parity with the rest of the delete flow.

---

## 4. Product Images (`ProductImageManager`, reached from Product Detail)

### Ready to use
- Add-by-URL with automatic Google Drive share-link conversion, add-by-file-upload (to Supabase Storage), drag-to-reorder (which also redefines the thumbnail — lowest `sort_order` wins), and delete (with best-effort storage cleanup for files hosted in the app's own bucket).

### Missing validation
- No URL-format validation before `addProductImageUrls` inserts a row — any string is accepted as an image URL; a typo or non-image link will silently produce a broken `<img>` elsewhere in the app with no warning at entry time.
- No file-type or size validation before `uploadProductImageFiles` — any file can be selected and uploaded, with no client-side image-mimetype or max-size guard in the reviewed code.

### UI issues
- Same "must save the product first" friction noted under Products — this is this module's only entry point, so it's restated here for completeness.

### Data consistency issues
- None found — `sort_order` reassignment and thumbnail derivation are internally consistent.

### Recommended fixes
- Add a basic client-side URL-format check and file-type/size check before upload/insert.

---

## 5. Settings — Master Data (`app/settings/page.tsx`)

### Ready to use
- The most complete data-entry flow in the app: required-value check, rejection of commas/newlines (which would break the comma-serialized multi-value fields elsewhere), case-insensitive client-side duplicate check, server-side duplicate check via Postgres error code as a backstop, a delete flow that checks real usage first (via `isMasterDataValueInUse`) and blocks deletion with a clear explanation + "Disable instead" suggestion, reorder (up/down), and active/inactive toggling.

### Missing validation
- None found beyond what's implemented.

### UI issues
- `handleToggleActive`, `handleDelete`, and `handleMove` don't surface errors to the user if their underlying service calls fail — same silent-failure pattern noted in Product Batches' delete handler; the service layer only logs to console.

### Data consistency issues
- Settings manages the 7 `master_data` categories (`salesperson`, `customer_stage`, `product_category`, `product_source`, `product_color`, `country`, `market`) but not the 4 `tag_options` categories (`favorite_color`, `jade_type`, `purchase_purpose`, `product_jade_grade`), which are created inline from the Customer/Product forms with no admin screen at all. This is by design per the existing migration history, not a defect — but it means those 4 categories have no way to be renamed, deactivated, or cleaned up of duplicate/typo'd values once entered, unlike everything Settings does manage.

### Recommended fixes
- Surface errors from toggle/delete/move actions to the user, for consistency with the rest of the module's otherwise-thorough error handling.
- (For Product Owner decision only, not proposed here) whether the 4 `tag_options` categories need any management capability now that daily data entry is starting, given typos/duplicates there have no cleanup path.

---

## Summary ranking (data-entry UX quality, best to weakest)

1. **Settings** — thorough validation, usage-aware delete, no silent failures beyond minor action-error surfacing.
2. **Product Batches** — thorough validation, server-side duplicate handling; one silent-failure gap on delete.
3. **Product Images** — functionally solid; lacks input validation (URL format, file type/size).
4. **Customers** — functional but validation is minimal and the built inline-error UI is disconnected; no duplicate protection.
5. **Products** — same validation gaps as Customers, plus a real data-consistency risk (manually-editable inventory counters disconnected from the actual sell workflow).

No code modified. No SQL written. No redesign proposed. Waiting for Product Owner review.
