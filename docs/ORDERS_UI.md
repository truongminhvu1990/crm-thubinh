# Orders Module — UI/UX Design

**Sprint:** 1 — Phase 3
**Module:** Orders V1
**Status:** Draft — Final Product Review, awaiting Product Owner UI Design approval (per `PROJECT_MANIFEST.md`'s workflow: Business Design → Product Review → Database Design → Product Review → **UI Design** → Product Review → Development).
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level business description only.
**Based on:** `docs/ORDERS_SPEC.md` (Revision 5, Final Product Review — approved and locked) and `docs/ORDERS_DATABASE.md` (approved and locked). This document does not redesign, reinterpret, or add business logic. Every screen, field, action, and status below traces back to an already-approved section of those two documents, cited inline as (Spec §N) / (DB §N). Where this document references an existing screen pattern (filter bar, table, modal, badge, empty state), it points at the equivalent already-shipped Customer/Product/Settings screen in this codebase rather than inventing a new one — Orders should look and behave like a module that already belongs in this CRM, not a bolt-on.

**Final Product Review changelog (this pass):**
1. Added **Quick View** — a row-level eye icon on Order List that opens a read-only summary popup, with no editing of any kind (§3).
2. Added an explicit auto-refresh rule: after Order Save or Order Complete, Dashboard, Customer Purchase History, and Reports must refresh automatically — no manual refresh anywhere (§1, §4, §6).
3. Renamed **Customer Detail → Order History** to **Customer Detail → Purchase History** — kept under its existing "Lịch sử mua hàng" label rather than a new name — and redefined its rows to one-per-Order-Item: Order Number, Product, Price, Payment Status, Order Status, Date, each row linking to Order Detail (§2, §18).

---

## 1. Design Principles

1. **Consistency over novelty.** Orders reuses the exact visual and interaction language already established by Customer, Product, and Settings: a page header with a title + count line, a filter bar card directly beneath it, a bordered/rounded table card below that, and modals for focused single-purpose actions. No new layout primitive is introduced for Orders.
2. **Status is always visible, never inferred.** Because Order Status and Payment Status are explicitly independent (Spec §14), every screen that shows an order shows both statuses as separate, clearly labeled badges — never merged into one combined label, and never one implied from the other.
3. **Money is always legible.** Every currency amount (unit price, discount, line total, subtotal, total, payments, remaining balance) is formatted the same way, consistently, everywhere it appears — matching the `vi-VN` VND currency formatting already used on Customer Purchase History and Product screens.
4. **Locked means locked, visibly.** Once an order is `Completed`, price/discount fields render as read-only text, not disabled input boxes — a disabled input still looks editable; read-only text signals "this is history now" (Spec §4, §5).
5. **Sales Owner is visually senior to Created By.** Per the risk explicitly flagged in Spec §17, Created By must never be styled or positioned in a way that invites confusion with Sales Owner — Created By always appears smaller, secondary, and non-interactive (Spec §6, §13).
6. **Nothing invents new fields, statuses, or actions.** Every label, filter, badge, and button described below maps to a field or rule already named in `ORDERS_SPEC.md` or `ORDERS_DATABASE.md`. Where this document proposes copy/wording, it is presentation of an already-approved field — not a new field.
7. **Revenue Recognition is never silently implied.** Nowhere in this UI does "Completed" alone visually read as "money received" — see §9 (Order Timeline) and §6 (Order Detail) for how a Completed-but-unpaid order stays visually distinct from a Completed-and-Paid one.
8. **Small, calm, and fast for counter use.** Staff use this at a sales counter with a customer standing in front of them — Create Order in particular favors large tap targets, minimal typing, and live-computed totals over dense data entry.
9. **Downstream views refresh themselves — never a manual step.** The moment an order is saved or completed, Dashboard, Customer Purchase History (§2), and Reports must update on their own; no screen anywhere in the app requires staff to click "Làm mới" to see the effect of that action (§4, §6).

---

## 2. Navigation

- The sidebar already reserves a nav entry for Orders — **"Đơn hàng"** with a receipt icon, currently shown in the disabled/"Sắp có" (Coming soon) state alongside Inventory. Shipping Orders V1 means flipping this entry to enabled, in the same position it already occupies (between Batch/"Lô hàng" and Reports/"Báo cáo") — no reordering of the existing nav list.
- Selecting "Đơn hàng" lands on **Order List** (§3) — the same top-level-list-then-detail pattern already used by Customer and Product.
- Order Detail (§6) is reached only by drilling in from Order List, from a row in Customer Detail's **Purchase History** (see below), or from Product Detail's own purchase/order history (mirroring how Product Detail already reverse-links from `customer_purchases` today).
- Breadcrumb-equivalent: a "Quay lại" (Back) link at the top of Order Detail and Create Order, identical in placement and behavior to the one already on Customer Detail — browser-back-equivalent, not a multi-level breadcrumb trail (this codebase doesn't use breadcrumbs anywhere else, so Orders doesn't introduce one).
- Order Detail links out to Customer Detail (customer name, Spec §13) and to Product Detail (each line item's product name, Spec §13) — both using the same inline text-link pattern Customer Purchase History already uses for its product links.

### Customer Detail — Purchase History

Kept under its existing label — **"Lịch sử mua hàng" (Purchase History)** — the same heading Customer Detail's purchase section already carries today; this is a data-source and column change underneath that familiar name, not a rename to "Order History."

- **One row per Order Item** (not grouped by Order) — columns: **Order Number, Product, Price, Payment Status, Order Status, Date**.
- Product renders as a link to Product Detail, same as it already does today; **the row itself links to Order Detail** (not to any per-item page) — clicking the row anywhere outside the Product link opens the parent Order.
- Price is the line's Snapshot Sale Price (Spec §9) — read-only here, same as every other price display in this design.
- Payment Status and Order Status render as the same two separate badges used throughout Orders (§1 Design Principle 2) — never merged into one.
- Sorted newest first, same convention as Order List's default sort (§14).
- Empty state, loading state, and currency formatting all follow §18/§19/§1 exactly as they do for every other Orders table — no separate convention introduced here.

---

## 3. Order List

Route-level list screen, structurally identical to Customer List / Product List.

**Header row:** "Đơn hàng" title, a count line ("N đơn hàng · Hiển thị M"), and a "Tạo đơn hàng" (Create Order) primary button top-right — same placement convention as "Thêm khách" / "Thêm sản phẩm" (Spec §13).

**Filter bar card** (directly under the header, same card treatment as Customer/Product): search input + a row of filter dropdowns + a refresh button + the Create Order button. Full filter/search breakdown in §12–§14.

**Table columns** (Spec §13, verbatim): Order Number, Customer name, Date, Item count, Total amount, Payment status badge, Order status badge, Sales Owner.

- Order Number is the primary clickable cell (styled as the row's link, same weight Customer Table gives customer name) — clicking any part of the row opens Order Detail, consistent with existing tables.
- Customer name is a secondary link that jumps straight to Customer Detail without going through Order Detail — a deliberate shortcut, mirroring the product link already inside Customer Purchase History.
- Item count reads as "N sản phẩm" (or "1 sản phẩm" singular-safe).
- Total amount right-aligned, VND-formatted, matching every other currency column in this codebase.
- Payment status badge and Order status badge are two separate badges, never combined (Design Principle 2) — colors defined in §9.
- Sales Owner renders as plain text (it's a master-data value, not a link).
- No row-level Edit/Delete icon buttons — unlike Customer/Product, Orders has no "delete" concept at all (DB §7: an order is abandoned via Lost, never deleted) and no quick-edit-from-list affordance; all editing happens inside Order Detail (§5).

### Quick View (row-level)

- Each row also gets a small eye icon action, alongside the row's normal click-to-open-Order-Detail behavior — a lighter-weight alternative for staff who just want a fast look without leaving the list.
- Clicking the eye icon opens a **read-only summary popup** (same modal weight/pattern as Add Payment, §7) — never a route change, so the underlying Order List stays exactly where it was.
- Popup contents: Order Number, Customer name, Order Status badge, Payment Status badge, Sales Owner, Order date, item count, Total amount, and Lost Reason (only when Lost) — the same header-level facts already shown on Order Detail (§6), condensed into one glanceable card.
- **No editing of any kind is available from this popup** — no Add payment, no Complete, no Mark as Lost, no price editing, no Reassign Sales Owner. Its only action is a "Xem chi tiết đầy đủ" (View full detail) link that navigates to the real Order Detail (§6) for anything beyond looking.

---

## 4. Create Order

A dedicated route/screen (not a modal — too much content for a modal, unlike Customer/Product's add forms), implementing the 4-step flow already defined in Spec §2/§13. Presented as a **single scrolling screen with four labeled sections in fixed order**, not a multi-page wizard — every section stays visible and revisitable while the order is still Draft, since staff frequently go back and forth between selecting products and confirming prices at a real counter.

**Step 1 — Customer.** Reuses the existing customer search/picker pattern verbatim (Spec §2: "same picker pattern as the rest of the CRM; no new-customer shortcut needed"). Sales Owner field sits right beside it, pre-filled to the current staff member (= Created By), editable immediately (Spec §2, §6).

**Step 2 — Select products.** A searchable/filterable picker over **available** inventory only (Product status = available and not already attached to another open order, per Spec §2, §7) — same search-plus-category/market/batch-filter pattern as Product List, scoped down to Available items. Selecting a product adds it to a running cart list beneath the picker and **immediately** reserves it (§11 — Product Reservation Flow). Each cart row shows a remove ("×") action that releases the reservation.

**Step 3 — Confirm prices.** For each cart line: the Product's own `sale_price`/`discount` shown as a pre-filled *suggestion* (visually labeled "giá đề xuất" / suggested price, per Spec §2's "pre-fill... as a suggestion only"), with an editable unit price and discount (amount or %) beside it. Per line: Is Gift toggle (revealing Gift Recipient Name / Gift Note when on, Spec §11), and a Packaging Option dropdown defaulted to Settings' configured default (Spec §12). A running Subtotal / Discount total / Total amount summary recomputes live as any line changes (Spec §2).

**Step 4 — Payment.** Optional at creation time — staff can add one or more payments here (§7) or skip entirely and save as `Reserved`/`Unpaid` to collect payment later (Spec §2, §13).

**Save behavior:** a single "Lưu đơn hàng" (Save Order) action persists the order as `Draft` or `Reserved`. **"Hoàn thành" (Complete) is a visually separate, distinctly-styled action, never implied by Save** (Spec §13: "'Complete' is a separate explicit action, not implied by saving") — it only appears once the order already exists (i.e., after the first save), consistent with Order Detail's own Complete action (§6). This means Create Order's primary button is always "Lưu đơn hàng," never "Hoàn thành," even on the last step. Saving also triggers the auto-refresh rule (§1): Dashboard, Customer Purchase History, and Reports pick up the new order without staff needing to reload or click refresh anywhere.

---

## 5. Edit Order

There is **no separate "Edit Order" screen or route** — per Spec §13, editing happens directly on Order Detail (§6), scoped by Order Status, and this document does not introduce a new screen the spec never defined. "Edit Order" describes a **mode of Order Detail**, available only while the order is `Draft` or `Reserved` (Spec §4):

- **Edit prices** — unit price and discount become editable inline on the line-items table (Spec §4, §13); Line Total recomputes live; order-level Subtotal/Discount total/Total amount recompute live.
- **Add/remove products** — the same "Select products" picker from Create Order (§4) reopens from Order Detail; adding reserves a new Product (§11), removing releases one back to `available` and logs a "Product Removed" event (Spec §8, DB §4).
- **Edit gift/packaging per line** — Is Gift, Gift Recipient Name, Gift Note, Packaging Option remain editable per line, same controls as Create Order Step 3.
- **Reassign Sales Owner** — a dedicated "Đổi người phụ trách" (Reassign Sales Owner) action opens a small picker over the `salesperson` master data (Spec §6, §13); Created By is never shown in this picker and never becomes editable anywhere in the UI (Spec §6).

The moment Order Status reaches `Completed`, every one of these controls disappears or renders read-only (§1 Design Principle 4) — there is no "unlock to edit a Completed order" affordance anywhere in V1 (Spec §4: correcting a Completed order requires a V2 refund flow, out of scope here).

---

## 6. Order Detail

The hub screen — everything about one order in one place (Spec §13).

**Header block:**
- Order Number (large, primary heading).
- Customer name — linked to Customer Detail.
- Order Status badge + Payment Status badge, shown side by side, never merged (§1).
- Sales Owner — shown prominently, with an inline "Đổi" (Reassign) action while open (§5).
- Created By — shown as a smaller, secondary, non-clickable audit line directly beneath Sales Owner (Spec §6, §13; §1 Design Principle 5) — e.g. "Tạo bởi {name}" in muted/smaller text, never styled as an editable field.
- Order date.
- Lost Reason — shown only when Order Status = `Lost`, styled as a callout (not just another field) so it's impossible to miss why the order died (Spec §4).

**Order Timeline** — the simplified 4-stage progress bar, positioned directly under the header, above everything else on the page. Full design in §9.

**Line items table:** Product (linked to Product Detail), Certificate Reference (only shown when present, Spec §10 — the row for a piece with no certificate simply omits this cell, no "N/A"), unit price (Snapshot Sale Price), discount, line total, gift badge (🎁, shown only when Is Gift, with recipient name on hover/tap, Spec §11), packaging option. Editable inline while Draft/Reserved (§5), read-only text while Completed/Lost (§1 Design Principle 4).

**Payments list + remaining balance** — see §8.

**Order Event Timeline** — the detailed, chronological, append-only activity log, positioned below the payments list. Full design in §9.

**Action bar** (buttons shown/hidden strictly by current status, Spec §13):
| Action | Available when |
|---|---|
| Add payment | Draft, Reserved, Partially Paid at any status, **and** Completed-but-not-yet-Paid (Spec §5, §13) |
| Complete | Draft or Reserved, when the business rule allowing completion is met (Spec §2, §4) |
| Mark as Lost | Draft or Reserved only — opens the Lost flow (§10); never shown once Completed (Spec §4) |
| Reassign Sales Owner | Draft or Reserved only (Spec §6) |
| Edit prices / add / remove products | Draft or Reserved only (§5) |

No action is ever shown and then disabled-with-no-explanation — an action that doesn't apply to the current status is simply absent from the action bar, not grayed out, to avoid staff wondering why a button won't respond.

Completing an order also triggers the auto-refresh rule (§1): the moment Complete succeeds, Dashboard, Customer Purchase History, and Reports refresh automatically — none of the three requires a manual reload to reflect the newly completed order.

---

## 7. Add Payment

A focused modal off Order Detail (Spec §13: "screen or modal") — modal chosen to match the weight of this action (one small form, no multi-section content) and to match how Customer Purchase History already adds a purchase via `PurchaseModal` rather than a full page.

**Fields:** Amount, Payment method (dropdown from `payment_method` master data), Payment date (defaults to today), Note (optional) — exactly DB §4's `payments` field list, nothing more.

**Above the form**, always visible before submitting: Total amount, Already paid (sum of prior payments), and Remaining balance — computed live so staff can see the effect of the amount they're typing before they submit it (Spec §13: "Shows total, already-paid, and remaining balance before submission").

**Overpayment:** if the entered Amount would push the sum of payments above Total amount, show a non-blocking inline warning (e.g. "Số tiền vượt quá số dư còn lại") beneath the Amount field — it does not disable Submit (Spec §4: "the UI should warn but not block it").

**Availability:** the "Thêm thanh toán" action that opens this modal is visible on Draft, Reserved, and any Completed order whose Payment Status isn't yet `Paid` (Spec §5, §13) — never on a `Lost` order (a lost deal has no balance to collect) and never on a Completed-and-Paid order (nothing left to pay).

Submitting appends a "Payment Added" Order Event (Spec §8) and recomputes Payment Status live — no separate save/refresh step.

---

## 8. Payment History

The read-only payments list on Order Detail, directly beneath the line-items table (Spec §13).

**Columns:** Date, Amount, Method, Note — newest payment first (matches Order Event Timeline's chronological convention, §9).

**Remaining balance** is shown prominently above or beside the list — a single, bold, always-visible line (e.g. "Còn lại: {amount}"), computed live as `Total amount − sum(Payments)`, going to zero/"Đã thanh toán đủ" once Payment Status reaches `Paid` (Spec §13: "running 'remaining balance' shown prominently").

**No edit or delete action on a logged payment in V1.** Spec §13 only lists "Add payment" as an Order Detail action for payments — there is no payment-correction UI in this design; a mistaken payment entry is a known V1 limitation, not solved by inventing an edit/delete affordance the spec never approved. (A future correction mechanism, if needed, belongs to the V2 Return/Refund discussion, Spec §18 — not decided here.)

**Empty state:** before any payment is logged, this section shows "Chưa có thanh toán nào" with Remaining balance equal to the full Total amount — matching the "Unpaid" Payment Status (§9).

---

## 9. Order Timeline

Two distinct, intentionally separate widgets on Order Detail — never merged into one, mirroring the spec's own explicit separation (Spec §8).

### 9.1 Order Timeline (simplified progress bar)

A horizontal 4-stage bar: **Created → Reserved → Payment → Completed** (Spec §8, verbatim stage names). Positioned near the top of Order Detail, immediately under the header.

- `Created` — always lit; the order exists.
- `Reserved` — lit once Order Status reaches `Reserved` or later.
- `Payment` — lit once at least one Payment has been logged (Payment Status ≠ `Unpaid`) — a summary signal only, deliberately not showing Unpaid/Partially/Paid granularity on this bar itself (Spec §8; that detail lives on the Payment Status badge in the header and the Payment History section, §8 of this doc).
- `Completed` — lit once Order Status = `Completed`.
- **If the order is `Lost`**, the bar visually stops/interrupts at whichever stage was active when it was lost (a distinct "broken" visual treatment, e.g. the bar halting with a marker, not silently continuing to gray dots) — paired directly with the Lost Reason callout from §6 (Spec §8).
- This bar is purely derived/computed — never a separately stored field, never independently editable (Spec §8, DB §4 "Derived").

### 9.2 Order Event Timeline (detailed audit log)

A chronological, reverse-order (newest first) activity feed lower on Order Detail, visually similar to the existing Customer Notes Timeline pattern but system-generated rather than free-text (Spec §8).

**Each entry shows:** Event type icon/label, Event detail text (the human-readable sentence, e.g. "Payment of 5,000,000₫ added via Bank Transfer," "Status changed Reserved → Completed," "Marked Lost — Lost Reason: Chose a competitor," "Sales Owner reassigned: Ánh → Minh" — DB §4 verbatim examples), Actor, and Event timestamp.

**Append-only in the UI too** — no edit or delete affordance is ever rendered next to an Order Event entry, reflecting the append-only rule at the application/UI layer (Spec §8, DB §8) even though the underlying enforcement is a database-design concern, not a UI one.

---

## 10. Lost Order Flow

Triggered by the "Đánh dấu là Lost" (Mark as Lost) action, visible only on Draft/Reserved orders (§6, Spec §4).

1. Clicking the action opens a modal (same weight/pattern as Add Payment, §7) — never a silent one-click status change, because this is a destructive-feeling, hard-to-undo business action.
2. The modal's **only required field is Lost Reason**, a dropdown sourced from the `lost_reason` master data category (Spec §4: Price too high, Chose a competitor, Changed mind, Product no longer available, Customer unreachable, Other/Mistake). The confirm/submit button stays disabled until a reason is selected — matching the spec's explicit requirement ("requires a Lost Reason to be selected before the action completes").
3. A short warning line in the modal states the consequence in plain language before confirming, e.g. "Tất cả sản phẩm trong đơn sẽ được chuyển lại về trạng thái Có sẵn." (every reserved product returns to `available`) — so staff aren't surprised by the inventory side-effect (Spec §4, §7).
4. On confirm: Order Status → `Lost`, every line's Product flips `reserved → available` (§11), a "Marked Lost" Order Event is appended (§9.2), and the Order Timeline (§9.1) freezes/interrupts at its current stage.
5. After confirmation, Order Detail's action bar collapses to view-only — no Add payment, no Complete, no edit, no re-open action anywhere in V1 (Spec §4: a Completed order cannot be marked Lost, and the reverse — un-losing an order — doesn't exist either; a genuinely mistaken Lost is why "Other/Mistake" exists as a reason, not an undo button, per Spec §17's explicit risk note).

The "Other/Mistake" reason exists specifically to keep this flow low-friction for a quick data-entry correction, per Spec §17's flagged risk ("Mandatory Lost Reason could add friction... keep the list short and include a generic 'Other/Mistake' option") — the UI must not add any further confirmation step beyond the one modal, or that friction risk becomes real.

---

## 11. Product Reservation Flow

Describes what happens, screen-by-screen, to a Product's own status as it moves through an order (Spec §7, DB §5 "Product Status Flow") — purely the UI-visible side of a rule already fully defined in both locked documents.

1. **Available → Reserved.** The instant a product is added to an order's line items (Create Order Step 2, or Order Detail's add-product action in edit mode, §5) — not on order save, immediately on add (Spec §2: "Each addition immediately marks that Product reserved"). The picker removes that product from further selection in *any other* open order the moment this happens.
2. **Concurrency-safe UI behavior.** Because two staff could reach for the same one-of-a-kind piece within moments of each other (DB §13's top-named risk), the product picker must treat "add to cart" as a request, not a guarantee: if the underlying reservation is rejected because another order claimed it first, the UI shows an inline, non-alarming message on that specific product row (e.g. "Sản phẩm này vừa được đặt trong đơn khác") and removes it from the picker's available list immediately — it never silently fails or lets two staff believe they both hold the same piece.
3. **Reserved → Available (removal or Lost).** Removing a line from an open order (§5), or marking the whole order Lost (§10), releases the product back to `available` immediately and visibly — the product reappears in other orders' pickers without a manual refresh being required by staff (a background re-fetch or optimistic update, not a "click refresh" requirement).
4. **Reserved → Sold (Complete).** Completing the order (§6) flips every line's product to `sold` in the same action — no separate per-line confirmation step. Once `sold`, that product disappears permanently from every "Select products" picker across the whole app (Spec §4, §7) — there is no V1 UI path that shows a Sold product as selectable again.
5. **No fourth state in any picker.** The "Select products" picker in Create Order and Order Detail's add-product action only ever shows `available` products — `reserved` and `sold` products are excluded from the picker entirely, not shown-but-disabled (Spec §7: no fourth inventory state exists in V1).

---

## 12. Search

**Order List search** (Spec §13): a single search box, same visual component as Customer/Product List's search input, matching against **Order Number** and **customer name/phone** simultaneously — one input, no separate "search by" toggle, consistent with how Customer List already searches name/code/phone in one field.

- Placeholder text follows the existing convention: "Tìm theo mã đơn hoặc tên/SĐT khách hàng..."
- Clearing the search box (the same "×" clear affordance SearchInput already provides) resets to the full unfiltered list, same as Customer/Product.
- Search combines with every filter in §13 simultaneously (AND, not OR) — same combination behavior already used on Customer/Product List.

**Product picker search** (Create Order Step 2, Order Detail add-product): searches available-inventory-only by name/code, reusing Product List's own search semantics scoped down to `available` status (§11).

---

## 13. Filter

Order List filter bar (Spec §13, verbatim list): **Order status, Payment status, Sales Owner, date range** — presented as a row of dropdowns/date inputs beside the search box, same filter-bar card and dropdown styling as Customer List/Product List (§1).

- **Order status filter** — options: All, Draft, Reserved, Completed, Lost.
- **Payment status filter** — options: All, Unpaid, Partially Paid, Paid.
- **Sales Owner filter** — options populated from the `salesperson` master data, same source/pattern Product List's salesperson filter already uses.
- **Date range filter** — filters on Order date; a from/to pair, consistent with how a date-range control would be expected to look if this codebase already had one elsewhere (none of Customer/Product currently filter by date range, so this is Orders' first use of that control — still just a standard two-date input, nothing novel in interaction pattern).
- All filters combine with each other and with search using AND logic, defaulting to "All"/unfiltered on first load, matching Customer/Product List's default state.
- A **"Làm mới" (Refresh)** button sits beside the filters, same icon/placement as Customer/Product List, re-fetching the list without resetting any active filter or search value.

No filter here introduces a new field — every filter option maps directly to an existing Order Status, Payment Status, Sales Owner, or Order date value already defined in Spec §14 / DB §4.

---

## 14. Sort

Not called out as its own requirement in `ORDERS_SPEC.md`, so this section stays conservative — it only orders the columns Spec §13 already approved for Order List, introducing no new field or business meaning.

- **Default sort:** Order date, newest first — matches how Customer/Product implicitly present their most-recent records and how a receipt-style list is naturally expected to read.
- **Optional column-header sort:** clicking the Order Number, Date, or Total amount column header toggles ascending/descending, the same lightweight pattern already implied by these tables' header row styling (a presentational affordance over already-displayed columns, not a new capability).
- Payment status and Order status columns are **not** independently sortable in V1 (their natural "order" is a business judgment call — e.g. is `Lost` before or after `Completed`? — that Spec §14 never makes, so this design doesn't invent one). Filtering (§13) is the intended way to narrow by status; sorting by status is left out rather than guessed at.

---

## 15. Mobile UI

Follows the exact responsive behavior already shipped for Customer/Product/Settings — Orders introduces no new responsive pattern.

- **Navigation:** the sidebar collapses to a hamburger-triggered slide-in drawer below the desktop breakpoint (already true for every module today) — "Đơn hàng" behaves identically to every other nav entry once enabled (§2).
- **Order List:** the filter bar's search input and filter dropdowns stack into a single column on narrow screens (same `flex-col` → `flex-row` breakpoint behavior as Customer/Product's filter bar); the table itself scrolls horizontally within its own card rather than reflowing into a card-list — matching how Customer/Product tables already behave on mobile (this codebase does not use a card-list mobile table pattern anywhere yet, so Orders doesn't introduce one).
- **Create Order:** the four sections (§4) stack full-width, one below the other; the live totals summary in Step 3 stays visible (e.g. sticky at the bottom of the viewport) so staff don't have to scroll up mid-negotiation to see the running total — the one mobile-specific affordance this design calls for, because Create Order is the screen most likely to be used at a counter on a tablet/phone.
- **Order Detail:** header fields wrap naturally; the line-items table scrolls horizontally like Order List's; the Order Timeline progress bar (§9.1) compresses to smaller stage labels/icons rather than being hidden — it must remain visible at every breakpoint since it's the single fastest "where is this order" read (Spec §8).
- **Modals** (Add Payment, Mark as Lost, Reassign Sales Owner): full-width-minus-margin on mobile, same as the existing `AlertDialog`/`Modal` components already behave.

---

## 16. Desktop UI

- **Order List:** filter bar lays out in one row (search flex-grow, dropdowns fixed-width, Refresh + Create Order buttons right-aligned) — identical row composition to Customer/Product List's filter bar.
- **Create Order:** wide enough to show the product picker and the running cart/totals side by side in Step 2/3 if screen width allows (a two-column layout: picker on the left, cart+totals on the right) — this is a layout optimization only, it does not change the four-step order or add any field beyond what §4 already lists.
- **Order Detail:** a two-column layout — main column (header, Order Timeline, line items, payments, Order Event Timeline) plus a slim secondary column is **not** needed here, unlike Customer Detail's sidebar (which hosts Follow-up). Orders has no equivalent secondary panel content in V1, so Order Detail stays single-column, full-width, matching Product Detail's simpler single-column layout rather than Customer Detail's two-column one.
- **Tables:** full column set always visible at desktop width, no horizontal scroll needed under normal viewport widths — matching Customer/Product Table's `min-width` behavior.

---

## 17. Validation Messages

Every validation rule below is inline (near the field it concerns), consistent with how Add Payment's overpayment warning (§7) is described — not a blocking `alert()` popup, since Orders' forms (Create Order especially) are long enough that a modal alert would be disruptive. Wording below is illustrative Vietnamese copy matching this codebase's existing tone (short, direct, "Vui lòng..." for required-field prompts).

| Situation | Message (illustrative) | Blocks submit? |
|---|---|---|
| No customer selected (Create Order) | "Vui lòng chọn khách hàng" | Yes |
| No product added to the order | "Vui lòng thêm ít nhất một sản phẩm" | Yes |
| Unit price missing/zero on a confirmed line | "Vui lòng nhập giá bán" | Yes |
| Attempting to add a product that just became unavailable | "Sản phẩm này vừa được đặt trong đơn khác" (§11) | Yes — product removed from picker |
| Marking Lost without a Lost Reason | Submit button stays disabled until a reason is chosen (§10) | Yes |
| Payment amount ≤ 0 | "Số tiền thanh toán phải lớn hơn 0" (DB §8: positive number required) | Yes |
| Payment amount would exceed remaining balance | "Số tiền vượt quá số dư còn lại" (§7) | **No** — warning only, per Spec §4 |
| Attempting to Complete when the business rule for completion isn't met | Complete action stays disabled with a short explanatory line under it (e.g. minimum-payment condition not met, per Spec §2/§4's completion rule) | Yes |
| Gift toggle on with no recipient name entered | No error — Gift Recipient Name is optional even when Is Gift = Yes (Spec §11 lists it as optional) | No |
| Attempting to edit price/discount on a Completed order | Not a validation message — the fields simply aren't editable (§1 Design Principle 4, §5) | N/A |

No message in this table represents a new business rule — each one is a UI-facing restatement of a constraint already written in Spec §4 or DB §8.

---

## 18. Empty States

Every empty state below follows the existing pattern: a muted circular icon, one line of muted-colored explanatory text, centered, inside the same card/table container that would otherwise hold rows — matching Customer Table's and Customer Purchase History's empty-state treatment exactly.

| Screen/section | Empty condition | Message (illustrative) |
|---|---|---|
| Order List | No orders exist yet, or current filters match nothing | "Chưa có đơn hàng nào" (no orders) / "Không tìm thấy đơn hàng phù hợp" (filters matched nothing) |
| Create Order — Select products | Search/filter in the picker matches no available product | "Không tìm thấy sản phẩm phù hợp" |
| Create Order — cart | No products added yet | Cart section shows a placeholder line inviting selection, not a full empty-state block (it's a sub-section of an active form, not a standalone list) |
| Order Detail — Payments list | No payments logged yet | "Chưa có thanh toán nào" (§8) |
| Order Detail — Order Event Timeline | Never actually empty — "Order Created" is always the first event (Spec §8), so no empty state is needed here |
| Customer Detail — Purchase History | Customer has no orders yet | "Khách hàng chưa có đơn hàng nào" — the same empty state Customer Detail's Purchase History already shows today, now sourced from Orders instead of `customer_purchases` (§2) |

---

## 19. Loading States

Matches the existing app-wide pattern exactly — no skeleton loaders are introduced anywhere in this codebase today, so Orders doesn't introduce them either.

- **Full-page/section loads** (Order List fetch, Order Detail fetch, Customer order-history fetch): a centered spinning indicator in place of content, same as Customer/Product List and Customer Detail's own loading state.
- **In-flight form submissions** (Save Order, Add payment, Mark as Lost, Complete, Reassign Sales Owner): the submit button shows its existing loading treatment (spinner replacing/preceding the label, button disabled) — identical to how Customer/Product's Save button already behaves; no separate full-page overlay for these.
- **Product picker search** (Create Order Step 2 / Order Detail add-product): debounced, with a small inline spinner near the search input while a query is in flight — same debounce/spinner convention Product List's search already implies, not a new pattern.
- **Refresh action** on Order List: the same "Làm mới" button + spinner-in-place behavior already used on Customer/Product List.

---

## 20. Permission Matrix

**This codebase has no role-based access control today** — every existing module (Customer, Product, Batch, Settings) is fully readable and writable by any authenticated staff member, with no roles, no per-action gating, and no `role`/`permission` concept anywhere in the current login/session implementation. This UI design does not introduce one for Orders either, since inventing an RBAC system would be a business/architecture decision outside this module's already-locked scope (`ORDERS_SPEC.md` never mentions roles, and Project Rules forbid unilateral architecture decisions).

| Action | Who can perform it in V1 |
|---|---|
| View Order List / Order Detail | Any authenticated staff member |
| Create Order | Any authenticated staff member |
| Edit prices/products (Draft/Reserved) | Any authenticated staff member |
| Reassign Sales Owner | Any authenticated staff member |
| Add Payment | Any authenticated staff member |
| Complete an order | Any authenticated staff member |
| Mark an order Lost | Any authenticated staff member |

This flat matrix intentionally mirrors every other module already shipped. Spec §18 (V2) already names a **"Manager-approval workflow for discounts above a threshold"** as a future item — that is the natural place a real role distinction (e.g. Staff vs. Manager) would first enter this system, and it is explicitly out of scope for V1 (§22 below).

---

## 21. AI Suggestions Placeholder

Per Spec §18, AI-assisted price/discount suggestions (at Confirm prices), AI upsell/cross-sell suggestions (at Select products), and predictive payment/cancellation-risk scoring are all explicitly **V3**, and Spec §18 is explicit no opportunity-score field is even reserved in the schema anymore (removed in Revision 5). Nothing AI-driven is functional in V1.

This design reserves **layout space only**, never functionality:

- **Confirm prices (Create Order Step 3, §4):** a collapsed, inert placeholder area beside the price/discount fields — visually similar to the Sidebar's existing "Sắp có" (Coming soon) treatment for disabled nav items — reserved for a future AI price-suggestion chip. In V1 it either renders nothing or a static "Gợi ý AI — sắp có" (AI suggestions coming soon) label; it never calls any model or shows a fabricated suggestion.
- **Select products (Create Order Step 2, §4):** similarly, a reserved-but-inert placeholder area near the cart for future cross-sell suggestions — same "coming soon" treatment, no functionality.
- **Order Detail:** no AI placeholder is added here — Spec §18's AI items are scoped to the two Create Order steps above only; adding a placeholder anywhere else would be scope invention beyond what's approved.

The placeholder must never simulate, mock, or hardcode a fake AI suggestion — an inert "coming soon" affordance only, so staff are never misled into thinking V1 has AI behavior it doesn't.

---

## 22. Future UI (V2 / V3)

Restates `ORDERS_SPEC.md` §18 in UI terms — **none of this is built or designed in detail here**, listed only so V1 screens don't accidentally foreclose it.

**V2:**
- A Return/Refund screen off a Completed order (reopening, reversing inventory, handling overpayment/credit notes) — no such entry point exists anywhere in V1's Order Detail action bar (§6).
- An order-level discount field on Create Order/Order Detail, in addition to today's per-line discount (§4, §5) — `discount_total` already models as a rollup for exactly this reason (DB §14), but no UI for it exists in V1.
- A "Print receipt / invoice" action on Order Detail, including a gift-receipt variant — no export/print action exists anywhere in V1.
- A manager-approval modal/step gating discounts above a threshold — ties directly to §20's flat V1 permission matrix; this is where a first real role distinction would appear.
- An automatic `customer_stage` upgrade suggestion surfaced from a completed order's value — no such suggestion UI exists in V1.
- A real per-lab certificate verification link replacing today's display-only Certificate Reference (§6, Spec §10) — V1's certificate value is never rendered as a clickable outbound link.
- Packaging/gift-wrap pricing surfaced as a real line-item add-on with its own amount — V1's Packaging Option (§4, §5) never affects Line Total anywhere in this design.

**V3:**
- Functional AI price/discount suggestions and upsell/cross-sell suggestions replacing the inert placeholders in §21.
- Predictive payment/cancellation-risk indicators (e.g. a risk badge) — no such badge exists anywhere in V1's Order List or Order Detail.
- Multi-currency amount fields — every currency field in this design (§4, §6, §7, §8) is single-currency, unlabeled by currency, matching V1's VND-only scope.
- A separate Opportunity/Pipeline screen set (Lead Source, Sales Stage, Decision Maker, Purchase Intent, Expected Close Date, Next Follow-up Date) — explicitly **not** part of Orders' UI per Revision 5 (Spec §17, §18); if ever built, it is its own module with its own navigation entry, not a tab or section bolted onto Order Detail.

---

## 23. Acceptance Checklist

**Consistency**
- [ ] Product Owner confirms Orders reusing Customer/Product's existing filter-bar, table, modal, badge, and empty/loading-state patterns (§1, §15, §16, §18, §19) is the right level of visual consistency, rather than a more distinct look for Orders.
- [ ] Product Owner confirms no new UI primitive (card, layout, control) is needed beyond what's already listed here.

**Screens**
- [ ] Product Owner confirms Order List's columns, filters, and search (§3, §12, §13) match `ORDERS_SPEC.md` §13 exactly.
- [ ] Product Owner confirms the single-scrolling-screen, four-section Create Order design (§4) — not a modal, not a multi-page wizard — is the right shape for counter use.
- [ ] Product Owner confirms "Edit Order" as a mode of Order Detail rather than a separate screen (§5) matches intent.
- [ ] Product Owner confirms Order Detail's layout, action-bar visibility rules, and Created-By/Sales-Owner visual hierarchy (§6, §1) are correct.
- [ ] Product Owner confirms Add Payment as a modal (not a full screen) and its overpayment-warning-not-block behavior (§7) match Spec §4/§13.
- [ ] Product Owner confirms Payment History has no edit/delete action in V1 (§8) is an acceptable limitation, not a missed requirement.
- [ ] Product Owner confirms the two-timeline design — simplified progress bar plus detailed event log, never merged (§9) — matches Spec §8's intent.
- [ ] Product Owner confirms the Lost Order flow's single-modal, Lost-Reason-required, no-undo design (§10) is acceptable friction/finality.
- [ ] Product Owner confirms the Product Reservation Flow's concurrency-handling UI behavior (§11) is an acceptable first-pass mitigation, pending the real concurrency-safe backend mechanism flagged in DB §13.
- [ ] Product Owner confirms Order List's Quick View eye-icon/popup (§3) is read-only with no editing surfaced from it.
- [ ] Product Owner confirms Customer Detail's Purchase History redesign (§2, §18) — one row per Order Item with Order Number/Product/Price/Payment Status/Order Status/Date, each row linking to Order Detail — matches intent.

**Cross-cutting**
- [ ] Product Owner confirms the validation message set (§17) covers every business rule in Spec §4 with no gaps and no invented rules.
- [ ] Product Owner confirms the flat, role-less Permission Matrix (§20) is correct for V1, and that manager-approval-on-discount remains a V2 item, not pulled forward.
- [ ] Product Owner confirms the AI Suggestions placeholder (§21) is inert/non-functional and correctly scoped to only the two Create Order steps named in Spec §18.
- [ ] Product Owner confirms nothing in Future UI (§22) has been accidentally designed into V1 screens.
- [ ] Product Owner confirms the auto-refresh rule (§1, §4, §6) — Dashboard, Customer Purchase History, and Reports update automatically after Order Save/Complete with no manual refresh required anywhere.

**Release**
- [ ] This document stored at `/docs/ORDERS_UI.md` and reviewed before Development (the next phase per `PROJECT_MANIFEST.md`'s workflow) begins.
- [ ] Confirmed this document contains no React, no HTML, no CSS, and no component code — design only, per the Sprint 1 Phase 3 task rules.
