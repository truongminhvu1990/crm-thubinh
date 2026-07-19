# Inventory Module — Business Design Spec (Phase 1: Read Only)

**Sprint:** 2
**Module:** Inventory — Phase 1 (Read Only)
**Status:** Draft — Revision 2, Product Owner Review applied — awaiting further Product Owner review.
**Phase:** Business design only. No code, no SQL, no migrations, no UI were written for this document.

**Revision 2 changelog (this pass, Product Owner Review):**
1. **Inventory Statistics (§8) locked** to exactly: Total Products, By Status, By Origin, By Category, By Batch, By Sales Owner. Removed the open valuation-basis question and any value/revenue/cost framing — Phase 1 statistics are counts only.
2. **`products.available`/`reserved`/`sold` must never be used in Phase 1. Use `products.status` only.** Removed all references to the three counters from §1, §2, §8, Explicitly Out of Scope, and Open Questions — this resolves the counter-trust question raised in Revision 1 rather than leaving it caveated.
3. **Batch View (§5)** — removed all implication of Revenue/Profit/Cost (including `other_cost`). Batch View is now scoped to product counts and dates only.
4. **Product Detail (§6)** — explicit field list locked: Images, Batch, Source, Sales Owner, Status, Price, Created At. Explicitly no Orders history.

Everything else from Revision 1 not touched by the four items above remains intact (Business Goal's problem framing, Search, Filters, the remaining Open Questions). Document structure and section order are unchanged. Nothing in this revision has been implemented — still business design only.

**Dependency note (Product Owner decision, Sprint 2 kickoff):** Orders is currently **blocked**. This spec and everything in Phase 1 must stand on its own and must not assume Orders exists, is implemented, or will ship on any particular timeline. Phase 2 (Inventory write path — Reserve/Sell/Release/Orders integration/adjustment) is blocked until Orders is completed, and is explicitly out of scope here.

---

## 1. Business Goal

### The problem

There is no dedicated Inventory module today. `PROJECT_MANIFEST.md` lists Inventory as `PLANNED`, and the Sidebar's "Tồn kho" entry is disabled ("Sắp có"). What exists instead is inventory information *scattered* across three places that were never designed as a single system:

- **Product List / Product Detail** — status, `available`/`reserved`/`sold` counters, price, location, certificate, batch link, images.
- **Batch Detail** — per-batch product list and stats (`getBatchStats`), computed live.
- **Batch Report** (`batchReport.service.ts`) — revenue/sold/remaining counts and overdue-return flags, computed live per batch.

There is no single screen that answers "what do we currently have in stock right now" — a staff member has to read it off the Product List, filtered by status, item by item (confirmed in `docs/INVENTORY_FOUNDATION_REVIEW.md` §2).

A second, more serious problem: `products.available` / `reserved` / `sold` — the fields that look like the obvious "inventory" answer — are **not currently trustworthy**. Per `docs/INVENTORY_FOUNDATION_REVIEW.md` (§5, §6, §10) and `docs/INVENTORY_WRITE_PATH_AUDIT.md`:
- These three counters are display-only today — no live code path writes to them (locked in a prior Product increment).
- The only mechanism that actually records real sales today, Purchase History (`customer_purchases` → `markProductSold()`), only ever updates `products.status = 'Sold'`. It never touches the three counters.
- Result: for every product actually sold through the live Purchase History flow, `status` is correct but `available`/`reserved`/`sold` are stale/whatever value was last hand-entered.
- The intended future writer of these counters is Orders — which is blocked.

**Phase 1 solves the visibility problem**: give staff and management a single, dedicated, read-only screen to see current stock — grounded in data that is actually trustworthy today. **Resolved (Product Owner Review, Revision 2): Phase 1 uses `products.status` exclusively as the stock signal. `products.available`/`reserved`/`sold` are not read, displayed, or referenced anywhere in Phase 1** — those three counters remain entirely Phase-2/Orders territory, not a Phase 1 display concern.

### Connection to other modules

| Module | Relationship to Inventory Phase 1 |
|---|---|
| **Product** (LOCKED) | Inventory Phase 1 reads Product data only (status, price, location, certificate, batch link, images — never `available`/`reserved`/`sold`, see §1). No Product field, form, or write path changes. |
| **Batch** (LOCKED) | Inventory Phase 1 reads Batch data and the already-existing `batchReport.service.ts` aggregates only. No Batch field, form, or write path changes. |
| **Orders** (BLOCKED) | No dependency. Phase 1 does not read from, write to, or wait on Orders in any way. |
| **Reports / Dashboard** | Not addressed by this spec. Any future feed from Inventory into Reports/Dashboard is out of scope here. |

---

## 2. Available Inventory Information

This section inventories what data *already exists* in the system that Phase 1 can surface — no new fields are proposed.

**Per product** (from `types/product.ts`): `product_code`, `sku`, `product_name`, `category`, `color`, `size`, `weight`, `jade_grade`, `status`, `cost_price`, `sale_price`, `discount`, `location`, `certificate_no`, `supplier`, `source`, `salesperson`, `batch` (joined via `batch_id`), `images` (joined). **`available`/`reserved`/`sold` are explicitly excluded from Phase 1** (§1, Revision 2) — Phase 1's stock signal is `status` only.

**Per batch** (from `types/productBatch.ts` + `batchReport.service.ts`, already computed live, no snapshot columns): `batch_code`, `supplier`, `received_date`, `return_due_date`, `other_cost`, `status`, `notes`, plus derived: product count, sold count, remaining count, revenue, and overdue-return flag (days overdue).

**Supporting master data** (from `types/masterData.ts`, already exists): `product_category`, `product_color`, `salesperson`, `product_source`, `market`, `country` — usable for grouping/filtering, no new lists proposed.

**Images** (from `types/productImage.ts`, already exists): one or more images per product with `sort_order` (lowest = cover/thumbnail).

Nothing above requires a new table, column, or field. Phase 1 is a new *view* over existing data.

---

## 3. Search

The Product List already supports search by `product_name` / `product_code` / `sku` (case-insensitive partial match). Phase 1 should offer equivalent search for Inventory, scoped to what's actually useful for a "what do we have" lookup: product code, SKU, product name, and certificate number.

The Batch List today has **no search at all** (confirmed gap, `docs/INVENTORY_FOUNDATION_REVIEW.md` §7) — finding a batch means scrolling the full list. Phase 1 should decide whether Inventory introduces batch search (by batch code or supplier) as part of its own read-only view, without modifying the existing (locked) Batch module screens themselves.

Search in Phase 1 only ever narrows what is displayed — it never changes underlying data (read-only scope).

---

## 4. Filters

Existing filters on Product List today: category, status. Candidate filters for Inventory Phase 1, all backed by existing fields:
- Category
- Product status (`Active` / `Paused` / `Sold` / `Discontinued` / `Returned`)
- Batch
- Location
- "No batch assigned" (a gap already flagged in `docs/INVENTORY_FOUNDATION_REVIEW.md` §7 — no product filter for this exists anywhere today)

Whether all of these belong in Phase 1's first cut, or a smaller subset, is an open question (see below) — this section inventories what's *possible* from existing fields, not a final filter list.

---

## 5. Batch View

Business need: a batch-centric read-only view — a list of batches with their stats (supplier, received date, return-due date, product count, sold count, remaining count, overdue-return flag), and the ability to drill into a batch to see the products it contains. Product/sold/remaining count computation already exists (`getBatchStats`, `batchReport.service.ts`).

**Revenue, profit, and cost — including `other_cost` — are explicitly excluded from Batch View** (Product Owner Review, Revision 2). Phase 1's batch view is a stock/count view only, not a financial one.

Open question: does this become a new "Inventory → Batch" view, or does it link out to the existing (LOCKED) Batch module's own List/Detail pages rather than duplicating them? Per module ownership rules, Inventory Phase 1 may *read* Batch data but must not modify the Batch module.

---

## 6. Product Detail

Business need: within Inventory, a read-only, stock-focused view of a single product.

**Explicit field list (Product Owner Review, Revision 2):**
- Images
- Batch
- Source
- Sales Owner
- Status
- Price
- Created At

**No Orders history is shown** — Orders is blocked (see dependency note above) and out of scope for Phase 1 regardless.

Open question: should Inventory present its own read-only product view built from this field list, or simply link out to the existing (LOCKED) Product Detail page for the full picture? Duplicating Product Detail's UI is not proposed here — this section names the required fields and the business need only.

---

## 7. Images

Product Images already exist as a full module (`product_images` table, `productImage.service.ts`, `ProductImageManager` with ordering/cover-selection). Phase 1's need is display-only: show the cover image (lowest `sort_order`) in list/summary views, and the full image set in a product's detail view. No add/edit/delete/reorder capability belongs in Inventory — that CRUD already belongs to the Product module, and Phase 1 is read-only regardless.

---

## 8. Inventory Statistics

**Locked (Product Owner Review, Revision 2)** — Phase 1 statistics are counts only, exactly:
- Total Products
- By Status
- By Origin
- By Category
- By Batch
- By Sales Owner

No inventory value, revenue, profit, or cost figures are computed anywhere in Phase 1 statistics — consistent with §5's Batch View scope. **By Origin** uses the existing `origin` field on `products` (present in the schema but no longer editable from the Product form since Settings V1.1 — Phase 1 only reads it, not reintroducing editing). **By Sales Owner** uses the existing `products.salesperson` field.

---

## Explicitly Out of Scope (Phase 2 — blocked until Orders is completed)

- **Reserve** — transitioning stock into a reserved state.
- **Sell** — recording/marking stock as sold from within Inventory.
- **Release** — releasing a reservation back to available.
- **Orders integration** — any read or write dependency on the Orders module.
- **Inventory adjustment** — any manual correction or write path to `available`/`reserved`/`sold` or any other inventory-related field.

Phase 1 introduces **no new database writes**, no new fields, and **does not read, display, or reference `products.available`/`reserved`/`sold` anywhere** (Product Owner Review, Revision 2 — resolved, not merely deferred). Phase 1's only stock signal is `products.status`. Phase 1 only decides how existing data is *displayed*, never how it's written or corrected.

---

## Open Questions

*Resolved this pass (Revision 2) — no longer open: counter trust, sold signal, statistics valuation basis, and low-stock/aging signal. §8's statistics lock is an exact, exhaustive list with no value/valuation component and no aging metric, so all four are answered by the lock itself rather than needing a separate decision.*

1. **Batch View placement:** Does Inventory get its own Batch view, or does it link out to the existing (LOCKED) Batch module's List/Detail pages?
2. **Product Detail placement:** Does Inventory present its own read-only product view built from the locked field list (§6), or link out to the existing (LOCKED) Product Detail page?
3. **Filter set:** Which of the candidate filters in §4 (category, status, batch, location, "no batch assigned") should ship in Phase 1's first cut?
4. **Batch search:** Should Phase 1 add batch search (by code/supplier) as part of Inventory's own view, given the existing Batch List has none today?
5. **Product Detail "Price" field:** `products` has both `cost_price` and `sale_price` (plus `discount`). §6 locks in a single "Price" field — does this mean `sale_price` only, or should both be shown?

---

Business Design only. No code written. No database changes. No UI changes. Stopping — waiting for Product Owner Review.
