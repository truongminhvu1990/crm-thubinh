# Market Intelligence Module — Business Design Spec

**Module:** Market Intelligence
**Status:** Draft — Revision 2, Product Owner Review applied (PARTIAL PASS) — awaiting further Product Owner review.
**Phase:** Business design only. No code, no SQL, no migrations, no UI were written for this document.

**Revision 2 changelog (this pass, Product Owner Review — 7 scoped decisions):**
1. **Sprint references removed.** This document is identified as "Market Intelligence" only — no sprint number anywhere. The Revision 1 manifest sprint-numbering note is removed entirely. (Resolves former Open Question #1.)
2. **Module responsibilities locked:** Dashboard = Overview, Reports = Operational Details, Market Intelligence = Trends & Insights. §1's altitude table is updated accordingly; "proposed, not locked" language is removed. (Resolves former Open Question #2.)
3. **Popularity ranking basis locked** to exactly two metrics, everywhere in this module: Purchase Count and Revenue. No other basis (e.g. unit count) is used. (Resolves former Open Question #6.)
4. **Trend granularity locked** to Month only — no week/year/custom range option anywhere in this module. (Resolves former Open Question #5.)
5. **Size locked:** group by the existing `products.size` value exactly as stored — no normalization, no bucketing, no master size table. (Resolves former Open Question #3.)
6. **Color locked:** two separate rankings — by Purchase Count and by Revenue (the Decision 3 metric pair, made explicit for Color). (Resolves former Open Question #4 — see Self Review for the normalization sub-point.)
7. **Surface locked:** a dedicated page at `/market-intelligence` — not a Dashboard widget, not a Reports tab. (Resolves former Open Question #7.)

All Open Questions from Revision 1 are resolved by Decisions 1–7 above and are removed — none remain.

---

## 1. Business Design

### Purpose

Market Intelligence is a strictly **read-only** module that helps sales staff understand market trends — what is popular, what is selling, how buying behavior is shifting — using only data that already exists in this CRM.

### Hard constraints (restated from the task, binding on every rule in §2)

- No AI, no Machine Learning, no LLM, anywhere in this module.
- No future-price prediction of any kind.
- No web scraping, no external APIs, no external data of any kind — every insight is computed from data already stored in this CRM's own tables.
- No redesign of existing business rules — every field read here keeps exactly the meaning already established by its owning (LOCKED) module. Market Intelligence does not invent new field meanings, only ranks and trends existing ones.
- Read only — no write, no export, no scheduling capability anywhere in this module.

### Module responsibilities (locked, Decision 2)

| Surface | Responsibility |
|---|---|
| **Dashboard** | Overview — top-line, current-state cards |
| **Reports** | Operational Details — breakdowns, groupings, date-ranged history |
| **Market Intelligence** | Trends & Insights — rankings (Purchase Count / Revenue) and month-over-month trend direction, over the same underlying data |

### Surface (locked, Decision 7)

Market Intelligence is a dedicated page at **`/market-intelligence`**. It is not a Dashboard widget and not a Reports tab.

### Independence

Following the precedent set by Reports (`REPORTS_SPEC.md` Decision 5): Market Intelligence computes every insight itself, by reading directly from the underlying tables (`customers`, `products`, `customer_purchases`, `product_batches`). It does not call `lib/report.service.ts`, `lib/batchReport.service.ts`, `lib/inventory.service.ts`, `lib/product.service.ts`'s recommendation logic, or any other module's service layer.

---

## 2. Intelligence Rules

All rules below are plain counts, sums, and groupings — arithmetic only, no statistical modeling, no clustering, no regression, no forecasting. Every rule restates an existing field's meaning; none of them redefine one.

### 2.1 Category

Two rankings, both from `customer_purchases` joined to `products.category`:
- **Popularity — Purchase Count:** grouped by category, ranked by number of purchases.
- **Popularity — Revenue:** grouped by category, ranked by summed `customer_purchases.sale_price`.

### 2.2 Color (Decision 6)

Two rankings, both from `customer_purchases` joined to `products.color`, using the literal stored value (no normalization against the `product_color` master-data list):
- **Popularity — Purchase Count:** grouped by color, ranked by number of purchases.
- **Popularity — Revenue:** grouped by color, ranked by summed `customer_purchases.sale_price`.

### 2.3 Size (Decision 5)

One ranking, from `customer_purchases` joined to `products.size`:
- **Popularity — Purchase Count:** grouped by the existing `products.size` value exactly as stored — no normalization, no bucketing, no master size table. Ring size and wrist size are not combined onto a shared scale; grouping is by the literal stored value only.

### 2.4 Customer Buying Trends (Decision 4)

Purchase count and revenue per customer (or customer segment, e.g. by `source`/`vip_level`), bucketed by **calendar month only** — no week, year, or custom range.

### 2.5 Product Demand Trends (Decision 4)

Purchase count for a category/color/product, bucketed by **calendar month only**. Demand is measured only by completed purchases (`customer_purchases`) — never by `products.available`/`reserved`/`sold` (untrustworthy, no live writer — same finding already established in `INVENTORY_SPEC.md` §1) and never by Orders (blocked, no approved live schema — same finding already established in `REPORTS_SPEC.md` §3.4).

### Carried-forward bans (not new rules — restating existing findings)

- **`products.available`/`reserved`/`sold` are never read**, anywhere in this module — same ban already locked in `INVENTORY_SPEC.md` and `REPORTS_SPEC.md`.
- **No Orders-based insight** — Orders is blocked, same as `REPORTS_SPEC.md` §3.4.

---

## 3. Data Sources

Every insight in §2 is computed directly against these tables — no other module's service file is called (§1 Independence).

### 3.1 Customers
Reads `customers` directly: `customer_code`, `full_name`, `source`, `vip_level`, `assigned_salesperson`, `created_at`. Used to segment Customer Buying Trends (§2.4), never written to.

### 3.2 Products
Reads `products` directly: `product_code`, `product_name`, `category`, `color`, `size`. Never reads `available`/`reserved`/`sold` (§2).

### 3.3 Customer Purchases
Reads `customer_purchases` directly: `customer_id`, `product_id`, `sale_price`, `sale_date`. This is the sole transactional signal for every ranking and trend rule in §2 — the only table in this data set that records an actual completed sale.

### 3.4 Inventory
There is no Inventory-specific table distinct from Product/Batch (per `INVENTORY_SPEC.md` §2, Inventory Phase 1 is itself only a read-only *view* over `products` and `product_batches`, not a separate data store). If a future revision adds a batch-scoped insight, it would read `product_batches`/`products` directly, not through `lib/inventory.service.ts` (§1 Independence). No insight in §2 currently requires Batch data.

### Orders — Unavailable
Not a data source for this module. Orders is blocked and its tables are not confirmed live with an approved schema (same finding as `REPORTS_SPEC.md` §3.4).

---

## 4. Out of Scope

- **AI, Machine Learning, LLM** — none, anywhere, in any form.
- **Future price prediction** — not attempted, not approximated, not implied by any trend display.
- **Web scraping, external APIs, external market data** — every insight comes from this CRM's own tables only.
- **Redesigning existing business rules** — no field's existing meaning is changed.
- **`products.available`/`reserved`/`sold`** — never read (§2).
- **Any Orders-based insight** — Orders is blocked (§3.4).
- **Any write, export, or scheduling capability** — read only.
- **Any new table, column, or field** — everything here reads fields that already exist.
- **Any dependency on Reports, Dashboard, Inventory, or Jade Intelligence service code** — Market Intelligence computes its own aggregates (§1 Independence).
- **Popularity ranking by any metric other than Purchase Count or Revenue** — e.g. unit count is not used (Decision 3).
- **Any trend granularity other than Month** — no week/year/custom range (Decision 4).
- **Size normalization or a master size table** — the raw stored value is used as-is (Decision 5).
- **Market Intelligence as a Dashboard widget or Reports tab** — it is a dedicated page only (Decision 7).

---

## 5. Open Questions

None. Revision 1's seven open questions are resolved by Decisions 1–7 above and are not carried forward.

---

Business Design only. No code written. No database changes. No UI changes. Stopping — waiting for Product Owner Review.
