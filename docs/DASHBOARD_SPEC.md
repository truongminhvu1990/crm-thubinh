# Dashboard Module — Business Design Spec

**Phase:** P6 (Product Owner Decision, 2026-07-18) — labeled "Phase P6" rather than a Sprint number like every prior module; noted, not treated as an error.
**Module:** Dashboard
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Scope note:** No code, no SQL, no migrations, no UI were written for this document.

**Why this document exists:** the P6 task asked to implement Dashboard directly, but unlike every other module (Reports, Inventory, Market Intelligence, Jade Intelligence), Dashboard has never had a `docs/DASHBOARD_SPEC.md` or `docs/DASHBOARD_UI.md` — `PROJECT_MANIFEST.md`'s own Architecture Principles ("Business Design First," "Business/Architecture/Database/UI must each be approved before implementation") were unmet for it. This spec closes that gap for the 7 in-scope P6 items before any code is written. Per Product Owner decision, **item 7, Order Reports, is dropped from this phase** (see §3.4) — the remaining 7 items are covered below.

---

## Connection to other modules

| Module | Relationship to Dashboard |
|---|---|
| **Customer** (LOCKED) | Read only, via existing `getCustomerStats()` (`lib/customer.service.ts`). No write, no field change. |
| **Reports** (LOCKED) | Read only, via existing `lib/reports/reports.service.ts` functions. Dashboard does not duplicate Reports' tables — it surfaces top-line figures and links out to Reports for detail (locked altitude split, `REPORTS_SPEC.md` Decision 3). |
| **Product / Inventory / Batch** | No direct read — figures come only through Reports' already-computed aggregates (`getProductReportData()`, `getBatchStaticReportData()`), not a new Dashboard-owned query. |
| **Orders** (BLOCKED) | No dependency. Order Reports is out of scope this phase. |
| **AI / Jade Intelligence** | No dependency — explicitly excluded by this task's own rules ("No AI," "No Jade Intelligence Platform"). |

Unlike Reports (which must be architecturally independent — no cross-module service imports, per its Decision 5), **Dashboard's whole purpose is to summarize other already-LOCKED modules**, so importing their existing read functions is the intended pattern here, not a violation of it.

---

## 1. Business Goal

Dashboard is the CRM's single landing page and occupies the **"Overview"** altitude in the product (locked product-level split, `REPORTS_SPEC.md` Decision 3 / restated by `MARKET_INTELLIGENCE_SPEC.md` Decision 2: *Dashboard = Overview, Reports = Operational Details, Market Intelligence = Trends & Insights*). It shows top-line, current-state figures and provides at-a-glance navigation into each area's details — it does not compute new business logic, does not reproduce Reports' tables, and reads no data source Reports itself doesn't already have.

---

## 2. Business Rules

- **Read only.** No write, edit, delete, or scheduling capability anywhere on Dashboard.
- **No AI, no Jade Intelligence Platform, no prediction/forecast** — explicit task rule, consistent with Reports' own "no AI" lock.
- **No new fields, tables, or business rules.** Every figure shown must come from a function an existing LOCKED module already exposes.
- **`products.available`/`reserved`/`sold` never read** — same carried-forward ban as Inventory/Reports/Market Intelligence; irrelevant in practice since Dashboard never queries `products` directly (see below), but stated for completeness.
- **No Orders dependency.** Orders is BLOCKED; no Order-derived figure appears anywhere on Dashboard.
- **No duplicate reporting pages.** Dashboard never re-implements a table Reports already renders — at most it shows a single summary number/row and links to the corresponding Reports section.

---

## 3. Scope — the 7 in-scope P6 items

### 3.1 Dashboard Overview (item 1)

Top-line KPI cards, each reusing an existing, already-computed figure and linking through to its owning module:

| Card | Source | Links to |
|---|---|---|
| Total Customers / VIP Customers | `getCustomerStats()` (existing — already on Dashboard today) | `/customers` |
| Total Products | `getProductReportData().total` (Reports) | `/reports` |
| Total Batches | `getBatchStaticReportData().totalBatches` (Reports) | `/reports` |
| Current Month Revenue | `getPurchaseReportData(getDateRange("this_month")).totalRevenue` (Reports) | `/reports` |

This replaces Dashboard's current dependency on the **legacy, orphaned** `lib/report.service.ts`'s `getCurrentMonthRevenue()` with the LOCKED `lib/reports/reports.service.ts` equivalent — a like-for-like data-source swap, not a new figure or a business-rule change.

### 3.2 Sales Summary (item 2) — proposed definition, see Open Question #1

Term does not appear in any locked spec. Proposed as a compact panel, condensed from data Reports already computes for its "Doanh thu" section — no new aggregation logic:
- This Month's total revenue (same figure as the Overview card, §3.1)
- Top revenue source this month (`getPurchaseReportData().bySource[0]`)
- Top salesperson this month (`getPurchaseReportData().bySalesperson[0]`)

### 3.3 Revenue / Customer / Product / Inventory Reports (items 3–6)

Per the task's own "reuse the existing Reports module, do not duplicate reporting pages" rule: these are **not** new tables or pages. Each becomes a single entry-point card on Dashboard linking to the matching, already-built Reports section:

| P6 item | Existing Reports section | 
|---|---|
| Revenue Reports | "Doanh thu" |
| Customer Reports | "Khách hàng" |
| Product Reports | "Sản phẩm" |
| Inventory Reports | "Lô hàng" (confirmed mapping — not the separate `/inventory` module, per Product Owner decision) |

### 3.4 Order Reports (item 7) — Dropped this phase

Conflicts with the LOCKED `REPORTS_SPEC.md` §3.4 (Orders BLOCKED, zero Orders-based reports by design). Per Product Owner decision, out of scope for P6 entirely — would require Orders being unblocked and a `REPORTS_SPEC.md` Revision 3 before it could be added in a future phase.

### 3.5 Dashboard Verification (item 8)

Not a business-design content item — this is the Development-phase Definition of Done (`tsc`, `eslint`, `next build`, live verification against real Supabase data) that closes out Development once this spec and a follow-up UI spec are approved, same as every prior module.

---

## Explicitly Out of Scope

- Order Reports (§3.4) and any Orders dependency.
- Any AI, prediction, forecast, or Jade Intelligence Platform integration.
- Any new query against `products`, `product_batches`, or `customer_purchases` directly — all figures flow through Reports' or Customer's existing functions.
- Any write, export, or scheduling capability.
- Any new table, column, or field.
- Redesigning Reports, Customer, Product, Orders, or Inventory modules.
- Changing Dashboard's existing Quick Actions / System Info cards (kept as-is — see Open Question #3).

---

## Open Questions

1. **Sales Summary definition (§3.2)** — confirm the proposed This-Month-Revenue + Top-Source + Top-Salesperson panel, or provide an alternate definition.
2. **Report entry-point links** — Reports' page (`app/reports/page.tsx`) has no per-section anchors today. Should the 4 report cards (§3.3) link to plain `/reports` (simplest, no Reports-side change), or should a small `id` be added to each `<section>` so Dashboard can deep-link/scroll to the exact section? The latter is a one-line addition to Reports, not a redesign, but is still a change to a LOCKED file and needs explicit sign-off.
3. **Quick Actions / System Info cards** — confirm these existing Dashboard cards stay unchanged (assumed yes, out of scope) rather than being folded into or replaced by the new content above.

---

Business Design only. No code written. No database changes. No UI changes. Stopping — waiting for Product Owner Review.
