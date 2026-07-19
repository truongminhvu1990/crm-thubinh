# Reports Module — UI Design Spec

**Sprint:** 3
**Module:** Reports
**Status:** Draft — Revision 2, Product Owner Review applied (PARTIAL PASS) — awaiting further Product Owner review.
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level design description only.
**Based on:** `docs/REPORTS_SPEC.md` (Revision 2 — **LOCKED**). This document does not redesign, reinterpret, or add business logic, business rules, or reports. Every table, column, and figure below traces back to a report already named in that spec, cited inline as (Spec §N).

**Revision 2 changelog (this pass, Product Owner Review — 5 scoped decisions):**
1. **Reports List layout — locked.** One page, vertical scroll, all four sections always visible at once. No tabs, no accordion, no collapse/expand. Resolves former Open Question #1.
2. **Revenue by Period — locked.** Always buckets by calendar month, regardless of which Date Filter option is active. Resolves former Open Question #3.
3. **Summary Cards — locked to exactly four**, one per section: **Total Revenue**, **Total Customers**, **Total Products**, **Total Batches**. Removed: Total Transactions, Batches Overdue, and any Average/Growth-style card (none were proposed, now explicitly excluded). Resolves former Open Question #4.
4. **Export Button — locked.** Renders **disabled**, labeled **"Coming Soon."** Resolves former Open Question #5.
5. **Date Filter default — locked.** This Month ("Tháng này"). Resolves former Open Question #2. All Revision 1 Open Questions are resolved by decisions 1–5 and removed — none remain.

---

## Design Principles

1. **Read-only, and visibly so.** No edit, create, or delete control appears anywhere. The one interactive-looking element, the Export Button (§1.12), renders disabled with a "Coming Soon" label — it is not clickable.
2. **Reports = Details, Dashboard = Overview (Spec §1, §3 — locked).** Nothing here duplicates a Dashboard card; every screen shows a breakdown/table, never a single top-line number in isolation (the four Summary Cards, §1.5, are section-level rollups, not Dashboard-style overview cards).
3. **No report invented.** The spec names exactly 13 reports across 4 data sources (Customers §3.1, Products §3.2, Customer Purchases §3.3, Batch §3.5; Orders §3.4 has none). This document designs screens for exactly those 13 — it does not add, merge into new metrics, or split any of them into something the spec didn't name.
4. **Date Filter is scoped, not universal (Spec §4 — locked).** It only appears next to a report whose data is keyed on `sale_date`: Revenue by Source, Revenue by Salesperson, Top Customers, Revenue by Period, Revenue by Batch. It never appears next to a current-state count report (Customers by Source/VIP Tier/Salesperson; Products Total/By Status/By Category/By Origin/By Sales Owner; Product/Sold/Remaining Count by Batch; Overdue Batches).
5. **Consistency with existing screens.** Reuses this codebase's established table-card, `StatCard`, `SearchInput`, and empty/loading conventions (same family already used by Product/Batch/Inventory) rather than inventing new visual primitives.

---

## 1. UI Design

### 1.1 Reports List

Route: `/reports` (existing Sidebar entry, no change to position).

**Locked (Decision 1): a single page, vertical scroll, all four sections rendered at once, top to bottom — no tabs, no accordion, nothing collapsed by default.** In order:

1. **Khách hàng** (Customers, Spec §3.1) — 3 reports
2. **Sản phẩm** (Products, Spec §3.2) — Total Products + 4 reports
3. **Doanh thu** (Customer Purchases, Spec §3.3) — 4 reports, Date Filter applies to all
4. **Lô hàng** (Batch, Spec §3.5) — 5 reports, Date Filter applies to 1 of the 5

No Orders section, entry, or "coming soon" placeholder anywhere on this screen — Spec §3.4 states Orders has zero reports in this revision, and adding even a disabled placeholder would be adding a report-shaped element the spec doesn't name.

Each section renders as its own card (title + Summary Card(s) + table(s)), stacked in the fixed order above. The user scrolls the whole page to move between sections; there is no in-page navigation control that hides one section to show another.

---

### 1.2 Date Filter

One control, appearing exactly where Spec §4 locks it: above the **Doanh thu** section (governs all 4 of its reports at once) and above the single **Doanh thu theo lô hàng** (Revenue by Batch) table inside the **Lô hàng** section (governs only that one table — the other 4 Batch reports are current-state and show no Date Filter control at all).

**Options, exactly as locked:** Hôm nay (Today) · Tuần này (This Week) · Tháng này (This Month) · Năm này (This Year) · Tùy chọn (Custom Range). Custom Range reveals two date inputs (from/to). Rendered as a segmented control/dropdown, consistent with other filter controls already in the app.

**Default (Decision 5, locked): "Tháng này" (This Month)** — both Date Filter instances (Doanh thu section, Revenue by Batch table) load with This Month selected on first render.

Changing the filter re-fetches/recomputes only the report(s) it governs — it never affects the Customers or Products sections, which have no time dimension.

---

### 1.3 Search

Each individual table (§1.4) gets its own lightweight search input directly above it, filtering that table's already-loaded rows by their label column — client-side row filtering, not a new query or business rule:

| Table | Search matches |
|---|---|
| Khách hàng theo nguồn / hạng / nhân viên | Source / VIP tier / salesperson label |
| Sản phẩm — Trạng thái / Danh mục / Xuất xứ / Nhân viên | Status / category / origin / salesperson label |
| Doanh thu theo nguồn hàng / nhân viên | Source / salesperson label |
| Khách hàng hàng đầu | Customer name |
| Doanh thu theo kỳ | Period (month) label |
| Các bảng theo lô hàng | Batch code |

Search only narrows what's displayed on a table already computed by its report — it never changes the underlying aggregation, and it's independent of the Date Filter (both can be active at once).

---

### 1.4 Table Layout

Same table-card convention already used elsewhere in the app (header row, right-aligned numeric columns, left-aligned label column). Exact columns per report, all traced to Spec §3:

**Khách hàng (§3.1):**
- By Source: Nguồn khách hàng | Số lượng
- By VIP Tier: Hạng | Số lượng
- By Assigned Salesperson: Nhân viên phụ trách | Số lượng

**Sản phẩm (§3.2):**
- By Status: Trạng thái | Số lượng
- By Category: Danh mục | Số lượng
- By Origin: Xuất xứ | Số lượng
- By Sales Owner: Nhân viên | Số lượng
- (Total Products has no table — single figure, see Summary Cards §1.5)

**Doanh thu (§3.3):**
- Revenue by Source: Nguồn hàng | Số lượng đã bán | Doanh thu
- Revenue by Salesperson: Nhân viên | Số lượng đã bán | Doanh thu
- Top Customers: Khách hàng (linked to Customer Detail) | Số lần mua | Doanh thu
- Revenue by Period: Kỳ | Doanh thu — **locked (Decision 2): always grouped by calendar month** (e.g. "Tháng 7/2026"), regardless of which Date Filter option is active. A narrow filter (e.g. "Hôm nay") simply yields at most one month row.

**Lô hàng (§3.5):**
- Revenue by Batch: Lô hàng | Doanh thu
- Product Count by Batch: Lô hàng | Số sản phẩm
- Sold Count by Batch: Lô hàng | Đã bán
- Remaining Count by Batch: Lô hàng | Còn lại
- Overdue Batches: Lô hàng | Hạn trả | Số ngày quá hạn | Còn lại

No column above adds a field or figure not already present in Spec §3.

---

### 1.5 Summary Cards

**Locked (Decision 3): exactly four cards, one per section, no others.**

- **Khách hàng section:** **Total Customers** — count of all customers.
- **Sản phẩm section:** **Total Products** — the standalone total Spec §3.2 names outright.
- **Doanh thu section:** **Total Revenue** — sum of revenue for the active Date Filter range (same rows Revenue by Source/Salesperson already aggregate).
- **Lô hàng section:** **Total Batches** — count of all batches.

No Total Transactions card, no Overdue/Batches-Overdue card, no Average or Growth card anywhere — removed/excluded per Decision 3.

---

### 1.6 Empty State

Same muted-icon-plus-text convention already used across the app (Product/Batch/Inventory):

| Screen/table | Empty condition | Message (illustrative) |
|---|---|---|
| Any breakdown table | No rows for that grouping | "Chưa có dữ liệu" |
| Doanh thu tables, any Date Filter | No purchases in the selected range | "Không có dữ liệu trong khoảng thời gian đã chọn" |
| Search applied, no match | Search narrows a table to zero rows | "Không tìm thấy kết quả phù hợp" |
| Summary Cards | No underlying rows yet | Card still renders showing "0", not hidden — same convention `StatCard` already follows |

---

### 1.7 Loading State

No skeleton loaders exist anywhere in this codebase, so Reports doesn't introduce one — same centered spinning indicator already used by Product/Batch/Inventory tables, shown in place of a section's table(s) while its data loads. Changing the Date Filter shows the same in-place spinner on just the table(s) it governs, not the whole page.

---

### 1.8 Mobile Layout

Follows the same responsive behavior already shipped for Customer/Product/Batch/Inventory — no new responsive pattern introduced:

- The four sections stack full-width in the same fixed vertical order as desktop (§1.1) — single-page, vertical-scroll layout is identical in shape on mobile, just narrower.
- Date Filter control stacks above the table(s) it governs, full-width; Custom Range's two date inputs stack vertically.
- Search input, full-width, above its table.
- Tables scroll horizontally within their own card (same as every other table in this app).
- The four Summary Cards stack into a scrollable row or 2-column grid, same pattern `StatCard` already follows elsewhere.
- Export Button (disabled) moves below the table it belongs to, to avoid crowding the header row.

---

### 1.9 Desktop Layout

- All four sections stack vertically in a single scrolling column, in the fixed order from §1.1 — no side-by-side section placement (locked, Decision 1).
- Per table: Search input (left) + Date Filter (right, only where §1.2 applies) + Export Button (far right, disabled) sit in one row above the table, same row composition already used by Product List's filter bar.
- Each section's Summary Card sits above its table(s), single card (not a row of many, since each section has exactly one per Decision 3).
- Tables show their full column set without horizontal scroll at normal desktop widths.

---

### 1.10 Permissions (Read Only)

This codebase has no role-based access control anywhere (confirmed precedent: `ORDERS_UI.md` §20, `INVENTORY_UI.md` §1.12). Reports doesn't introduce one either — "read only" here is a design constraint (no write-capable control exists), not a permission system.

| Action | Available? |
|---|---|
| View any report section/table | Yes — any authenticated staff member |
| Search / apply Date Filter | Yes |
| Click Export Button | **No — renders disabled, "Coming Soon"** (§1.12) |
| Edit/create/delete any underlying record from Reports | No — no control exposed anywhere in this module |
| View an Orders-based report | No — none exist (Spec §3.4) |

---

### 1.11 Navigation Flow

```
Reports (/reports) — single page, vertical scroll, no tabs, no accordion
├── Khách hàng section  → Total Customers card + 3 tables, no Date Filter
├── Sản phẩm section    → Total Products card + 4 tables, no Date Filter
├── Doanh thu section   → Total Revenue card + 4 tables, Date Filter governs all 4 (default: This Month)
└── Lô hàng section     → Total Batches card + 5 tables, Date Filter governs 1 of 5 (default: This Month)
```

- The Sidebar's existing Reports entry lands on Reports List (§1.1) — no change to its position.
- All four sections live under the single `/reports` route, always simultaneously visible, in this fixed order.
- **Top Customers'** customer name links out to the existing (LOCKED) Customer Detail page — the only outbound navigation edge in this module.
- No path in this flow ever reaches an Orders screen (Spec §3.4).
- No breadcrumb needed — Reports is a single flat page with in-page sections, not a routed drill-down hierarchy.

---

### 1.12 Export Button (UI Only, Disabled)

**Locked (Decision 4):** a button appears above each table (§1.9's filter row), consistent across all 13 reports, rendered **disabled** with the label **"Coming Soon."** It is not clickable, has no wiring, no file generation, and no defined future behavior in this revision.

---

## 2. Open Questions

None. Revision 1's five open questions are resolved by Decisions 1–5 above (page layout, Revenue by Period bucketing, Summary Cards set, Export Button state/label, Date Filter default) and are not carried forward.

---

UI Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
