# Inventory Write-Path Audit — `available` / `reserved` / `sold`

Full-repository search for every place that can write to `products.available`, `products.reserved`, or `products.sold`. Covers UI, service, repository, utility, import/seed tooling, batch flow, and the Orders write layer. No code changed, no SQL written — findings only.

**Search method:** repo-wide grep for `available`, `reserved`, `sold` across all `.ts`/`.tsx` files, followed by manual inspection of every match; a separate grep for every `.update(`/`.insert(`/`.upsert(` call anywhere in the codebase targeting the `products` table; confirmed no direct `supabase.from(...)` calls exist outside `lib/`; confirmed no `scripts/`, CSV, or import tooling exists in the repo (`package.json` has only `dev`/`build`/`start`/`lint`).

---

## Write paths found

### 1. `ProductForm`'s Tồn kho inputs (UI)
- **File:** `components/product/ProductForm.tsx`
- **Function:** the "Có sẵn" / "Đã giữ" / "Đã bán" `Input` elements in the "Tồn kho" section
- **Fields written:** `available`, `reserved`, `sold`
- **Still active?** **No.** As of Increment 1 ("Lock Product Status"), all three inputs are `disabled` with no `onChange` handler — display-only.
- **Recommendation:** None — already resolved by the prior increment.

### 2. `WRITABLE_FIELDS` / `pickWritableFields()` (Service)
- **File:** `lib/product.service.ts`
- **Function:** `pickWritableFields()`, used by both `addProduct()` and `updateProduct()`
- **Fields written:** previously `available`, `reserved`, `sold` (plus other product fields)
- **Still active?** **No.** As of Increment 1, all three were removed from the `WRITABLE_FIELDS` array, with a comment explaining why. Even if a future caller passed these fields on a `Product` object into `addProduct`/`updateProduct`, they are now filtered out before the Supabase call — this is the data-layer backstop behind finding #1.
- **Recommendation:** None — already resolved. Confirmed this is the *only* place `addProduct`/`updateProduct` build their write payload from, so closing it here closes it for every caller (list-page Add/Edit, Detail-page Edit, and the Batch "Return to Supplier" action — see #4).

### 3. `markProductSold()` (Service)
- **File:** `lib/purchase.service.ts`, line 66
- **Function:** `markProductSold(productId)` — called by `addPurchase()` and `updatePurchase()` (Customer Purchase History flow)
- **Fields written:** `status` only (`.update({ status: "Sold" })`) — a raw Supabase call, does not go through `pickWritableFields`
- **Still active?** **Yes** — this function runs every time a Purchase is logged against a product from Customer Detail. It does **not** write `available`/`reserved`/`sold`.
- **Recommendation:** No change needed for these three fields specifically (they were never touched here). Flagged for context: this is the same gap already raised in `INVENTORY_FOUNDATION_REVIEW.md` §5/§6/§10 — Purchase History updates `status` but never the counters, which is *why* the two signals already disagree for every historical sale. Not a new finding, restated here because this audit is the authoritative write-path list.

### 4. `revertProduct()` (Service)
- **File:** `lib/purchase.service.ts`, line 71
- **Function:** `revertProduct(productId)` — called when a Purchase is deleted or its linked product changes
- **Fields written:** `status` only (`.update({ status: "Active" })`)
- **Still active?** **Yes**, same as #3 — writes `status` only, never the three counters.
- **Recommendation:** Same as #3.

### 5. "Trả về NCC" / Return to Supplier (UI → Service)
- **File:** `app/batches/[id]/page.tsx`, line 100 (`handleReturnToSupplier`), calling `updateProduct()` in `lib/product.service.ts`
- **Function:** `handleReturnToSupplier(product)`
- **Fields written:** `status` only — the call site passes `{ status: "Returned" }` exclusively. Even if it passed more, #2 above now blocks `available`/`reserved`/`sold` from reaching the database regardless.
- **Still active?** **Yes** (the action itself is live), but it was never a write path for these three fields, and is now doubly blocked by #2.
- **Recommendation:** None needed.

### 6. Product Batches — `addBatch` / `updateBatch` (Service)
- **File:** `lib/productBatch.service.ts`, lines 63 (`.insert`) and 80 (`.update`)
- **Function:** `addBatch()`, `updateBatch()`
- **Fields written:** these write to the **`product_batches`** table (batch records: `batch_code`, `supplier`, dates, `other_cost`, `status`, `notes`) — not `products` at all.
- **Still active?** Yes, but **not a write path for `products.available/reserved/sold`** — included here only because "batch flow" was explicitly in scope for this audit; confirmed no product-inventory field is touched anywhere in this file.
- **Recommendation:** None needed.

### 7. Orders write layer — `OrderWriteRepository` / `OrderWriteService` (Repository + Service, unimplemented)
- **Files:** `lib/orders/order.repository.ts` (interface `OrderWriteRepository`/`OrderRepository`), `lib/orders/order.service.ts` (`createOrderService`, `OrderWriteService`), `lib/orders/order.rules.ts`, `lib/orders/order.validation.ts`
- **Function:** the full write orchestration (`createOrder`, `addProductToOrder`, `updateOrderItem`, `removeProductFromOrder`, `addPayment`, `markOrderLost`, `completeOrder`, `reassignSalesOwner`)
- **Fields written:** **None on `products`.** The `OrderWriteRepository` interface contract has no method that touches `products` at all — no `reserveProduct`, no inventory-transition method of any kind, despite `ORDERS_DATABASE.md` §7's approved design explicitly requiring `available → reserved → sold` transitions to be driven by Orders.
- **Still active?** **No — entirely unreachable.** `order.repository.ts`'s own comment confirms: *"Not implemented: the Development DB reset... has not landed yet."* `OrderRepository` is an interface only; no concrete (e.g. Supabase-backed) implementation exists anywhere in the repo. Repo-wide search for `createOrderService(` and `OrderRepository` found zero call sites outside `lib/orders/` itself — nothing in `app/` invokes this write layer. Confirmed no direct `supabase.from(...)` calls exist in `app/` or `components/` either, so there is no alternate path bypassing this dead code.
- **Recommendation:** Not an active risk today, but flagged as a **design gap for whenever this layer is implemented**: the `OrderWriteRepository` interface itself will need new methods for the `available/reserved/sold` transitions before it can fulfill the locked design — this doesn't exist yet even as a stub/signature, only as prose in `ORDERS_DATABASE.md`. Worth deciding before Increment 2 touches anything Orders-related.

---

## Confirmed non-matches (incidental grep hits, not write paths)

Repo-wide search for `available`/`reserved`/`sold` also matched these files, inspected and confirmed to be unrelated (comments or local variables with no connection to `products`):

| File | What matched |
|---|---|
| `lib/orders/order.rules.ts` | Comment: *"Complete is available from Draft or Reserved"* (Order status, not Product) |
| `lib/customer.service.ts` | Comment: *"is preserved as a single read-only legacy entry"* |
| `lib/utils.ts` | Comment: *"crypto.randomUUID() isn't available in every runtime"* |
| `components/ui/CreatableMultiSelect.tsx` | Local variable `available` (filtered dropdown options, unrelated to inventory) |
| `lib/hooks/useTagOptions.ts` | Comment: *"available next time without a refetch"* |
| `types/product.ts` | Type declarations only (`available?: number`, etc.) — not a write path by itself |
| `components/product/ProductTable.tsx`, `components/product/ProductInventory.tsx`, `lib/batchReport.service.ts` | Read-only display/aggregation of these fields — confirmed no `.update`/`.insert` anywhere in these files |

---

## Summary

| # | Write path | Fields | Active? | Action needed |
|---|---|---|---|---|
| 1 | `ProductForm` Tồn kho inputs | available/reserved/sold | No (locked in Increment 1) | None |
| 2 | `pickWritableFields` / `WRITABLE_FIELDS` | available/reserved/sold | No (removed in Increment 1) | None |
| 3 | `markProductSold()` | status only | Yes | None for these fields; known reconciliation gap (already tracked) |
| 4 | `revertProduct()` | status only | Yes | None for these fields; same as #3 |
| 5 | Return to Supplier | status only | Yes | None |
| 6 | Batch add/update | product_batches table, not products | Yes | None |
| 7 | Orders write layer | none (no method exists yet) | No — unreachable, no concrete implementation | Design gap to resolve before this layer is ever implemented |

**Net result:** after Increment 1, there is currently **no live code path anywhere in the repository** that can write to `products.available`, `products.reserved`, or `products.sold`. The values displayed today are exactly whatever is already in the database (per the "Current source of truth: Temporary — Current database values" framing from Increment 1). The only future writer contemplated by the approved design (Orders) doesn't yet have the necessary interface methods even drafted.

No code changed. No SQL written. No implementation performed. Stopping — waiting for Product Owner review before Increment 2.
