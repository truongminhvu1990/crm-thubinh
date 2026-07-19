# Jade Intelligence Module — UI Design Spec

**Sprint:** 4
**Module:** Jade Intelligence (advisory recommendation module — "AI Jade" was working name only)
**Status:** Draft — Revision 2, Product Owner Review (PARTIAL PASS) applied — awaiting further Product Owner review.
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level design description only.
**Based on:** `docs/AI_JADE_SPEC.md` (Revision 2 — **LOCKED**). This document does not redesign, reinterpret, or add business logic or business rules. Every field, badge, and score below traces back to an already-approved section of that spec, cited inline as (Spec §N).

**Revision 2 changelog (this pass, Product Owner Review — PARTIAL PASS, 5 scoped decisions):**
1. **Recommendation Score Display — locked.** Numeric score + progress bar only. **No color bands.** Resolves former Open Question #1.
2. **Product Recommendation List — locked to a maximum of 6 products.** Resolves former Open Question #2.
3. **Tie-break — locked.** Sort by (1) Recommendation Score descending, then (2) Product Name ascending. Resolves former Open Question #3.
4. **Surface Area — locked to Customer Detail only.** Explicitly no Dashboard, no Products, no Reports, no Inventory surface. Resolves former Open Question #4.
5. **Purchase History Summary — locked to display-only: Total Purchases, Favorite Category, Favorite Color.** Resolves former Open Question #5 (no most-recent-purchase detail).

All five of Revision 1's Open Questions are resolved by the decisions above and removed — none remain.

---

## Design Principles

1. **Extend, don't replace.** Spec §1.2/§2.1 confirms reuse of `getMatchingProducts()` — this document designs the *evolution* of the existing "Sản phẩm phù hợp" card (`CustomerMatchingProducts.tsx`) into the fuller Recommendation Panel below, not a parallel/competing screen.
2. **Read-only, and visibly so.** No edit, create, delete, reserve, or contact-customer control appears anywhere in this design (Spec §4).
3. **Nothing here invents a business rule.** Every match type, score input, and gate maps to something Spec §2 already named. All Revision 1 presentation choices (score display, list cap, tie-break, surface area, Purchase History depth) are now locked by explicit Product Owner decision (Revision 2 changelog) — none were decided unilaterally.
4. **Consistency over novelty.** Reuses this codebase's established `Card`, `Badge`, `StatCard`, spinner, and empty-state conventions — no new UI primitive is introduced (unlike Inventory's Drawer).
5. **Purchase History Summary is new, and distinct from the existing transaction table.** `CustomerPurchaseHistory.tsx` (full CRUD: add/edit/delete a purchase) already exists on Customer Detail and is untouched by this design. The Purchase History Summary in §1.5 is a separate, read-only, condensed view built for recommendation context — it does not replace, duplicate, or modify that existing component.

---

## 1. UI Design

### 1.1 Recommendation Panel

The container for the whole module — the direct evolution of today's "Sản phẩm phù hợp" `Card` on Customer Detail (`app/customers/[id]/page.tsx`), same position in the page, same `Card` component. Internally it stacks four regions, top to bottom:

1. **Customer Preference Summary** (§1.4)
2. **Purchase History Summary** (§1.5)
3. **Product Recommendation List** (§1.3), each item showing its **Recommendation Score Display** (§1.2)
4. Empty/Loading state (§1.6/§1.7) covering the whole panel when nothing has loaded yet or no signal exists at all

One fetch, one panel — the three regions above are sections of a single card, not three separate cards, matching how the existing "Sản phẩm phù hợp" card is already a single self-contained unit today. Title stays **"Sản phẩm phù hợp"** (unchanged copy, since renaming isn't required by the spec) with the existing `Sparkles` icon.

---

### 1.2 Recommendation Score Display

Per Spec §2.4, every recommended product carries a 0–100 Recommendation Score. **Locked (Product Owner Review, Revision 2):** rendered per product card as exactly two elements, nothing more:
- The numeric score itself, e.g. **"80/100"**
- A simple horizontal filled progress bar beneath it, filled proportionally (`width: score%`)

**No color-coded band (e.g., green/amber/gray for "high/medium/low").** Confirmed, Revision 2 — the score is a plain visual proportion of the number, not a new threshold/tier rule.

Matched-signal badges (already existing pattern, `matchedOn` in `CustomerMatchingProducts.tsx`) continue to render alongside the score, one per matched rule from Spec §2.1/§2.2 (Type/Color/Size/Budget/Purchase History) — the score and the badges are two views of the same underlying match count, not two separate computations.

---

### 1.3 Product Recommendation List

Grid of product cards, same 2-column (desktop) / 1-column (mobile) layout `CustomerMatchingProducts.tsx` already uses: cover image (or placeholder), product name, category + color, price, matched-signal badges, and the Recommendation Score Display (§1.2).

**Sort order, locked (Product Owner Review, Revision 2):**
1. Recommendation Score, descending
2. Product Name, ascending (tie-break)

Only products that pass the Inventory gate (Spec §2.3: `status = 'Active'`, treated as equivalent to "In Stock") ever appear.

**Cap, locked (Revision 2): maximum 6 products** — matches the existing `getMatchingProducts(customer, limit = 6)` default, confirmed unchanged even with Purchase History (Spec §2.2) as a new signal.

Clicking a card navigates to that product's existing (LOCKED) Product Detail page (`/products/[id]`) — same behavior as today, no new destination introduced.

---

### 1.4 Customer Preference Summary

A compact row of labeled values, directly above the Product Recommendation List, showing **only** the four fields Spec §2.1 actually matches on:
- **Loại** (Type) — `customer.favorite_type`
- **Màu sắc** (Color) — `customer.favorite_color`
- **Size** — `customer.wrist_size` / `customer.ring_size` (both shown if both are set, same as the existing Wishlist card's two separate rows)
- **Ngân sách** (Budget) — `customer.budget`

Rendered as small icon+label pairs or chips, same visual language as the existing "Wishlist" card (`CustomerJadePreferences.tsx`) but intentionally narrower — **`preferred_origin` and `purpose` are not shown here**, since Spec §2 removed Origin matching and Purpose was never matchable (Spec §2.2 in Revision 1, since deleted). The existing, broader Wishlist card is untouched and keeps showing all wishlist fields (including Origin/Purpose) in its own separate location on Customer Detail — this summary is scoped strictly to *what the recommendation engine actually reads*, not a duplicate of the Wishlist card.

If none of the four fields are set, this region shows a single muted inline line (e.g., "Chưa có thông tin sở thích") instead of an empty row of labels — the panel doesn't block on this alone if Purchase History (§1.5) has data.

---

### 1.5 Purchase History Summary

A compact, **read-only** rollup directly above the Product Recommendation List (below Customer Preference Summary), summarizing what Spec §2.2's Purchase History rule is actually drawing on — not a transaction list, not editable, and not the same component as the existing `CustomerPurchaseHistory.tsx` table elsewhere on the page.

**Locked, exactly three fields (Product Owner Review, Revision 2), display-only:**
- **Total Purchases** — purchase count, from `getPurchasesByCustomer(customer.id).length`
- **Favorite Category** — the category that recurs most often across those purchases
- **Favorite Color** — the color that recurs most often across those purchases

These are the same two signals (category, color) Spec §2.2 uses to find "similar" products, surfaced here so staff can see *why* a purchase-history-based recommendation appeared. **No most-recent-purchase detail or transaction-level listing** — confirmed out, Revision 2, to avoid overlapping with the existing `CustomerPurchaseHistory.tsx` table.

If the customer has no purchase history, this region shows a single muted inline line (e.g., "Chưa có lịch sử mua hàng") — same non-blocking behavior as §1.4, since Customer Preference alone can still drive recommendations.

---

### 1.6 Empty State

| Condition | Behavior |
|---|---|
| No wishlist data **and** no purchase history at all | Whole panel shows one centered muted message (e.g., "Thêm sở thích hoặc lịch sử mua hàng của khách để xem gợi ý sản phẩm phù hợp"), same pattern as today's zero-signal state — Customer Preference Summary and Purchase History Summary are not shown separately in this case, matching current `hasWishlist` behavior extended to also check purchase history. |
| Some signal exists (wishlist and/or purchase history), but zero `Active`/in-stock products match | Customer Preference Summary and/or Purchase History Summary still render (they reflect input, not output); Product Recommendation List area shows its own muted message (e.g., "Chưa có sản phẩm đang bán khớp với khách hàng này") — same as today's "matches.length === 0" case. |
| Wishlist empty but purchase history has data (or vice versa) | The empty one shows its own inline muted line (§1.4/§1.5); the other summary and the recommendation list render normally. |

Same muted-icon-plus-text visual convention already used across the app (Product/Batch/Inventory/Reports).

---

### 1.7 Loading State

Single centered spinner (`animate-spin`, same treatment `CustomerMatchingProducts.tsx` already uses) for the whole panel while the combined fetch (customer preference fields already in-memory, plus `getPurchasesByCustomer` and the matching query) resolves — no per-region skeleton, consistent with this codebase having no skeleton-loader pattern anywhere.

---

### 1.8 Mobile Layout

- Recommendation Panel stays a single full-width `Card`, same stacking order as desktop (§1.9), just narrower.
- Customer Preference Summary and Purchase History Summary rows wrap to multiple lines / stack vertically instead of one row, same responsive behavior the existing Wishlist card's `grid-cols-2` already falls back to.
- Product Recommendation List drops to a single column (`grid-cols-1`), same breakpoint behavior `CustomerMatchingProducts.tsx` already has (`sm:grid-cols-2` → 1 column below `sm`).
- Recommendation Score Display (number + bar) stays inline within each card, no layout change needed at narrow widths.

---

### 1.9 Desktop Layout

- Recommendation Panel renders in its existing position within Customer Detail's two-column layout (left column, `lg:col-span-2`, stacked after the existing Wishlist card — see §1.11).
- Customer Preference Summary: single row of icon+label pairs, wrapping only if the customer has enough fields set to overflow.
- Purchase History Summary: single compact line/row directly beneath it.
- Product Recommendation List: 2-column grid (`sm:grid-cols-2`), same as today.

---

### 1.10 Permissions (Read Only)

This codebase has no role-based access control anywhere (same confirmed precedent as `ORDERS_UI.md` §20, `INVENTORY_UI.md` §1.12, `REPORTS_UI.md` §1.10). Jade Intelligence doesn't introduce one either — "read only" here is a design constraint (no write-capable control exists), not a permission system.

| Action | Available? |
|---|---|
| View Recommendation Panel (Customer Preference Summary, Purchase History Summary, Product Recommendation List) | Yes — any authenticated staff member, on any customer's own Detail page |
| Click a recommended product → Product Detail | Yes — navigates to the existing (LOCKED) Product Detail page |
| Add/edit/delete a purchase from this panel | **No** — that action only exists on the separate, existing `CustomerPurchaseHistory.tsx` table, untouched by this module |
| Edit a customer's wishlist fields from this panel | **No** — that action only exists on the Customer edit form, untouched by this module |
| Contact/message the customer from this panel | **No** — no such control exists anywhere in this design (Spec §4) |

---

### 1.11 Navigation Flow

```
Customer Detail (/customers/[id])
├── Notes Timeline (existing)
├── Purchase History table (existing, full CRUD — CustomerPurchaseHistory.tsx, unchanged)
├── Wishlist card (existing, full field set — CustomerJadePreferences.tsx, unchanged)
└── Recommendation Panel (this module)
    ├── Customer Preference Summary (§1.4) — read-only subset of Wishlist, no outbound link
    ├── Purchase History Summary (§1.5) — read-only rollup, no outbound link
    └── Product Recommendation List (§1.3) → click a card → Product Detail (/products/[id], existing, LOCKED)
```

**Surface Area — locked (Product Owner Review, Revision 2): Customer Detail only.** Explicitly confirmed out: no Dashboard entry, no Products surface (no "customers who might want this" reverse view on Product Detail), no Reports surface, no Inventory surface. Jade Intelligence lives exclusively inside the Recommendation Panel on Customer Detail — nowhere else in the app.

No breadcrumb changes — Jade Intelligence doesn't add a route, only extends an existing page section.

---

## 2. Open Questions

None. All five of Revision 1's open questions (score presentation, list cap, tie-break, surface area, Purchase History Summary depth) are resolved by the Revision 2 decisions above and are not carried forward.

---

UI Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
