# Inventory Foundation Review

Review-only audit of the Inventory-related surface of the CRM ahead of Orders integration: Product Batches, (the absence of a dedicated) Inventory module, Product Images, Product Status, stock calculation, and the batch receiving/return workflow. Cross-referenced against the locked `docs/ORDERS_DATABASE.md` / `docs/ORDERS_SPEC.md`, since those documents already specify how Inventory is meant to work once Orders ships. No code changed, no SQL written, no business redesigned.

---

## 1. Daily receiving workflow

**Problem:** Receiving a batch has no bulk-entry path — a batch record is created first (auto-suggested code via `getNextBatchCode()`), but each physical item must then be added as a separate Product via the full Product form (SKU, name, price, etc.) and manually linked to the batch through its "Lô hàng" dropdown. There is no "add N items to this batch" or CSV/bulk-import flow.
**Impact:** Receiving a large shipment means repeating the full multi-section Product form once per item — the highest-friction point in the whole receiving process.
**Suggested improvement:** Consider (Product Owner decision) a lighter "quick add to batch" entry path for receiving day; not proposed here as a redesign.
**Priority:** Medium

**Problem:** Nothing on the Batch Detail or Batch List screens indicates *how many items were expected* for a batch versus how many have actually been entered — `stats.total` only counts products that exist and are already linked.
**Impact:** No way to tell if a receiving session is incomplete (e.g. supplier shipped 20 pieces, only 14 entered so far) without cross-checking a paper/external record.
**Suggested improvement:** Product Owner call on whether an expected-count field is needed; noted for awareness only.
**Priority:** Low

---

## 2. Daily inventory workflow

**Problem:** There is no dedicated Inventory module. `Sidebar.tsx` lists "Tồn kho" (Inventory) with `enabled: false` ("Sắp có"), and `PROJECT_MANIFEST.md` marks the Inventory module status as `PLANNED`. Today, "inventory" is entirely implicit — split across the Product List's status/available/reserved/sold columns, the Product Detail stat cards, and Batch Detail's stat cards.
**Impact:** There is no single screen to answer "what do we currently have in stock" — an operator has to read it off the Product List, filtered by status, item by item.
**Suggested improvement:** Confirms the Sprint Roadmap's own sequencing (Sprint 2 = Inventory, after Orders) is correct — flagging here only so it's explicit that today's "Inventory" is not a real module yet, just fields on Product.
**Priority:** N/A (expected, not a defect)

**Problem:** No low-stock, unsold-aging, or "hasn't moved in N days" signal exists anywhere.
**Impact:** No proactive prompt to review slow-moving stock; relies entirely on staff manually noticing.
**Suggested improvement:** Natural fit for the future Inventory module; not proposed as a change here.
**Priority:** Low

---

## 3. Product lifecycle

**Problem:** `products.status` is a 5-value enum (`Active, Paused, Sold, Discontinued, Returned`, per `20260711_product_status_fix.sql`'s CHECK constraint). Separately, the **locked** `docs/ORDERS_DATABASE.md` §7 documents an entirely different "Product Status Flow" — `Available → Reserved → Sold`, with `Reserved → Lost → Available` — but this refers to the **`available`/`reserved`/`sold` numeric counters**, not the `status` column (confirmed explicitly: *"Inventory status (already exists on Product as available/reserved/sold... no new inventory status is introduced)"*). Two lifecycle representations exist on the same table today, tracked by different fields, and only one of them (`status`) is currently wired to any real write path.
**Impact:** This is a legitimate, already-designed-for split (not a bug), but it means "Product lifecycle" cannot be understood by looking at `status` alone — `Active` says nothing about whether the piece is actually free, reserved by an open order, or effectively spoken-for. Anyone building Orders' write path needs to know this distinction going in, or risks conflating the two.
**Suggested improvement:** No change proposed here — flagging for awareness ahead of Orders' write-path implementation, since the locked design already accounts for this split correctly.
**Priority:** High (informational — critical context for whoever implements Orders' inventory-writing logic)

---

## 4. Batch usability

**Problem:** (Carried forward from the Products review) "Trả về NCC" (Return to Supplier) only changes `products.status` to `Returned` — it never clears `batch_id`, and there is no dedicated "unassign from batch" action anywhere.
**Impact:** A batch's product list only ever grows, never shrinks except via full batch deletion; correcting a batch mis-assignment requires a full Product edit.
**Suggested improvement:** Already flagged in `PRODUCTS_USABILITY_REVIEW.md` §2 — repeated here for Inventory-Foundation completeness, no new proposal.
**Priority:** Low

**Problem:** Batch statistics (`getBatchStats`) and revenue continue to be correctly derived live from `products.status` / `customer_purchases` rather than stored — genuine strength, confirmed again in this pass.
**Impact:** N/A.
**Suggested improvement:** None.
**Priority:** N/A

---

## 5. Stock consistency

**Problem:** `products.available`, `products.reserved`, and `products.sold` are three independent, freely hand-editable numeric fields in `ProductForm` today, with no mutual-exclusivity or sum constraint enforced anywhere (client or database). The Orders design explicitly frames each Product as a **one-of-a-kind physical piece** (*"the business will oversell unique pieces"*, *"a piece can only physically be in one hand at once"*) — implying these three counters are meant to behave like a single-item state (exactly one of the three should ever be "occupied" per product), not independent quantities.
**Impact:** Right now a single product row could have `available: 3, reserved: 2, sold: 1` simultaneously entered by hand, which is meaningless for a one-of-a-kind item and has no validation catching it.
**Suggested improvement:** Already partly covered by the existing Production Readiness finding (bounds on numeric fields); additionally flag to the Product Owner that these three fields may need to become mutually exclusive once their write path is redefined by Orders.
**Priority:** High

**Problem:** The legacy Purchase History flow (`customer_purchases`, still fully live in the Customer Detail UI) never touches `available`/`reserved`/`sold` — `purchase.service.ts`'s `markProductSold()` only sets `products.status = 'Sold'`. Every real sale recorded through Purchase History today leaves the three counters exactly as they were (typically their manually-entered or default values), permanently out of sync with what actually happened.
**Impact:** Any future feature that trusts `available`/`reserved`/`sold` as the stock signal will be wrong for every product already sold via the current, still-active Purchase History workflow.
**Suggested improvement:** See §10 — this is a prerequisite reconciliation question for Orders integration, not something to silently patch here.
**Priority:** High

---

## 6. Product status consistency

**Problem:** There are now two independent "is this sold" signals on the same product row: `products.status = 'Sold'` (set today by Purchase History) and `products.sold` (a counter the locked Orders design designates as Orders' own, currently written by nothing). For any product sold today, these two signals already disagree — `status` correctly says `Sold`, but `sold` remains untouched.
**Impact:** Whichever future code path reads `sold` (Orders, a future Inventory module, Reports) will silently undercount actual historical sales unless it's aware `status` is the only currently-trustworthy signal.
**Suggested improvement:** Needs an explicit Product Owner decision on reconciliation before Orders' write path ships — not something to resolve unilaterally here.
**Priority:** High

**Problem:** `ProductInventory` (Product Detail stat cards) and `ProductTable` (List view "Tồn kho" column) both display `available`/`reserved`/`sold` at face value, with no visual indicator that these numbers may not reflect reality (per §5/§6 above).
**Impact:** A staff member glancing at the Product Detail page today has no way to know the "Đã bán: 0" stat card might be wrong for an item that was, in fact, sold via Purchase History.
**Suggested improvement:** Until the underlying data is trustworthy (§10), consider whether these stat cards need a caveat; not proposed as an implementation here.
**Priority:** Medium

---

## 7. Search and filters

**Problem:** `app/batches/page.tsx` has no search input at all — unlike Customers and Products, the Batch List is a plain table with only a "Làm mới" refresh button and "Thêm lô hàng." Finding a specific batch among many requires scrolling/scanning.
**Impact:** As batch count grows, locating a specific batch (e.g. by supplier name) gets slower with no search shortcut.
**Suggested improvement:** Add a search input consistent with the pattern already used on Customers/Products (Product Owner call on priority).
**Priority:** Medium

**Problem:** The Product List has no filter for "no batch assigned" (already noted in the Products review) — relevant here specifically because it's the only way to spot receiving entries that were never linked to their batch.
**Impact:** An incompletely-entered receiving session (product created but batch link forgotten) isn't discoverable without manually cross-checking every product.
**Suggested improvement:** Same as flagged in the Products review — a "no batch" filter option.
**Priority:** Low

---

## 8. Mobile usability

**Problem:** None found — `BatchTable`'s Edit/Delete buttons and `BatchProductsTable`'s "Trả về NCC" button are already always-visible (no `opacity-0 group-hover` gating), and `ProductImageManager`'s new Move Up/Move Down/Set Cover controls (Products Increment 4) are already touch-compatible.
**Impact:** N/A — this dimension is in good shape for the Inventory-adjacent screens specifically.
**Suggested improvement:** None.
**Priority:** N/A

---

## 9. Daily operation efficiency

**Problem:** Opening a Batch Detail page issues 4 separate round trips (`getBatchById`, `getProductsByBatch`, `getBatchStats` — which itself runs 2 more internal queries) with no combining/caching.
**Impact:** Adds latency every time a batch is opened, which happens frequently during a receiving session (checking progress) and during return-to-supplier workflows.
**Suggested improvement:** Consider combining the batch-stats queries; not proposed as an implementation here.
**Priority:** Low

**Problem:** `useBatchOptions()` (Product form's batch dropdown) re-fetches all batches on every modal mount with no caching — same pattern already flagged for master-data/tag-options in the Products review.
**Impact:** Adds a redundant round trip every time Add/Edit Product opens, on top of the other uncached option fetches already noted.
**Suggested improvement:** Same shared-cache fix already recommended for the other option hooks.
**Priority:** Medium

---

## 10. Risks before Orders integration

**Problem:** The locked `ORDERS_DATABASE.md` explicitly states *"Orders is the only module permitted to write `products.available`/`reserved`/`sold` going forward... every other write path to those three columns is superseded"* and *"manual editing of Product inventory counters is superseded by this flow."* Today, and every day production data entry continues, `ProductForm` still lets any operator freely hand-edit all three counters. Every manually-entered value accumulated between now and whenever Orders' write path ships will need to be reconciled or reset — it does not represent real reservations.
**Impact:** This is the single biggest integration risk in this review. The longer manual editing continues, the larger the reconciliation problem grows before Orders can trust these fields as ground truth.
**Suggested improvement:** Needs an explicit Product Owner decision: freeze/reset these fields ahead of Orders' write-path implementation, or plan a reconciliation pass. Not something to implement unilaterally here.
**Priority:** High

**Problem:** Two parallel "record a sale" mechanisms coexist right now with no documented transition plan — the legacy Purchase History (`customer_purchases`, live and actively used in Customer Detail) and Orders (schema locked, reads implemented, writes not yet built). Per §5/§6 above, they already leave the product record in different states (`status` updated, counters untouched).
**Impact:** Without an explicit decision, Orders' write path will need to either also update `products.status` for consistency, or Purchase History will need to be deprecated/migrated — neither is currently specified.
**Suggested improvement:** Flag to Product Owner as an open design question for the Orders implementation phase, not decided here.
**Priority:** High

**Problem:** `ORDERS_DATABASE.md` §17 itself already flags, as a still-open risk in the *approved* design: *"Concurrent reservation of a one-of-a-kind product... the `available → reserved` transition must be atomic/exclusive or the business will oversell unique pieces."* No implementation of this exclusivity exists yet (Orders' write path isn't built), and nothing in the current Product/Batch schema provides it either (no unique-open-order constraint, no row locking pattern established anywhere in this codebase's existing services).
**Impact:** Restating this here because it directly determines whether Inventory correctness can be trusted once Orders ships — an unresolved risk in the source-of-truth document, not a new finding, but one this Inventory-focused review should not let slip past unmentioned.
**Suggested improvement:** No proposal here — this is explicitly called out as needing the Product Owner's/implementer's attention when Orders' write path is designed.
**Priority:** High

**Problem:** The "Product Status Flow" terminology collision noted in §3 (`ORDERS_DATABASE.md`'s "Available/Reserved/Sold" refers to counters, not the literal `products.status` enum, which uses `Active`/etc.) is easy to misread quickly, given both are informally called "status" in different documents.
**Impact:** Low likelihood but high cost if a future implementer wires Orders' transitions to the wrong column.
**Suggested improvement:** Worth a one-line clarifying note in implementation-phase documentation when Orders' write path is scoped; not a code change.
**Priority:** Medium

---

## Summary — Priority tally

| Priority | Findings |
|---|---|
| **High** | Two disconnected product lifecycle signals (`status` vs counters) — critical context for Orders' write path; stock counters lack mutual-exclusivity; legacy Purchase History never updates counters; manual counter editing continues today and will need reconciliation before Orders ships; unresolved concurrent-reservation risk already flagged in the locked Orders design; no documented plan for two coexisting sale-recording paths |
| **Medium** | No bulk receiving entry; stat cards show potentially-untrustworthy numbers with no caveat; no Batch List search; uncached batch-options fetch; terminology collision between "status" the column and "status" the conceptual flow |
| **Low** | No expected-count tracking for receiving; no low-stock/aging signal; no "no batch" product filter; batch detail's 4 uncombined queries |

No code changed. No SQL written. No business redesigned. Stopping — waiting for Product Owner review.
