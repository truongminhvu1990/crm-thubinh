# Market Intelligence Module — UI Design Spec

**Module:** Market Intelligence
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level design description only.
**Based on:** `docs/MARKET_INTELLIGENCE_SPEC.md` (Revision 2 — **LOCKED**). This document does not redesign, reinterpret, or add business logic or business rules. Every card, table, and chart below traces back to an already-locked section of that spec, cited inline as (Spec §N).

**Revision 2 changelog (this pass, Product Owner Review — PARTIAL PASS, 5 scoped decisions):**
1. **Summary Cards — locked to exactly four.** Total Revenue, Total Purchases, Total Categories, Total Colors. **Removed:** Top Category, Top Color. Resolves former Open Question #2.
2. **Rankings — locked to All Time only, no Date Filter control**, for Category, Color, and Size Rankings alike. Resolves former Open Question #1.
3. **Trend Charts — locked to Line Chart only.** No bar chart, no other chart type, anywhere in this module.
4. **Chart library — explicitly not chosen here.** This document specifies only the Line Chart shape (axes, month buckets, tooltip, no projection); library selection is deferred to Development. Resolves former Open Question #4.
5. **Navigation — locked.** The Sidebar must include a Market Intelligence entry. Resolves former Open Question #5 (page-layout question also folded into this — see §1.1).

All five of Revision 1's Open Questions are resolved and removed — none remain. Decisions 1, 2, 3+4, and 5 directly resolve former Open Questions #2, #1, #4, and (partially) #5. Two remaining items weren't directly addressed by this review's 5 decisions and were resolved conservatively rather than left dangling: **former Open Question #5 (page layout)** — kept as the single vertical-scroll page already designed in Revision 1, since nothing in this review contested it; **former Open Question #3 (Monthly Trends selection control)** — locked to a fixed aggregate line per chart, no selector control, since adding one would introduce a new interactive control this review didn't ask for. Both are disclosed as judgment calls in this revision's Self Review, not silently decided.

---

## Design Principles

1. **Read-only, and visibly so.** No edit, create, delete, or export control appears anywhere in this design — no control exists to disable, it is simply absent (same convention as `INVENTORY_UI.md` Design Principle 1).
2. **Trends & Insights altitude (Spec §1, Decision 2).** Nothing here reproduces a Dashboard Overview card or a Reports Operational Details table. Every screen shows either a ranking (Purchase Count / Revenue) or a month-bucketed trend — never a single top-line number in isolation and never a raw date-filtered breakdown table like Reports.
3. **No new business rule.** Every card, table, and chart traces to a rule Spec §2 already names. **Locked (Revision 2, Decision 2): Category, Color, and Size Rankings are All Time only — no Date Filter control anywhere on this page.** Spec's "Month only" lock (Decision 4) applies only to the two Trends (§2.4–2.5); it never applied to Rankings, and this review confirms Rankings carry no time dimension at all.
4. **New UI primitive: Line Chart.** No charting library exists in this codebase today (`package.json` confirmed) and no screen anywhere — Dashboard, Reports, Inventory, Jade Intelligence — has ever rendered a chart; all of them use tables, `StatCard`, and badges exclusively. **Locked (Revision 2, Decisions 3–4): the chart type is a Line Chart, and only the Line Chart shape is specified here — no chart library is chosen by this document.** Library selection is a Development-phase decision.
5. **Consistency where precedent exists.** Summary Cards and Rankings reuse the existing `StatCard` and table-card conventions already used by Reports/Inventory. Only the Trend Chart (§1.3) has no existing precedent to reuse.

---

## 1. UI Design

### 1.1 Market Intelligence Page

Route: **`/market-intelligence`** (Spec §1, Decision 7 — dedicated page, not a Dashboard widget or Reports tab).

Single page, vertical scroll, top to bottom — no tabs, no accordion — same single-scroll convention already used by Reports (`REPORTS_UI.md` §1.1) and Inventory:

1. Summary Cards (§1.2)
2. Category Rankings (§1.4)
3. Color Rankings (§1.5)
4. Size Rankings (§1.6)
5. Monthly Trends (§1.7)

---

### 1.2 Summary Cards

**Locked (Revision 2, Decision 1): exactly four `StatCard`s, in a row above the Rankings, all all-time totals (no date filter — Design Principle 3):**

1. **Total Revenue** — sum of all `customer_purchases.sale_price`.
2. **Total Purchases** — count of all `customer_purchases` rows.
3. **Total Categories** — count of distinct categories present in Category Rankings (§1.4).
4. **Total Colors** — count of distinct colors present in Color Rankings (§1.5).

**Removed (Decision 1): Top Category, Top Color** — no longer shown as cards. Every figure here is already produced by a ranking/aggregate this document defines elsewhere — no new computation is introduced by the cards themselves.

---

### 1.3 Trend Charts (component definition)

**Locked (Revision 2, Decisions 3–4): a Line Chart, and only a Line Chart** — this codebase's first chart primitive (Design Principle 4):

- **Chart type:** Line Chart. No bar chart, no other chart type, anywhere in this module.
- **X-axis:** calendar month only (Spec §2.4–2.5, Decision 4) — no week/day granularity, no zoom into a sub-month range.
- **Y-axis:** the single metric being trended (a purchase count, or a revenue sum) for that chart — one line per metric.
- **Interaction:** hovering/tapping a month reveals its exact value (tooltip) — no other interaction.
- **No projection.** The line stops at the last month with real data — no forecast, trendline extrapolation, or projected future point (Spec: no prediction, anywhere).

**This document specifies only the Line Chart shape above — it does not choose a chart library, component, or rendering approach (Decision 4).** That choice is a Development-phase decision.

---

### 1.4 Category Rankings

Two ranked tables, per Spec §2.1, side by side (desktop) / stacked (mobile):

- **Purchase Count:** Danh mục | Số lượt mua — descending.
- **Revenue:** Danh mục | Doanh thu — descending.

Same table-card convention as Reports' breakdown tables (`REPORTS_UI.md` §1.4). All-time totals, no date filter (Design Principle 3).

---

### 1.5 Color Rankings

Same two-table shape as §1.4, per Spec §2.2 (Decision 6):

- **Purchase Count:** Màu sắc | Số lượt mua — descending.
- **Revenue:** Màu sắc | Doanh thu — descending.

Grouped by the literal stored `products.color` value — no normalization against the `product_color` master-data list (Spec §2.2).

---

### 1.6 Size Rankings

**One table only** (not a two-table pair like §1.4/§1.5), per Spec §2.3 (Decision 5 — Size has a single Purchase Count ranking, not a second Revenue ranking):

- **Purchase Count:** Kích thước | Số lượt mua — descending.

Grouped by the literal stored `products.size` value exactly as-is — no normalization, no bucketing, no master size table (Spec §2.3). Ring size and wrist size values are not combined onto a shared scale.

---

### 1.7 Monthly Trends

Two Line Charts (§1.3), per Spec §2.4–2.5, each bucketed by calendar month only:

- **Customer Buying Trends** (Spec §2.4) — one fixed aggregate line chart, purchase count and revenue across all customers, by month.
- **Product Demand Trends** (Spec §2.5) — one fixed aggregate line chart, purchase count across all products, by month. Demand is measured only by `customer_purchases` — never by `available`/`reserved`/`sold`, never by Orders (both banned, Spec §2 carried-forward bans).

Both charts render one fixed aggregate line each — **no selector/dropdown to view a trend for a specific customer, segment, category, or color.** Spec §2.4 names "per customer (or customer segment)" and §2.5 names "category/color/product" as possible grouping dimensions, but this review didn't ask for a selector control, so none is introduced (kept to the minimal reading, disclosed as a judgment call — see Self Review).

---

### 1.8 Empty State

Same muted-icon-plus-text convention already used across the app (Product/Batch/Inventory/Reports):

| Screen/element | Empty condition | Message (illustrative) |
|---|---|---|
| Any Ranking table | No purchases at all | "Chưa có dữ liệu" |
| Any Line Chart | No purchases in any month | "Chưa có dữ liệu giao dịch" |
| Summary Cards | No purchases yet | Cards still render showing "0," not hidden — same convention `StatCard` already follows |

---

### 1.9 Loading State

No skeleton loaders exist anywhere in this codebase, so Market Intelligence doesn't introduce one — same centered spinning indicator (`animate-spin`) already used by Product/Batch/Inventory/Reports, shown in place of a section's content while it loads.

---

### 1.10 Mobile Layout

- Summary Cards stack into a scrollable row or 2-column grid, same pattern `StatCard` usages elsewhere already follow.
- Category/Color Rankings: the Purchase Count and Revenue tables stack vertically (Purchase Count above Revenue) instead of side by side.
- Size Rankings: single full-width table, unchanged shape from desktop.
- Line Charts: full width, resized to the container (standard responsive line-chart behavior — width scales to the viewport, height fixed).

---

### 1.11 Desktop Layout

- Summary Cards in a single row.
- Category Rankings and Color Rankings: each renders its Purchase Count and Revenue tables side by side.
- Size Rankings: single full-width table.
- Monthly Trends: the two Line Charts stack vertically (Customer Buying Trends above Product Demand Trends), consistent with Reports' vertical section-stacking convention (`REPORTS_UI.md` §1.9) rather than placing them side by side.

---

### 1.12 Permissions (Read Only)

This codebase has no role-based access control anywhere (same confirmed precedent as `ORDERS_UI.md` §20, `INVENTORY_UI.md` §1.12, `REPORTS_UI.md` §1.10, `JADE_INTELLIGENCE_UI.md` §1.10). Market Intelligence doesn't introduce one either — "read only" here is a design constraint, not a permission system.

| Action | Available? |
|---|---|
| View Summary Cards / Category / Color / Size Rankings / Monthly Trends | Yes — any authenticated staff member |
| Hover/tap a Line Chart month for its value | Yes |
| Edit/create/delete any underlying record from this page | No — no control exposed anywhere in this module |
| Export any ranking or chart | No — no such control exists |
| View an Orders-based insight | No — none exist (Spec §3) |

---

### 1.13 Navigation Flow

```
Market Intelligence (/market-intelligence) — single page, vertical scroll, no tabs
├── Summary Cards (§1.2)
├── Category Rankings (§1.4) — Purchase Count + Revenue
├── Color Rankings (§1.5) — Purchase Count + Revenue
├── Size Rankings (§1.6) — Purchase Count only
└── Monthly Trends (§1.7) — Customer Buying Trends chart + Product Demand Trends chart
```

**Locked (Revision 2, Decision 5): the Sidebar must include a Market Intelligence entry.** Unlike Inventory/Orders, which had a pre-seeded disabled ("Sắp có") entry waiting to be flipped on, `components/Sidebar.tsx` has no Market Intelligence row today — this is a genuinely new entry, not a flip of an existing one. Proposed position: appended after the existing "Báo cáo" (Reports) entry and before "Cài đặt" (Settings), following the pattern of each new module being added at the end of the operational list, ahead of Settings — exact icon is a Development-phase detail. No outbound links to Product/Customer/Batch detail pages anywhere on this page — every Ranking and Trend is an aggregate, not row-level identity data.

---

## 2. Open Questions

None. Revision 1's five open questions are resolved by Decisions 1–5 above and are not carried forward.

---

UI Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
