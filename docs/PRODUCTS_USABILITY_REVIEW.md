# Products Module — Usability Review

Review-only audit of the Products module (`app/products/`, `app/batches/`, `components/product/*`, `components/batch/*`) against the 10 requested dimensions. No code was changed, no SQL was written, no business rule was altered.

---

## 1. Product creation workflow

**Problem:** `ProductForm` accepts an `errors` prop with full inline-error support (`Input`'s `error` styling on `product_code`/`product_name`), but `ProductModal` never passes `errors` through to it. `app/products/page.tsx` validates only via a blocking `alert("Vui lòng nhập mã sản phẩm và tên sản phẩm")` at save time.
**Impact:** Same class of problem already fixed for Customers in the prior sprint — an operator who misses a required field gets a generic browser alert instead of a highlighted field, and has to re-scan a long form to find what's wrong.
**Suggested improvement:** Apply the same inline-validation pattern already implemented for Customers (Increment 1) to Products: wire `errors` from the page into `ProductModal` → `ProductForm`, focus the first invalid field, replace the save-failure `alert()` with a form-level error.
**Priority:** High

**Problem:** There is no duplicate check on `product_code` or `sku` anywhere — client-side or server-side.
**Impact:** Two products can be saved with an identical code or SKU with no warning, fragmenting inventory/search by code.
**Suggested improvement:** Apply the same pattern already implemented for Customers (Increment 2, phone-based duplicate detection) to `product_code`/`sku`.
**Priority:** High

---

## 2. Batch workflow

**Problem:** The "Trả về NCC" (Return to Supplier) action in `BatchProductsTable` only changes `products.status` to `"Returned"` — it never clears `batch_id`. There is no dedicated "remove from batch" / "unassign" action anywhere; the only way to move a product out of a batch is to open the Product edit form and manually clear the "Lô hàng" dropdown back to blank.
**Impact:** A returned product stays listed under its original batch forever (which may be intentional, as a historical record) but there's no way to correct a batch mis-assignment except a full product edit — not discoverable from the Batch Detail screen itself.
**Suggested improvement:** Consider (Product Owner decision) whether Batch Detail should offer a direct "unassign from batch" action, separate from "Return to Supplier."
**Priority:** Low

**Problem:** `useBatchOptions()` (used by `ProductForm`'s "Lô hàng" dropdown) fetches all batches fresh on every form mount, with no caching — the same pattern flagged for master-data/tag-option hooks in the Customers review.
**Impact:** Adds a redundant round trip every time the Add/Edit Product modal opens.
**Suggested improvement:** Same fix as recommended for Customers' master-data hooks — share/cache across mounts.
**Priority:** Medium

**Problem:** Batch statistics (`getBatchStats`) and revenue are correctly derived live from `products.status`/`customer_purchases` rather than stored — this section is a strength, not a gap, and mirrors the same sound pattern already confirmed in the Customers-side Batches review.
**Impact:** N/A.
**Suggested improvement:** None.
**Priority:** N/A

---

## 3. Image upload workflow

**Problem:** Reordering images (which also controls which image is the product's cover/thumbnail — "ảnh đầu tiên luôn là ảnh đại diện") is implemented entirely with the native HTML5 Drag-and-Drop API (`draggable`, `onDragStart`/`onDragOver`/`onDrop`). This API has no reliable touch-input support in mobile browsers without a dedicated polyfill, and none is used here.
**Impact:** On a phone or tablet, an operator very likely cannot reorder product images or change the cover photo at all after the first upload — there is no alternative control (no up/down buttons, no "set as cover" action).
**Suggested improvement:** Add a touch-compatible fallback for reordering/setting the cover image (e.g. explicit "set as cover" and move-up/move-down controls), alongside the existing drag-and-drop for desktop.
**Priority:** High

**Problem:** Each image tile's delete button and the drag-handle icon are both wrapped in `opacity-0 group-hover:opacity-100` — invisible without a working `:hover` state, the same touch-accessibility issue already fixed for `CustomerTable` in the Customers sprint but not addressed here.
**Impact:** Deleting a single image may be difficult to discover on touch devices, compounding the reordering problem above.
**Suggested improvement:** Same fix pattern as `CustomerTable` (Increment 3) — make controls always visible below the `lg` breakpoint.
**Priority:** High

**Problem:** The URL-add flow (`addProductImageUrls`) has a required-value check and surfaces insert failures, but never validates that an entered string is actually a well-formed URL before submitting.
**Impact:** A typo'd URL saves successfully and only shows as a broken image icon later, with no feedback at entry time pointing to which line was wrong.
**Suggested improvement:** Add a basic URL-format check before submission.
**Priority:** Medium

**Problem:** The file-upload path does filter by `image/*` (both the file input's `accept` attribute and a client-side `f.type.startsWith("image/")` check) — correct and already working — but has no file-size limit anywhere.
**Impact:** A very large image file can be selected and uploaded with no warning, only surfacing as a slow or failed upload after the fact (`alert("Một số ảnh tải lên thất bại...")`).
**Suggested improvement:** Add a reasonable client-side max-size check before upload.
**Priority:** Low

**Problem:** Images can only be managed after the product is first saved (`ProductForm` shows "Ảnh sản phẩm được quản lý ở trang chi tiết sau khi lưu sản phẩm này" for new products) — this is a two-step workflow (save, then navigate to Detail to add photos), by design per the current architecture, not a bug.
**Impact:** Adds friction for the common case of entering a new product with photos in one sitting.
**Suggested improvement:** Noted for awareness; changing this would be a workflow redesign, out of scope for a usability increment.
**Priority:** Low

---

## 4. Required fields

**Problem:** Only `product_code` and `product_name` are enforced (via the `alert()` in §1). Numeric fields (`cost_price`, `sale_price`, `discount`, `weight`, `size`, `available`, `reserved`, `sold`) accept any value including negative numbers, and `discount` isn't capped at 100.
**Impact:** A negative price or a >100% discount can be saved with no warning, and would display nonsensically in the list/detail views (e.g. `ProductTable` shows `-{product.discount}%` regardless of range).
**Suggested improvement:** Add non-negative bounds (and a 0–100 cap on `discount`) to the numeric fields.
**Priority:** Medium

---

## 5. Optional fields

**Problem:** The form has 4 sections (Cơ bản, Kinh doanh, Thông tin sản phẩm, Video, Tồn kho) with ~20 fields shown at once regardless of category — e.g. a "Ni tay/Ni nhẫn" size field is always present, relabeled dynamically, even for jade types where it may not apply.
**Impact:** Similar to Customers — a long form for what's sometimes a quick "just log the item" entry.
**Suggested improvement:** Consider progressive disclosure for the less-frequently-used sections (Product Owner call, not proposed here as a redesign).
**Priority:** Low

---

## 6. Search experience

**Problem:** `getProducts()` fetches the full product table (with `batch`/`images` joins) on every list load and every "Làm mới," then search/filter is entirely client-side — no server-side search, no pagination.
**Impact:** Same forward-looking scalability note as Customers — fine today, will grow linearly with catalog size.
**Suggested improvement:** Monitor; not urgent now.
**Priority:** Low (monitor)

**Problem:** Search matches `product_name`, `product_code`, and `sku` only — not `certificate_no`, `supplier`, or `notes`.
**Impact:** An operator who only remembers a certificate number can't find the product by it.
**Suggested improvement:** Consider extending search fields (Product Owner call on scope).
**Priority:** Low

---

## 7. Filter experience

**Problem:** Four independent filters (category, status, source, salesperson), each threaded through a 6-argument `filterProducts(...)` call — functionally correct, but no single "clear all filters" action, matching the same finding already made for Customers.
**Impact:** Returning to the unfiltered list after a multi-filter search takes 4 clicks instead of 1.
**Suggested improvement:** Add a "Clear filters" control (same fix as recommended for Customers).
**Priority:** Low

**Problem:** No filter for "no batch assigned" or "no image" — both are useful operational states (an unphotographed product, or one not yet linked to a purchase batch) that currently require scanning the full list to spot.
**Impact:** Harder to find incomplete product records to finish entering.
**Suggested improvement:** Consider adding these as filter options (Product Owner call).
**Priority:** Low

---

## 8. Product Detail page

**Problem:** The detail page is comprehensive and well-organized — profile header, live Inventory stat cards, conditional Sale Info (only for Sold items, correctly linking back to the customer/purchase), Image Manager, Business Info, and Media (video) — and correctly hides empty optional sections. This is a strength.
**Impact:** N/A.
**Suggested improvement:** None.
**Priority:** N/A

**Problem:** `ProductInventory`'s "Có sẵn / Đã giữ / Đã bán" stat cards read directly from `product.available`/`reserved`/`sold` — the same freely hand-editable counters flagged in the Production Readiness review as disconnected from the actual sell workflow (`purchase.service.ts` only ever updates `status`, never these three fields).
**Impact:** These stat cards can display numbers that have never been touched by an actual sale — carried forward from the earlier review as still unresolved, now confirmed to directly affect what's shown on Product Detail.
**Suggested improvement:** Already flagged in `PRODUCTION_READINESS_REPORT.md` — Product Owner decision needed on whether these should be derived/read-only.
**Priority:** High (carried forward, unresolved)

---

## 9. Mobile usability

**Problem:** `ProductTable`'s Edit/Delete action buttons use the same `opacity-0 group-hover:opacity-100` pattern already fixed for `CustomerTable` — not yet applied here.
**Impact:** Same touch-accessibility problem as Customers had before the fix: actions may be undiscoverable on phone/tablet.
**Suggested improvement:** Apply the identical `lg:` breakpoint fix already used for `CustomerTable`.
**Priority:** High

**Problem:** As detailed in §3, the Image Manager's reorder-by-drag has no touch-compatible path, and its per-image delete/drag-handle controls are hover-gated.
**Impact:** The most consequential mobile gap in this module — image management may be effectively unusable on a touchscreen.
**Suggested improvement:** See §3.
**Priority:** High

**Problem:** `ProductTable` renders as `<table className="w-full min-w-[960px]">` inside a horizontally-scrolling container, and `ProductModal` wraps `ProductForm` (4 sections, ~20 fields) in the same fixed `max-h-96` inner-scroll pattern already flagged for Customers.
**Impact:** Same cramped double-scroll experience and sideways-scrolling table on small screens as Customers.
**Suggested improvement:** Same as recommended for Customers — card layout consideration for the table, full-height scroll for the modal on narrow viewports.
**Priority:** Medium

---

## 10. Daily operation efficiency

**Problem:** Opening the Add/Edit Product modal triggers 5 separate, uncached fetches — `useMasterDataOptions` (category, source, salesperson, color) and `useBatchOptions` (all batches) each independently fetch on every mount. The list page's own filters add 3 more (category, source, salesperson) on page load.
**Impact:** Same avoidable-latency issue already found in Customers, here affecting the second-most-frequent daily action in the app (adding/editing a product).
**Suggested improvement:** Same fix as recommended for Customers — a shared cache across modal opens.
**Priority:** Medium

**Problem:** `getProducts()` requests `batch:product_batches(batch_code), images:product_images(id, image_url, sort_order)` joins on every list load, and falls back to a join-less query only on error (a defensive pattern for not-yet-migrated tables) — meaning every list view always pays for two joins even when a user only needs to skim names/prices.
**Impact:** Minor added query cost on every list load/refresh; not a correctness issue.
**Suggested improvement:** Not urgent; noted for awareness only.
**Priority:** Low

---

## Summary — Priority tally

| Priority | Findings |
|---|---|
| **High** | Missing inline validation, no duplicate product_code/sku check, image reorder has no touch-compatible path, image delete/drag controls hover-gated, ProductTable action buttons hover-gated (mobile), available/reserved/sold counters disconnected from real sales (carried forward, unresolved) |
| **Medium** | Numeric field bounds (negative values, discount cap), no URL-format check on image URLs, uncached batch/master-data fetches per modal open, mobile table/modal layout |
| **Low** | Batch unassign action, image file-size limit, two-step image entry (by design), long single-scroll form, search field scope, filter clear-all, no-batch/no-image filters, join cost on list load |

No code changed. No SQL written. No business rule altered. Stopping — waiting for Product Owner review.
