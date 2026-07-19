# Inventory Module — UI Design Spec (Phase 1: Read Only)

**Sprint:** 2
**Module:** Inventory — Phase 1 (Read Only)
**Status:** Draft — Revision 3, Product Owner Review applied — awaiting further Product Owner review.
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level business description only.
**Based on:** `docs/INVENTORY_SPEC.md` (Revision 2 — **LOCKED**). This document does not redesign, reinterpret, or add business logic or business rules. Every field, section, and label below traces back to an already-approved section of that spec, cited inline as (Spec §N). Where this document reuses an existing screen pattern (filter bar, table, stat card, empty/loading state), it points at the equivalent already-shipped Customer/Product/Batch screen in this codebase rather than inventing a new one, with one named exception (§1.6).

**Revision 3 changelog (this pass, Product Owner Review):**
1. **Product Detail (§1.6)** — locked to Drawer only. Never a route, never opens the Product Module. Removed the "view full detail" link-out to `/products/[id]`.
2. **Statistics Cards (§1.4)** — clarified "By Status" is `COUNT(*) GROUP BY products.status`; reaffirmed it never references `available`/`reserved`/`sold`.
3. **Batch View (§1.5)** — locked to a flat Batch → Product List drill path only. Removed the Product/Sold/Remaining count columns (summary aggregates) and the "Batch Detail sub-view vs. link out" open question — clicking a batch always filters Inventory List to that batch. No dashboard, no summary panel, no charts anywhere in Batch View.
4. **Navigation (§2)** — locked to exactly two pages under Inventory (Inventory List, Batch View); the Drawer is confirmed as an overlay, never a page/route.

Everything else from Revision 2 not touched by the four items above remains intact (Design Principles, Search Bar, Filter Panel, Image Gallery, Empty/Loading States, Mobile/Desktop Layout, Permissions). Document structure and section order are unchanged. Nothing in this revision has been implemented — still UI design only.

## Design Principles

1. **Read-only, and visibly so.** No edit, delete, reserve, sell, or Orders-related control appears anywhere in this design — not disabled-and-grayed-out, but simply absent. A disabled button still visually promises a future action; this module doesn't have one (Spec: Explicitly Out of Scope).
2. **Consistency over novelty.** Reuses the same page-header + filter-bar-card + table-card layout already established by Customer/Product/Batch. Table rows, badges, currency formatting, empty/loading states all reuse existing components (`Badge`, `Card`, `StatCard`, `SearchInput`) rather than introducing new ones.
3. **Status is the only stock signal.** Every screen that implies "in stock" reads it off `products.status`, never `available`/`reserved`/`sold` (Spec §1, §2) — those three fields are never fetched, displayed, or referenced anywhere in this UI.
4. **Nothing invents new fields, filters, or statistics.** Every filter option, table column, drawer field, and stat card below maps to a field or metric already named in `INVENTORY_SPEC.md`. Where this document proposes copy/wording, it is presentation of an already-approved field — not a new one.
5. **Batch and Product remain the system of record.** This UI reads Batch/Product data; it never links to an edit action on either, and per module ownership, does not modify the existing (LOCKED) Batch/Product screens themselves.

---

## 1. UI Specification

### 1.1 Inventory List

Route: `/inventory` (Sidebar's existing "Tồn kho" entry — `Boxes` icon, currently `enabled: false`/"Sắp có" — flips to enabled, same position between "Lô hàng" and "Đơn hàng").

**Layout, top to bottom:** page header ("Tồn kho" title + count line, "N sản phẩm · Hiển thị M" — same convention as Product List) → Statistics Cards (§1.4) → filter bar card containing Search Bar (§1.2) + Filter Panel (§1.3) → product table.

**Table columns** (Spec §2, read-only subset relevant to a list view): thumbnail (cover image, §1.7), Product name + code, Category, Status badge, Batch (plain text or link — read-only either way, see §3), Location, Price (`sale_price`).

No "Tồn kho" available/reserved/sold column — that column, present on the existing `ProductTable.tsx`, is replaced entirely by the Status badge (Spec §1/§2). No row-level Edit/Delete icons (unlike `ProductTable.tsx`'s `Edit2`/`Trash2` buttons) — Inventory List has no write affordance at all.

Clicking a row opens the **Product Detail Drawer** (§1.6) as an overlay, rather than navigating to a route — a deliberate difference from Product List, which navigates to `/products/[id]`. Inventory doesn't own product editing, so it doesn't need a routed detail page; a drawer keeps staff inside the list.

Default sort: newest-created first, matching `getProducts()`'s existing default order — no new sort rule introduced, Spec doesn't call for one.

---

### 1.2 Search Bar

Single input, same `SearchInput` component and placement as Product List's filter bar (flex-1, left side). Matches product code, SKU, product name, and certificate number (Spec §3). Placeholder: *"Tìm theo tên, mã, SKU hoặc số chứng nhận..."*. The existing "×" clear affordance resets to the unfiltered list. Combines with the Filter Panel (§1.3) using AND logic, same convention as Product List.

Batch search is **not** part of this box — it lives with Batch View (§1.5) if approved, since whether Inventory should add batch search at all is still an open question (Spec Open Question #4).

---

### 1.3 Filter Panel

Row of dropdowns beside the search box, same card/style as Product List's filter row (`select` elements, fixed width on desktop, stacking full-width on mobile). Candidate filters, per Spec §4:

- **Category** — from `product_category` master data
- **Status** — from `PRODUCT_STATUS` (Active / Paused / Sold / Discontinued / Returned)
- **Batch** — populated the same way Product form's batch dropdown already is (`useBatchOptions()`)
- **Location** — free-text field on Product
- **"No batch assigned"** — a checkbox/toggle filter (`batch_id IS NULL`) — the first place this filter appears anywhere in the app (Spec §4, flagged gap)

All filters combine with each other and with search using AND logic, defaulting to "All"/unfiltered, matching Product List. A "Làm mới" (Refresh) button sits beside the filters, same icon/placement/behavior as Product List's. No filter here introduces a new field.

Which subset of these five ships in Phase 1's first cut is still open (Spec Open Question #3) — this document designs for all five as candidates, not as a final decision.

---

### 1.4 Statistics Cards

Uses the existing `StatCard` component in a responsive card row above the filter bar. Exactly six cards, matching Spec §8's locked list — no more, no fewer:

1. **Total Products**
2. **By Status** — Status Distribution: `COUNT(*) GROUP BY products.status`. Reads `status` only — **never** `available`, `reserved`, or `sold` (Spec §1, reaffirmed here for this card specifically since it's the one most likely to be confused with the banned counters).
3. **By Origin**
4. **By Category**
5. **By Batch**
6. **By Sales Owner**

No card shows a value, revenue, or cost figure (Spec §8) — every number is a count. Cards 2–6 are breakdowns of a dimension with multiple possible values (e.g. 5 statuses, N batches) rather than a single number like Card 1 — exact presentation (one `StatCard` per value vs. one card with an inline mini-breakdown) is an open question below, since a naive "one card per batch" approach doesn't scale as batch count grows.

---

### 1.5 Batch View

A dedicated read-only batch table within Inventory — same table-card pattern as the existing (LOCKED) Batch List, with one deliberate difference: **no Revenue column, and `other_cost` is never shown** (Spec §5).

**Columns:** Batch code, Supplier, Received date, Return-due date (same overdue visual flag `BatchTable.tsx` already uses — destructive-colored text + warning icon when overdue), Status badge. **No count columns** (Product/Sold/Remaining) — those are aggregate summary numbers, and Batch View carries no dashboard, summary panel, or chart of any kind (Product Owner Review, Revision 3). Batch View is a plain list of batch identity/status fields, nothing computed.

No Edit/Delete icons (unlike the existing, LOCKED `BatchTable.tsx`) — Batch View is read-only, full stop. A search input above the table (same `SearchInput` component, matching batch code/supplier) is proposed here if Spec Open Question #4 is approved, since the existing Batch List has no search at all today.

**Row click behavior (locked, Revision 3): clicking a batch always shows Inventory List (§1.1) filtered to that batch's products** — the same product table Inventory List already renders, with the Batch filter (§1.3) pre-set to the clicked batch. There is no separate Batch Detail sub-view and no link out to the existing `/batches/[id]` page — Batch View's only job is Batch → Product List.

---

### 1.6 Product Detail Drawer

A right-side sliding panel (not the centered `Modal`/Radix Dialog pattern used everywhere else in this codebase — this is a new UI primitive, flagged in §3) that opens when a product row (§1.1, or a product inside Batch View) is clicked, without navigating away from the underlying list.

**Contents — exactly the locked field list, no more, no fewer (Spec §6):**
- **Images** — cover image + full gallery (§1.7)
- **Batch** — batch code, read-only text
- **Source** — `products.source`
- **Sales Owner** — `products.salesperson`
- **Status** — badge, same `Badge`/status-color treatment `ProductTable.tsx` already uses
- **Price** — see §3 (Spec leaves open whether this is `sale_price` only or also `cost_price`)
- **Created At** — `products.created_at`, formatted the same way `formatDate()` already formats dates elsewhere

**No Orders history section** anywhere in the drawer (Spec §6, explicit). No Edit button, no Delete button, no Reserve/Sell action, no link into any Order screen. **The Drawer is the only product-detail surface Inventory ever shows (locked, Revision 3): always a Drawer, never a route, and it never opens the Product Module's own Detail page** — no "view full detail" link out. The Drawer's only interactive element beyond its content is its close control (×, click-outside, Esc).

---

### 1.7 Image Gallery

Read-only presentation of `product_images`, respecting existing `sort_order` (cover = lowest `sort_order`, the same rule `coverImageUrl()` already implements). Two contexts:

- **Inventory List row** (§1.1): single thumbnail (cover image only) — same treatment `ProductTable.tsx` gives, falling back to the muted `ImageOff` placeholder when a product has no images.
- **Product Detail Drawer** (§1.6): full image set as a thumbnail strip/small carousel, optionally enlargeable (lightbox-style) on click.

No Add/Edit/Delete/Reorder control anywhere — that CRUD stays entirely in the Product module's own `ProductImageManager`, which Inventory never touches (Spec §7).

---

### 1.8 Empty State

Same pattern as every other list screen in this codebase (`ProductTable.tsx`/`BatchTable.tsx`): a muted circular icon, one line of muted explanatory text, centered inside the card that would otherwise hold rows.

| Screen/section | Empty condition | Message (illustrative) |
|---|---|---|
| Inventory List | No products exist, or search/filters match nothing | "Chưa có sản phẩm nào" / "Không tìm thấy sản phẩm phù hợp" |
| Batch View | No batches exist, or search matches nothing | "Chưa có lô hàng nào" / "Không tìm thấy lô hàng phù hợp" |
| Product Detail Drawer — Image Gallery | Product has no images | Same muted `ImageOff` placeholder used elsewhere, scaled up for the drawer |
| Statistics Cards | No products exist yet | Cards still render showing "0" — not hidden — same as `StatCard`'s existing zero-value handling |

---

### 1.9 Loading State

Matches the existing app-wide pattern exactly — no skeleton loaders exist anywhere in this codebase, so Inventory doesn't introduce one.

- **Full-page/section loads** (Inventory List, Batch View, Statistics fetch): centered spinning indicator in place of content, same `animate-spin` treatment `ProductTable.tsx`/`BatchTable.tsx` already use.
- **Product Detail Drawer open:** the drawer slides in immediately; content populates once ready, with a brief inline spinner if data isn't already available from the list fetch.
- **Refresh action:** same "Làm mới" button + spinner-in-place behavior already used on Product/Batch List.

---

### 1.10 Mobile Layout

Follows the exact responsive behavior already shipped for Customer/Product/Batch — no new responsive pattern introduced, aside from the drawer noted below.

- **Navigation:** sidebar collapses to the existing hamburger-triggered slide-in drawer below the desktop breakpoint — "Tồn kho" behaves identically to every other nav entry once enabled.
- **Statistics Cards:** stack into a scrollable row or 2-column grid on narrow screens, same responsive grid behavior `StatCard` usages elsewhere already follow.
- **Search Bar + Filter Panel:** stack into a single column, same `flex-col` → `flex-row` breakpoint Product/Batch's filter bar already uses.
- **Inventory List / Batch View tables:** scroll horizontally within their own card, same as Product/Batch tables today (this codebase has no card-list mobile table pattern, so Inventory doesn't introduce one).
- **Product Detail Drawer:** becomes full-screen on mobile (slides in from the right, covers the full viewport) rather than a partial-width side panel — the one deliberate mobile-specific adaptation in this design.

---

### 1.11 Desktop Layout

- **Inventory List:** Statistics Cards in a single row (wrapping to a second row at narrower desktop widths); filter bar in one row (search flex-grow, dropdowns fixed-width, Refresh right-aligned) — identical row composition to Product List's filter bar.
- **Tables:** full column set visible at desktop width, no horizontal scroll under normal viewport widths, matching Product/Batch Table's `min-width` behavior.
- **Product Detail Drawer:** fixed-width side panel (comparable to the existing `Modal`'s `max-w-lg` sizing), overlaying the right portion of the screen while the list remains visible (dimmed) behind it.
- **Batch View:** same single-column, full-width table-card layout as Batch List itself.

---

### 1.12 Permissions (Read Only)

This codebase has no role-based access control today (every existing module — Customer, Product, Batch, Orders — is fully readable/writable by any authenticated staff member; no roles/permissions concept exists anywhere in login/session, confirmed in `ORDERS_UI.md` §20). Inventory Phase 1 does not introduce one either — "READ ONLY" here is not a permission-system concept, it is a design constraint: **no write-capable control exists anywhere in this UI**, regardless of who is logged in.

| Action | Available in Phase 1? |
|---|---|
| View Inventory List / Statistics / Batch View / Product Detail Drawer | Yes — any authenticated staff member |
| Search / Filter | Yes |
| Edit a product | **No** — no button, no link, no route exposed from Inventory (editing still exists, but only from the Product module itself) |
| Delete a product or batch | **No** — no button, no link, exposed from Inventory anywhere |
| Reserve / Sell / Release | **No** — these concepts don't exist in Phase 1 at all (Spec: Explicitly Out of Scope) |
| View Orders / order history for a product | **No** — Orders is blocked and out of scope (Spec §1, §6) |
| Adjust inventory counts | **No** — `available`/`reserved`/`sold` are never read or written (Spec §1) |

This flat "everything read, nothing written" matrix is the entire Phase 1 permission model.

---

## 2. Navigation Flow

**Locked structure (Product Owner Review, Revision 3):**

```
Inventory
├── Inventory List
└── Batch View
```

The Drawer is **not** a page — it is an overlay state on top of whichever of the two pages above is currently showing, never a third node in this tree and never a route of its own.

- The Sidebar already reserves the **"Tồn kho"** nav entry (`Boxes` icon, currently `enabled: false`). Shipping Inventory Phase 1 means flipping it to enabled, in the same position it already occupies (between "Lô hàng" and "Đơn hàng") — no reordering of the existing nav list.
- Selecting "Tồn kho" lands on **Inventory List** (§1.1).
- **Inventory List** and **Batch View** (§1.5) are the only two pages in the module, presented together under `/inventory` as an in-page tab/toggle ("Sản phẩm" / "Lô hàng").
- Clicking a batch in **Batch View** switches to **Inventory List**, filtered to that batch's products (§1.5) — this is the tree's only edge between the two pages; there is no third "Batch Detail" page.
- Clicking a product row, in either page, opens the **Product Detail Drawer** (§1.6) as an overlay — the underlying page stays exactly where it was underneath. **The Drawer always opens as a Drawer, never as a route, and never opens the Product Module's own Detail page** (§1.6).
- **No path in this navigation flow ever reaches Order Detail, Create Order, or any Orders screen** — Orders is blocked and entirely absent from Inventory's navigation graph (Spec §1).
- No breadcrumb is needed — the two pages sit at the same level with an overlay drawer, not a routed drill-down hierarchy requiring back-navigation (unlike Order Detail/Customer Detail).

---

## 3. Open Questions

1. **Product Detail Drawer is a new UI primitive.** This codebase has no drawer/sheet component today — every existing detail/edit surface is either a routed page or the centered `Modal` (Radix Dialog). A drawer means introducing a new component pattern, unlike everything else in this design, which reuses what already exists. Flagging this before Development begins, since the task explicitly named "Product Detail Drawer" — confirming that's intentional avoids rework.
2. **Drawer "Price" field:** still unresolved per Spec Open Question #5 — `sale_price` only, or both `cost_price`/`sale_price`?
3. **Statistics Cards presentation:** Spec §8 locks the six breakdowns as a list but doesn't say how "By Status" / "By Category" / "By Batch" / "By Sales Owner" render — one `StatCard` per value (doesn't scale well for "By Batch" as batch count grows) vs. one card per dimension with an inline mini-breakdown/top-N. Not decided here.
4. **Statistics scope:** do the six stat cards always reflect the full unfiltered product set, or recompute against the currently active Search/Filter selection (§1.2/§1.3)? Both patterns exist elsewhere in this codebase; Spec doesn't say.
5. **Filter set finalization:** which of category/status/batch/location/"no batch assigned" ships in Phase 1's first cut? (Spec Open Question #3, still open — this document designs for all five as candidates.)
6. **Batch search:** should Inventory add batch search at all, given the existing Batch List has none today? (Spec Open Question #4, still open — this document proposes where it would live, §1.5, without deciding whether it should exist.)

---

UI Design only. No code written. No database changes. Stopping — waiting for Product Owner Review.
