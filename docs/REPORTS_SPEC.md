# Reports Module — Business Design Spec

**Sprint:** 3
**Module:** Reports
**Status:** Draft — Revision 2, Product Owner Review applied (PARTIAL PASS) — awaiting further Product Owner review.
**Phase:** Business design only. No code, no SQL, no migrations, no UI were written for this document.

**Revision 2 changelog (this pass, Product Owner Review — 5 scoped decisions):**
1. **Legacy page demoted.** The existing `/reports` page/services are **Legacy** — explicitly **not** the Business Source of Truth. This document (`docs/REPORTS_SPEC.md`) is the sole Business Design. Removed all "adopt as baseline" / "carry forward as-is" framing from Revision 1 §0/§2/§4.
2. **Business Reports only — locked.** No AI, no Prediction, no Forecast, anywhere in Reports. Made explicit in §1 and Explicitly Out of Scope.
3. **Dashboard vs. Reports altitude — locked.** Dashboard = Overview. Reports = Details. No overlap: Reports does not reproduce Dashboard's overview cards, and does not call Dashboard's underlying functions.
4. **Date Filter — locked.** Today / This Week / This Month / This Year / Custom Range. New §4 defines this and states exactly which reports it applies to.
5. **Independence — locked.** Reports is read-only, has **no dependency on the Inventory service layer**, and **no shared business logic** with any other module's service file. Reports computes every aggregate itself, directly from the underlying tables. All Revision 1 Open Questions are resolved by decisions 1–5 and removed — none remain.

Dependency note (carried from Revision 1, unchanged): Orders is currently **blocked** and its tables are not confirmed live with an approved schema. This spec continues to assume nothing about Orders — see §3.4.

---

## 0. Legacy Reports Page — Reference Only, Not Authoritative

`app/reports/page.tsx`, `lib/report.service.ts`, and `lib/batchReport.service.ts` already exist and render a working page today, even though `docs/PROJECT_MANIFEST.md` lists Reports as `PLANNED`. **Per Decision 1, this legacy code is not the Business Source of Truth for the Reports module and is not treated as a baseline to preserve.** It is noted here only as existing context (the tables it renders, listed in §3, happen to overlap with what this Business Design independently defines as legitimate business reports). Whether the legacy page/services are replaced, deprecated, or left alongside the new Reports module is a Development-phase implementation decision, not decided by this document.

### Connection to other modules

| Module | Relationship to Reports |
|---|---|
| **Customer** (LOCKED) | Read only, direct table reads. No write, no field change. |
| **Product** (LOCKED) | Read only, direct table reads. Never `available`/`reserved`/`sold`. No write, no field change. |
| **Customer Purchases** (existing table) | Read only, direct table reads. No write, no field change. |
| **Batch** (LOCKED) | Read only, direct table reads. No write, no field change. |
| **Orders** (BLOCKED) | No dependency — see §3.4. |
| **Inventory** (Sprint 2, Draft) | **No dependency (Decision 5).** Reports does not call `lib/inventory.service.ts` or any Inventory code. If Reports needs a stock/batch breakdown, it computes it independently from Product/Batch tables. |
| **Dashboard** | **Locked altitude split (Decision 3): Dashboard = Overview, Reports = Details.** Reports does not call Dashboard's functions (`getCustomerStats()`, `getCurrentMonthRevenue()`) and does not reproduce Dashboard's overview cards. |

---

## 1. Business Goal

Reports is a strictly read-only, independent **Business Reports** layer over the five approved data sources: Customers, Products, Customer Purchases, Orders, Inventory. "Business Reports" means counts, sums, and breakdowns of data that already exists — **no AI, no prediction, no forecasting, in any report, anywhere in this module** (Decision 2).

Reports occupies the "Details" altitude in the product: **Dashboard shows an Overview (top-line, current-state cards); Reports shows Details (breakdowns, groupings, and — where applicable — a date-ranged history)** (Decision 3). This is a locked product-level distinction, not a Reports-only convention.

Reports has no dependency on any other module's service code. Every report defined here is computed by Reports itself, by reading directly from the underlying Supabase tables (`customers`, `products`, `customer_purchases`, `product_batches`). Reports does not import or call `customer.service.ts`, `product.service.ts`, `purchase.service.ts`, `report.service.ts`, `batchReport.service.ts`, or `inventory.service.ts` for its business logic (Decision 5). This does not create new fields or new meanings for existing fields — `products.status`, `customer_purchases.sale_date`, etc. keep exactly the meaning already established by their owning (LOCKED) module; Reports simply reads them itself instead of borrowing another module's computation.

---

## 2. Business Rules

These are Reports' own rules, stated independently (not imported from another module's code), and they do not redefine any field's existing meaning:

- **Revenue basis:** revenue reports read `customer_purchases.sale_price`, `source`, and `salesperson` directly. These three fields are already snapshotted at sale time by the Customer Purchases module (existing, unchanged column behavior) — Reports reads the stored snapshot values as-is; it does not itself perform any snapshotting logic.
- **Sold vs. Remaining basis (Batch reports):** a product counts toward "Sold" if `products.status === "Sold"`; it counts toward "Remaining" if `status` is anything except `"Sold"` or `"Returned"`. This restates the existing, already-approved meaning of the `status` enum (`lib/product.constants.ts`) — Reports does not invent a new classification.
- **Overdue Batch definition:** `product_batches.status === "active"` AND `return_due_date` is in the past. Restates the existing field meaning; no new rule.
- **`products.available`/`reserved`/`sold` are never read.** Same fact already established for Product/Inventory data (those counters have no reliable live writer today) — Reports must not read them either. `products.status` is the only stock signal.

---

## 3. Data Sources

Every report below is computed by Reports directly against the named table(s) — no other module's service file is called.

### 3.1 Customers

Reads `customers` directly: `customer_code`, `full_name`, `source`, `vip_level`, `assigned_salesperson`, `created_at`.

**Detail-level breakdowns** (distinct from Dashboard's Overview cards, per Decision 3): By Source, By VIP Tier, By Assigned Salesperson — counts, grouped over all customers. Not a Date Filter target (see §4 — customer segment counts are current-state, not transaction-dated).

`total_purchase` is not read — it is an unwritten column; actual purchase figures come only from Customer Purchases (§3.3).

### 3.2 Products

Reads `products` directly: `product_code`, `product_name`, `category`, `status`, `origin`, `salesperson`, `batch_id`. Never reads `available`/`reserved`/`sold` (§2).

**Detail-level breakdowns:** Total Products, By Status, By Category, By Origin, By Sales Owner. Computed independently — not via `computeInventoryStats()` (Decision 5). Not a Date Filter target — current-state counts.

### 3.3 Customer Purchases

Reads `customer_purchases` directly: `customer_id`, `product_id`, `sale_price`, `sale_date`, `source`, `salesperson`.

**Reports:** Revenue by Source, Revenue by Salesperson, Top Customers (count + revenue per customer), Revenue by Period. **All four are Date Filter targets** (§4) — filtered on `sale_date`.

### 3.4 Orders — Unavailable

Orders remains blocked; its tables are not confirmed live with the Product-Owner-approved schema (legacy `orders` table has 0 rows and lacks approved columns). **No Orders-based report exists in this revision.** This is a scope fact, not an open question — an Orders report can be added in a future revision once Orders is unblocked, schema-confirmed, and populated.

### 3.5 Inventory / Batch

Reads `product_batches` and `products` directly (join on `batch_id`), and `customer_purchases` where revenue-by-batch requires it. **No call to `lib/inventory.service.ts` or any other Inventory code** (Decision 5).

**Reports:** Revenue by Batch (Date Filter target, keyed on `sale_date`), Product Count by Batch, Sold Count by Batch, Remaining Count by Batch, Overdue Batches (these four are current-state counts, not Date Filter targets — see §4).

---

## 4. Date Filter (Locked)

Options, locked exactly: **Today, This Week, This Month, This Year, Custom Range.**

Applies to every report keyed on `customer_purchases.sale_date`: Revenue by Source, Revenue by Salesperson, Top Customers, Revenue by Period (§3.3), and Revenue by Batch (§3.5).

Does not apply to current-state/point-in-time counts, which have no transaction date to range over: Customers by Source/VIP Tier/Salesperson (§3.1), Products Total/By Status/By Category/By Origin/By Sales Owner (§3.2), and Product/Sold/Remaining Count by Batch and Overdue Batches (§3.5).

Exact filter control placement and default selection are UI Design phase decisions, not decided here.

---

## Explicitly Out of Scope

- **AI, Prediction, Forecast** — none, anywhere in Reports (Decision 2).
- Any Orders-based report (§3.4) — no approved, populated Orders data exists.
- Any dependency on `lib/inventory.service.ts` or any other module's service file (Decision 5).
- Treating the legacy `/reports` page or its services as authoritative (Decision 1).
- Any write, export, or scheduling capability — Reports is read only.
- Any new table, column, or field — everything in this spec reads fields that already exist.
- Any new business rule or redefinition of an existing field's meaning (§2).
- Reproducing Dashboard's Overview cards or calling Dashboard's underlying functions (Decision 3).

---

## Open Questions

None. Revision 1's six open questions are resolved by Decisions 1–5 above (legacy status, AI/prediction exclusion, Dashboard/Reports altitude, date filter, Inventory/shared-logic independence) and are not carried forward.

---

Business Design only. No code written. No database changes. No UI changes. Stopping — waiting for Product Owner Review.
