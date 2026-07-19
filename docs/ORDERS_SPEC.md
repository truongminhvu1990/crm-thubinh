# Orders Module — Business Design Spec

**Sprint:** 1
**Module:** Orders V1
**Status:** Draft — Revision 5, Final Product Review — awaiting Product Owner approval.
**Phase:** Business design only. No code, no SQL, no migrations, no UI were written for this document.

**Revision 5 changelog (this pass, Final Product Review):**
1. **Orders begin only after the customer has made a purchase decision. Orders do not manage opportunity, quotation, or negotiation.** Removed the former §7 (Sales Pipeline & Opportunity Fields: Lead Source, Sales Stage, Decision Maker, Purchase Intent, Expected Close Date, Next Follow-up Date) and former §8 (AI Opportunity Score) in their entirety — those fields existed specifically to track pre-decision negotiation, which is now explicitly out of scope for the Orders module. **Lost Reason is retained** (moved into §4/§14) since it documents why a post-decision deal fell through, not pre-decision negotiation, and is unaffected by this change.
2. **Redefined `Draft`:** "The order record is being prepared inside CRM." Removed every statement implying a Draft order can represent a pre-decision inquiry, quote, or negotiation (§2, §14) — this resolves the open question raised in Revision 4 (formerly §19).
3. **Changed Order Number format.** Old: `OD20260711-0001`. New: `OD-{YYYYMMDD}-{6-digit sequence}`, e.g. `OD-20260711-000001` (§3, §13).

All sections from old §9 onward are renumbered down by two (old §9→§7 ... old §21→§19) to close the gap left by removing the two sections above; no other content was reordered. Everything else from Revision 3/4 not touched by the three items above remains intact (Sales Owner vs. Created By, the four Order Statuses, Revenue Recognition, Product Lifecycle, Order Event Timeline, Snapshot Scope, Certificate Reference, Gift Tracking, Packaging Option). Nothing in this revision has been implemented — still business design only. **This is the final revision. Stop for Product Owner approval.**

---

## 1. Business Goal

### The problem

CRM Thu Bình currently has no concept of an **Order**. What exists today is `customer_purchases`: one row per single product sold to one customer, created ad hoc from the Product Detail page. This works for a one-item cash sale, but it cannot represent how jade/jewelry is actually sold in practice:

- A customer buys **several pieces in one visit** (a bracelet + a pair of earrings) — today that becomes several disconnected purchase rows with no shared total, no shared receipt, and no shared payment.
- Jade sales are **negotiated at the counter** — the price confirmed once the customer has decided to buy is frequently not the listed `sale_price`, and a discount is often applied per piece. Today there is nowhere to record what was actually agreed without overwriting the product's master price.
- Payment is often **not settled in one shot** — deposits, partial payment while a piece is resized/certified, and pay-on-delivery are normal. Today there is only a single `sale_price` with no payment state at all.
- A sale can **fall through after the customer has committed** — a customer reserves a piece and later backs out before paying/collecting. Today there is no reservation state and no way to record a lost sale; a purchase row is either created or it doesn't exist.

**Orders solves this** by introducing a proper header/line/payment structure: one Order groups multiple products for one customer, carries its own negotiated prices and discounts, tracks partial payment over time, and can be safely reserved or marked Lost without corrupting inventory or reports. **Orders begins only once the customer has decided to buy — it is a transaction record, not an opportunity/pipeline tool** (see §14 for the Draft definition, and the Revision 5 resolution noted in §17).

Orders becomes the **central transaction record** of the CRM — the one event that, once completed *and paid* (see §5), is the source of truth for revenue, inventory movement, and customer history. Every other module either feeds Orders (Customer, Product, Batch) or is fed by Orders (Inventory, Dashboard, Reports).

### Connection to other modules

| Module | Relationship to Orders |
|---|---|
| **Customer** | Every Order belongs to exactly one Customer. Orders replace `customer_purchases` as the authoritative purchase history shown on Customer Detail, and order totals feed the customer's lifetime revenue used elsewhere (VIP badge, top-customer reports). |
| **Product** | Every Order line references exactly one Product. The Product's current `sale_price`/`discount` are read as a *suggested* starting price; the Order stores its own negotiated Snapshot Sale Price so the Product record is never overwritten by a sale (see §9). |
| **Inventory** | Product's existing `available` / `reserved` / `sold` counters are driven by Order state transitions (see §4, §7) instead of being edited by hand. Orders becomes the only legitimate way those counters change. |
| **Batch** | Because each Product optionally belongs to a Batch (with its cost basis and supplier), Orders — via Order Items → Products → Batch — is what will eventually let Reports compute real batch profitability (revenue booked in Orders minus the Batch's cost). Not built in V1; enabled by the data model. |
| **Dashboard** | Today's/this-month's revenue, pending-payment count, and recently-completed sales become Order-derived KPIs instead of raw `customer_purchases` counts — with revenue specifically filtered per §5. |
| **Reports** | The existing By Source / By Salesperson / Top Customer / Monthly Revenue tables move from reading `customer_purchases` to reading Orders that meet the Revenue Recognition rule (§5), gaining accuracy (real totals, real discounts) and new dimensions (payment status, lost rate by Lost Reason) for free. |
| **Settings** | New small master-data lists are needed to support Orders (payment method, lost reason, packaging type) — managed the same generic way `market`/`country`/`salesperson` are today. See §16. |

---

## 2. Business Workflow

```
Customer
   ↓
Select products
   ↓
Confirm prices
   ↓
Payment
   ↓
Complete
   ↓
Inventory update
   ↓
Reports update (once Paid too — see §5)
   ↓
Customer history
   ↓
Dashboard
```

**Step-by-step:**

1. **Customer** — Staff opens "Create Order" once a customer has decided to buy, and picks an existing customer (same picker pattern as the rest of the CRM; no new-customer shortcut needed, Customer creation stays its own flow). The order is also assigned a Sales Owner and, invisibly, a Created By value (§6). This is the point an Order — and therefore Draft status — first exists; see §14 for why nothing earlier than this counts as an Order.
2. **Select products** — Staff searches/browses **available** inventory (Product status = available, not already attached to another open order) and adds one or more pieces to the order. Each addition immediately marks that Product **reserved** so two staff members cannot sell the same one-of-a-kind piece at once.
3. **Confirm prices** — For each line, staff confirms or overrides the unit price and applies a discount (amount or %). The Product's own `sale_price`/`discount` pre-fill the line as a suggestion only — nothing is written back to the Product. The order's subtotal, total discount, and grand total are computed live.
4. **Payment** — Staff records one or more payments against the order total (full payment, deposit, or installment) — see §4 and §5 for how multiple payments and revenue recognition interact. Each payment has an amount, method, and date. The order's payment status (Unpaid / Partially Paid / Paid) is derived from the sum of payments vs. the total.
5. **Complete** — Once the order is in an acceptable state (business rule: fully paid, or explicitly allowed to complete on partial payment — see §4), staff marks the order **Completed**. This is the point of no casual return — completed orders are locked (see §4). Completing does **not** by itself mean the sale counts as revenue (§5) if payment is still outstanding.
6. **Inventory update** — On Completion, every reserved line's Product flips from `reserved` to `sold`. If the order is marked **Lost** before completion instead, every reserved line's Product flips back to `available` and a Lost Reason is required (§4, §14).
7. **Reports update** — Orders that are both Completed **and** Paid (§5) become immediately visible to the Reports revenue aggregations — no separate sync step, same as `customer_purchases` today. Orders that are Completed but not yet Paid still appear everywhere else (Order List, Customer History) — just not in revenue totals until paid.
8. **Customer history** — The Customer Detail timeline gains a grouped Order entry (products + total + payment status), backed by the Order Event Timeline (§8), instead of one row per product.
9. **Dashboard** — KPI cards refresh from the same completed-and-paid data (today's revenue, pending payments, recently-completed sales).

---

## 3. Database Design

Design only — no SQL. Four new tables (`orders`, `order_items`, `payments`, `order_events`). No existing table is modified in this phase (per the hard constraint of this sprint); the schema changes required to wire Inventory updates into `products` are described but deferred to the implementation phase.

### `orders`

**Purpose:** The header record for one transaction — one customer, one visit, one running total, one status. Only ever created after the customer has decided to buy (§1, §2, §14).

**Fields (business meaning, not column types):**
- Order Number — human-readable identifier shown to staff/customer (e.g. on a receipt), and the primary way an order is referred to in conversation. **Format changed in Revision 5:** `OD-{YYYYMMDD}-{6-digit sequence}`, e.g. `OD-20260711-000001` for the 1st order created on 2026-07-11. Assumption carried into the Acceptance Checklist (§19) for explicit Product Owner confirmation: the sequence resets to `000001` at the start of each calendar day, scoped to that day only — matches how a daily receipt-book sequence is typically read. Immutable once assigned; never reused even if an order is later marked Lost.
- Customer reference — which customer this order belongs to.
- Sales Owner — who currently owns/is responsible for this deal. **Clarified in Revision 3, replaces the Revision 1/2 "Salesperson" label** — see §6 for why this is distinct from Created By.
- Created By — which staff member opened/created this order record. **New in Revision 3**, audit field, never changes after creation — see §6.
- Order date — when the order was opened/created.
- Lost Reason — why the order was marked Lost, required at that time. See §4, §14.
- Subtotal — sum of line totals before order-level adjustments.
- Discount total — sum of all line discounts (kept as a rollup for fast reporting; the source of truth is still each line's own discount).
- Total amount — final amount owed.
- Order status — see §14.
- Payment status — see §14 (derived from `payments`, stored as a rollup for fast list/filter queries).
- Note — free text (special requests, delivery instructions).
- Created/updated timestamps — audit only (distinct from Created By, which names *who*, not *when*).

**Relationships:** one Customer → many Orders. One Order → many Order Items. One Order → many Payments. One Order → many Order Events (§8).

### `order_items`

**Purpose:** One line of one order — one product, its negotiated price, and its discount. This is where "confirm prices" is recorded.

**Fields:**
- Order reference.
- Product reference.
- Snapshot Sale Price — the price **actually agreed** for this sale. This is a deliberate snapshot copy of the Product's price at sale time, not a duplication of live data — it must survive even if the Product's own `sale_price` is edited later (exactly the same reasoning already used for `customer_purchases.source`/`salesperson` snapshots today).
- Discount — the amount/percent actually applied to this line (again a snapshot, independent of the Product's own `discount` field).
- Quantity — almost always 1 (jade pieces are typically unique), but present so a mass-produced item (e.g. a silver chain sold by the meter/unit) is not a special case.
- Line total — Snapshot Sale Price × quantity, minus discount.
- Is Gift — whether this specific line is a gift. See §11.
- Gift Recipient Name / Gift Note — optional, only meaningful when Is Gift. See §11.
- Packaging Option — which packaging this line is going out in. See §12.

**Relationships:** one Order → many Order Items. One Order Item → exactly one Product. A given Product may appear in **at most one open (non-Lost) Order Item at a time** (see §4) but may appear in several Order Items across time if earlier orders containing it were marked Lost.

### `payments`

**Purpose:** One payment event against one order. Modeling this as its own table (rather than a single `amount_paid` column on `orders`) is what allows deposits/installments without a future schema change, and is what makes "support multiple payments per order" a non-event — it was already the point of this table.

**Fields:**
- Order reference.
- Amount.
- Payment method — references a new `payment_method` master-data category (cash, bank transfer, card, ...), same pattern as `market`/`country`.
- Payment date.
- Note.
- Created timestamp — audit only.

**Relationships:** one Order → many Payments, with no upper limit and no requirement that they happen before Completion — see §4 for the full rule set now that Revenue Recognition (§5) means payments can matter even after Completion.

### `order_events`

See §8 for full design — the append-only timeline of everything that happens to an order.

### Deliberately not duplicated

- Customer name/phone/market are **not** copied onto `orders` — always read live via the Customer reference, exactly like `customer_purchases` already joins `customers` today.
- Product name/code/category/certificate/images are **not** copied onto `order_items` — always read live via the Product reference for display; only **Snapshot Sale Price and discount** are stored, because those two values specifically must survive later edits to the Product. See §9 for the tightened statement of this rule and §10 for the certificate-specific consequence.

---

## 4. Business Rules

- **Can one order contain multiple products?** Yes — that is the core reason Orders exists (see §1).
- **Can one product belong to multiple orders?** Not at the same time. A Product can be attached to only one **open** (Draft/Reserved) Order Item at once, enforced the same way a piece can only physically be in one hand at once. A Product **can** appear in multiple Orders over time, but only sequentially — e.g. reserved in Order A, Order A is marked Lost, the same piece is later reserved in Order B. See §7 for the full Product Lifecycle statement.
- **Can a sold product be sold again?** No. Once an Order Item's Product has been carried through to a **Completed** order, that Product is `sold` and permanently excluded from the "select products" picker. Reversing a completed sale is a Return/Refund action (V2, see §18), not a new Order Item against the same Product.
- **Can price be edited?** Yes, but only while the order is still open (Draft/Reserved) — that is literally the "Confirm prices" step. Once an order is **Completed**, its line prices and discounts are locked; correcting a completed order requires a refund flow (V2), not an edit, to keep every completed order's numbers permanently trustworthy for Reports and AI.
- **How discount works?** Discount is applied **per line**, decided at sale time by staff, independent of (but pre-filled from) the Product's own `discount` field. The order's `discount total` is a rollup of line discounts for reporting; there is no separate order-level "extra" discount in V1 (kept out to keep V1 small — see §18 for order-level discount in V2).
- **How payment status works?** Derived, not manually set: `Unpaid` (no payments yet), `Partially Paid` (payments sum < total), `Paid` (payments sum ≥ total). Staff never picks this status directly — they add Payments and the status follows. **Multiple payments** are fully supported with no cap on count: a deposit, one or more installments, and a final settlement can all be logged as separate Payment rows against the same order, at any dates, via any methods, in any order. A payment can be logged **before or after** the order is marked Completed — Completion only requires the business rule below to be satisfied at that moment; it does not close the door on further payments if the order was allowed to complete while still owing a balance. Overpayment (sum of payments exceeding total) is out of scope for V1 — the UI should warn but not block it, with reconciliation left to staff judgment; a formal refund/credit-note flow is V2 (§18).
- **How does an order become Lost?** An order can be marked Lost only while it is Draft or Reserved (i.e. before Completion). Marking an order Lost releases every line's Product back to `available` and **requires** a Lost Reason to be selected before the action completes. Lost Reason is a picklist backed by the `lost_reason` master-data category (e.g. Price too high, Chose a competitor, Changed mind, Product no longer available, Customer unreachable, Other/Mistake), same generic pattern as `payment_method` (§16) — this feeds a "lost rate by reason" report — win/loss analysis by customer segment, product category, or salesperson. A **Completed** order cannot be marked Lost in V1 — that gap is intentionally deferred to a V2 Return/Refund flow rather than rushed into V1 (see §17, §18).
- **How inventory changes?**
  - Adding a Product to an order's line items: `available → reserved` on that Product.
  - Completing the order: `reserved → sold` on every line's Product.
  - Marking the order Lost: `reserved → available` on every line's Product.
  - No other path changes these counters once Orders ships — manual editing of Product inventory counters is superseded by this flow. Full state machine in §7.
- **How revenue recognition works?** See §5 — it is important enough to warrant its own section rather than a bullet here.

---

## 5. Revenue Recognition

> Revenue is recognized **only when**: Order Status = `Completed` **AND** Payment Status = `Paid`.

### Why this needs to be explicit

§4 already allows completing an order on partial payment (deposit sales, pay-on-delivery, resizing/certification workflows where the piece leaves the shop before the balance is settled — all normal in this business, see §1). That means **"Completed" alone does not guarantee the money is fully in hand.** Without this rule, Reports and Dashboard would count an order's full total as revenue the instant it's marked Completed, even with a balance still outstanding — overstating revenue and misrepresenting actual cash position.

### The distinction

- **Completed** (Order Status) — an *operational/inventory* fact: the sale is final, the product is `sold`, inventory is decremented, prices are locked (§4). Nothing about money is implied.
- **Revenue Recognized** — a *financial/reporting* fact: Order Status = Completed **and** Payment Status = Paid, both at once.

Revenue Recognized is **not a new stored field.** It is always computed live, at query time, as a filter over the two existing status fields — exactly the same pattern already used for the existing derived Payment Status. There is nothing new to keep in sync, and nothing that can drift out of date.

### Consequence for a Completed-but-not-Paid order

It behaves normally in every other respect — inventory is `sold`, prices are locked, it appears in Order List and Customer History exactly like any other Completed order — it is simply **excluded from revenue totals** until Payment Status reaches Paid. The moment the final payment is logged (no new order, no re-completion, no status re-entry), that same order crosses into revenue-recognized. Reports/Dashboard revenue widgets must filter on both fields together; filtering on Order Status alone is a bug, not a simplification.

### Follow-on rule this forces (already folded into §4)

Because a Completed order can still be owed money, **Add Payment must remain a valid action on a Completed order whose Payment Status is not yet Paid** — reflected in §13's UI Design, which lists "Add payment" as available for Draft/Reserved/Partially Paid *and* Completed-but-not-yet-Paid.

---

## 6. Sales Ownership: Sales Owner vs. Created By

**New in Revision 3.** Two distinct fields on `orders`, deliberately kept separate:

- **Created By** — the staff member who literally opened/created the order record. Set once, automatically, at creation. **Never changes** afterward, regardless of anything else that happens to the order — this is a pure audit fact ("who typed this into the system"), not a business-ownership fact.
- **Sales Owner** — the staff member currently responsible for closing this deal. Defaults to whoever is Created By at creation time, but **can be reassigned** while the order is open (Draft/Reserved) — e.g. a junior staff member opens the sale at the counter, but a senior salesperson takes over for a large piece; or a salesperson goes on leave mid-deal and it's handed to a colleague. Sales Owner is what drives sales-performance attribution (conversion rate, revenue per salesperson) in Reports, not Created By.

This replaces the single "Salesperson" field named in Revision 1/2 — that field's business meaning was always "who owns the deal," which is exactly Sales Owner; it simply hadn't been distinguished from "who created the record" until Revision 3. Both fields reference the same existing `salesperson` master-data category (no new master-data category needed for this item).

**Business rule:** Sales Owner is editable any time the order is open; Created By is immutable and not exposed as an editable field anywhere in the UI. Reassigning Sales Owner is a loggable event on the Order Event Timeline (§8), so a handoff is traceable even though the field itself only ever shows the current owner.

---

## 7. Product Lifecycle

```
Available ──(added to an Order's line items)──▶ Reserved
Reserved ──(order Completed)──▶ Sold
Reserved ──(order marked Lost)──▶ Available
```

- **Available** — not attached to any open Order Item. Selectable in "Select products" (§13).
- **Reserved** — attached to exactly one open (Draft/Reserved) Order Item. Not selectable by any other order while in this state (§4, §17 concurrency risk).
- **Sold** — attached to a Completed Order Item. Permanently excluded from the picker. The only way out of `Sold` is a V2 Return/Refund flow (§18) — there is no "un-sell" action in V1.

Entirely driven by Order state transitions — no other path changes these counters (§4). No fourth state (e.g. "Damaged," "Withdrawn") is introduced in V1; if the business needs to pull a piece from sale without a completed order (e.g. damaged in the shop, no customer involved at all), that is a V2 candidate (§18), since it doesn't fit naturally into an Order-driven state machine.

---

## 8. Order Event Timeline

### Order Timeline (simplified, new in Revision 4)

A UI-facing, 4-stage visual progress indicator, distinct from the detailed audit trail below:

```
Created
   ↓
Reserved
   ↓
Payment
   ↓
Completed
```

- Not a new stored field — derived live from Order Status and Payment Status, the same "computed, not stored" pattern already used for Revenue Recognized (§5). `Created` maps to the order existing at all (Draft or later); `Reserved` maps to Order Status = Reserved or later; `Payment` lights up once at least one Payment has been logged (Payment Status ≠ Unpaid); `Completed` maps to Order Status = Completed.
- Purpose is a fast, at-a-glance "where is this order" read for staff on Order Detail (§13) — it does not replace the detailed Order Event Timeline below, which remains the authoritative, timestamped, per-event audit log.
- If the order is marked **Lost**, the bar shows as interrupted at whichever stage it was in when Lost was set, rather than progressing to `Completed` — paired with the Lost Reason (§4).
- `Payment` on this simplified bar is a summary signal only (has any payment happened yet) — it does not attempt to show Unpaid/Partially Paid/Paid granularity; that detail stays on the Payments list and payment status badge (§13).

### Order Event Timeline (detailed, append-only audit log)

New table: `order_events`.

**Purpose:** an append-only audit trail of everything that happens to one order, so Order Detail and Customer History have one reliable source for "what happened and when," instead of reconstructing a story from `updated_at` columns (which only ever show the *last* change, not the history of changes).

**Fields (business meaning):**
- Order reference.
- Event type — e.g. Order Created, Product Added, Product Removed, Price Changed, Payment Added, Status Changed, Sales Owner Reassigned, Marked Lost.
- Event detail — short human-readable description (e.g. "Payment of 5,000,000₫ added via Bank Transfer," "Status changed Reserved → Completed," "Marked Lost — Lost Reason: Chose a competitor," "Sales Owner reassigned: Ánh → Minh").
- Actor — which staff/salesperson performed the action.
- Event timestamp.

**Relationships:** one Order → many Order Events.

**Rules:**
- Append-only. Events are never edited or deleted, even when a later V2 refund flow corrects the underlying order — the correction shows up as a *new* event, the history is never rewritten.
- Feeds Order Detail (a chronological activity log, conceptually similar to the existing `CustomerNote` pattern but system-generated rather than free text) and Customer History's "expand to Order Detail" view (§13).
- Distinct from the Created/updated timestamps on `orders` (system bookkeeping, not AI-learnable per §15) — Order Events are discrete business events, several per order, and are useful as-is for the Order Detail activity log even without any predictive modeling layered on top.

---

## 9. Product Data on Order Items — No Duplication

> **Snapshot Scope — explicit statement, Revision 4.** Across this entire design, exactly two values are ever snapshotted (frozen at the moment they're set, independent of later edits elsewhere): **Snapshot Sale Price** and **Discount**, both on `order_items` (below). **Sales Owner** on the `orders` header (§6) is native order data, not a copy of anything — it isn't "snapshotted from" a Customer or Product record, it's simply set/reassigned directly on the order, which is why it stays live-editable while the order is open rather than frozen like the two true snapshots. **Customer profile data (name, phone, market, or any other customer field) is never snapshotted onto an Order under any circumstance** — always read live via the Customer reference (§3, "Deliberately not duplicated"). If a future revision proposes copying customer data onto an Order "for history," that is a deliberate design change requiring its own review, not an extension of this rule.

An Order Item stores **exactly two** pieces of product-related data:
1. **Product ID** (a reference, not a copy).
2. **Snapshot Sale Price** (the price actually agreed at sale time — named so the field itself signals "this is a frozen snapshot," not "this is the current price").

Everything else about the product — name, code, category, color, size, weight, jade grade, certificate number, images — is read **live** via the Product reference, every single time it is displayed, with zero duplication. If the Product's name is corrected next month, every past Order Detail referencing it shows the corrected name immediately; there is no `order_items` copy to go stale.

Discount is still stored per line — it is not "product information," it is "what this specific deal agreed to," which is exactly the category of data that must be snapshotted (alongside Snapshot Sale Price) rather than read live.

---

## 10. Certificate Reference

**Terminology standardized in Revision 4:** referred to throughout this document as the **Certificate Reference** — a read-only pointer to the Product's own `certificate_no`, never an Order-owned field. **There is no certificate status anywhere in this design** — no "verified/unverified," no "pending," no workflow state of any kind attached to it. It is display-only data, sourced live, full stop.

Product already carries `certificate_no` (the jade/jewelry certificate number — e.g. a GIA or local gemological lab reference). Per §9, Order Items do not copy this value — Order Detail displays it live via the Product reference, as a **Certificate Reference**.

**Behavior:**
- If the Product has a `certificate_no`, Order Detail shows it next to that line item, as a read-only **Certificate Reference** field.
- If the Product has no `certificate_no` (common for lower-value pieces), the row is simply omitted — no "N/A" clutter, and no status value is shown in its place.
- Clicking/tapping the certificate number in V1 is **display-only** (e.g. copy-to-clipboard) — there is **no outbound verification link** to any lab's public lookup site in V1. Building real per-lab verification URLs is deferred to V2 (§18), since not every certifying lab has a public lookup, and guessing a URL pattern wrong would present a broken or — worse — incorrect link, which is a worse outcome for a jewelry business than no link at all.
- Because `certificate_no` lives on Product and is read live rather than snapshotted, correcting a typo in it after a sale is reflected retroactively on every past Order Detail referencing that product — this is intentional: unlike price, a certificate number is a fact about the physical object, not a negotiated deal term, so it doesn't need to survive independent of later correction (§9).

---

## 11. Gift Tracking

Modeled at the **Order Item** level, not the order level, because a single visit commonly mixes a piece bought for the customer with a piece bought as a gift for someone else.

**Fields added to `order_items`:**
- Is Gift — yes/no.
- Gift Recipient Name — optional free text. Not a Customer reference: the recipient is frequently not a CRM customer at all.
- Gift Note — optional free text (occasion, message to include).

**Business rules:**
- **Explicit rule, Revision 4: a gift line must reference a real Product from inventory, the same as any other Order Item — there is no free-text "gift item name" field, and none is permitted.** Marking a line `Is Gift` only changes how that line is treated for display/attribution (below); it never changes what the line *is* — it is still one Order Item pointing at one Product, priced and discounted like any other line. An untracked, non-inventory freebie (e.g. a small giveaway with no Product record) has no representation in V1 and is out of scope — see §18 if the business needs this later.
- Purely informational in V1. A gift line is priced, discounted, paid for, and completed exactly like any other line — no gift-wrap surcharge, no separate gift receipt logic in V1 (that would be pricing-model scope, deferred — see §12, §18).
- Revenue, inventory, and customer lifetime value always attribute to the **paying Customer** on the order, never to the (typically unregistered) recipient. Gift Recipient Name is display/context only, never a second customer relationship.
- Shown on Order Detail as a small per-line badge (e.g. "🎁 for {Recipient Name}"). Using it as an Order List/Order Detail filter is a reasonable later addition, not required for V1.

AI note (§15): Gift Note is NLP-only, same as other free-text fields; the Is Gift flag is a usable structured feature (gift-buying frequency/seasonality per customer).

---

## 12. Packaging Option

Also modeled at the **Order Item** level, same reasoning as Gift Tracking (§11) — packaging is chosen per physical piece, not per order.

**Field added to `order_items`:**
- Packaging Option — selected from a **new master-data category `packaging_type`** (e.g. Standard box, Premium box, Pouch only, Gift-wrapped box), same generic pattern as `payment_method` (§16).

**Business rules:**
- Display/fulfillment information only in V1 — it does **not** affect Line Total, discount, or any pricing rule. If the business later wants premium packaging to carry its own cost, that is a real pricing-model change (a genuine line-item add-on), explicitly deferred to V2 (§18) — called out in §17 so it is never silently assumed to be free forever.
- Optional per line, defaults to whichever packaging Settings marks as the default (configurable, not hardcoded); staff can override per line.

---

## 13. UI Design

No React, no components — screen-level description only.

### Order List
- Table of orders: Order Number, customer name, date, item count, total amount, payment status badge, order status badge, Sales Owner.
- Filters: search (Order Number / customer name/phone), order status, payment status, Sales Owner, date range — same filter-bar pattern already used on Customer List and Product List.
- Row action: open Order Detail. "Create Order" button top-right, same placement convention as "Thêm khách"/"Thêm sản phẩm".

### Order Detail
- Header: Order Number, customer (linked to Customer Detail), Sales Owner, Created By (shown as a smaller/secondary audit line, not editable), date, order status, payment status, and — if Lost — Lost Reason.
- **Order Timeline** (new in Revision 4, see §8): a simplified 4-stage visual progress bar — `Created → Reserved → Payment → Completed` — shown near the top of Order Detail, separate from the detailed Order Event Timeline lower on the page. If the order is Lost, the bar shows the stage it was lost from, visually interrupted, plus the Lost Reason.
- Line items table: product (linked to Product Detail), Certificate Reference (if present, §10), unit price (Snapshot Sale Price), discount, line total, gift badge (if applicable, §11), packaging option (§12).
- Payments list: date, amount, method, note; running "remaining balance" shown prominently.
- Order Event Timeline (§8): chronological activity log below the payments list, including Sales Owner reassignments.
- Actions available depending on status: Add payment (Draft/Reserved/Partially Paid, **and Completed-if-not-yet-Paid** — §5), Complete (when allowed), Mark as Lost (Draft/Reserved only — requires selecting a Lost Reason before it can be submitted, §4), Reassign Sales Owner (Draft/Reserved only), Edit prices (Draft/Reserved only).

### Create Order
- Step 1 — pick Customer (reuse the existing customer search/picker). Sales Owner defaults to the creating staff member (= Created By) but can be changed immediately if the order is being opened on behalf of someone else.
- Step 2 — Select products: searchable/filterable list of available inventory (by category, market/batch as already filterable on Product List), add to cart.
- Step 3 — Confirm prices: editable unit price + discount per cart line, plus per-line Is Gift/Recipient/Note and Packaging Option; live-computed subtotal/discount/total.
- Step 4 — Payment: add one or more payments, or skip and save as Reserved with `Unpaid` status to finish payment later.
- Save produces a Draft/Reserved order; "Complete" is a separate explicit action, not implied by saving.

### Payment (screen or modal off Order Detail)
- Amount, method (dropdown from the `payment_method` master data), date, note.
- Shows total, already-paid, and remaining balance before submission.
- Available on Completed orders too, as long as Payment Status isn't yet Paid (§5).

### History (on Customer Detail)
- Replaces the current per-product purchase timeline with one entry per Order: date, item thumbnails/names, total, payment status. Expands to the same Order Detail view, including its Order Event Timeline (§8).

---

## 14. Status Design

Kept minimal on purpose — each status set is independent so one doesn't have to be overloaded to express the others.

> **Explicit rule:** Order Status and Payment Status are **completely independent** of each other. Neither can be inferred from the other, neither is derived from the other, and no business rule anywhere in this document conditions one on a specific value of the other except the Revenue Recognition rule (§5), which requires *both* to independently reach their own terminal value at once. A `Completed` order can be `Unpaid`, `Partially Paid`, or `Paid`; an `Unpaid` order can be `Draft`, `Reserved`, or (per §5) even `Completed`. Never build a UI or report that assumes one implies the other.

> **Explicit rule (Revision 5): `Draft` means "the order record is being prepared inside CRM" — never a pre-decision inquiry, quote, or negotiation.** An Order — and therefore Order Status — only comes into existence once the customer has decided to buy (§1, §2). `Draft` is the state of building that already-decided order (adding products, confirming prices) before it reaches `Reserved`. There is no Order Status of any kind, `Draft` or otherwise, for a lead that hasn't decided yet — Orders simply does not represent that activity. This resolves the Revision 4 open question (formerly §19) and supersedes Revision 4's looser "Order Status only exists post-decision" framing, which had still left `Draft` ambiguously open to pre-decision use.

**Order status**
- `Draft` — the order record is being prepared inside CRM (Revision 5): products may still be added/removed, prices are still being confirmed, nothing reserved is guaranteed held past this session. Only ever created after the customer has decided to buy.
- `Reserved` — products are held (inventory marked `reserved`); waiting on payment/completion.
- `Completed` — sale finalized; inventory `sold`; prices locked. **Does not by itself imply revenue recognized — see §5.**
- `Lost` — *(renamed from `Cancelled` in Revision 3)* abandoned before completion; inventory released back to `available`; Lost Reason required (§4).

**Payment status** (independent of order status, always derived)
- `Unpaid`
- `Partially Paid`
- `Paid`

**Revenue Recognized** (not a stored status — a computed filter, §5)
- `= true` only when Order Status = `Completed` **and** Payment Status = `Paid`.

**Inventory status** (already exists on Product as `available` / `reserved` / `sold` — full state machine in §7; Orders drives transitions between them, no new inventory status is introduced)

---

## 15. AI Data

For every field Orders introduces, whether it is learnable business signal:

| Field | AI-learnable? | Why |
|---|---|---|
| Order date | **YES** | Seasonality, buying-frequency patterns, time-to-next-purchase modeling. |
| Customer reference | **YES** | Feeds customer lifetime value, segmentation, churn modeling — the join key for almost every customer-side model. |
| Sales Owner | **YES** | Sales performance, conversion-rate-by-staff modeling. |
| Created By | **NO** | Audit-only fact about who opened the record; not a business outcome signal (distinct from Sales Owner, §6). |
| Lost Reason | **YES** | Direct input to lost-deal and win/loss analysis — which reasons cluster by customer segment, product category, or salesperson. |
| Order status | **YES** | Lost rate is a real risk/quality signal (which customers/products/salespeople correlate with lost orders). |
| Payment status | **YES** | Predicts payment-behavior risk (who tends to leave orders partially paid), useful for follow-up prioritization. |
| Subtotal / discount total / total amount | **YES** | Core revenue and discount-sensitivity signal; discount-total specifically enables price-elasticity and negotiation-pattern modeling. |
| Note (order-level free text) | **YES, with caveat** | Usable once processed with NLP/embeddings (special requests, complaints); not usable as a raw structured feature. |
| Created/updated timestamps (audit) | **NO** | System bookkeeping only — distinct from "order date," which is the real business timestamp. Row-management metadata has no business signal. |
| Product reference (on Order Item) | **YES** | The join key for "what sells," category affinity, cross-sell/upsell modeling. |
| Snapshot Sale Price / discount (on Order Item) | **YES** | Per-item price sensitivity, margin analysis, which pieces get discounted most. |
| Quantity | **YES, limited** | Mostly constant at 1 given unique jade pieces; still useful for the minority of mass-produced items (basket-size patterns). |
| Line total | **YES** | Directly feeds revenue-by-product and profitability (once joined with Batch cost, see §1). |
| Is Gift | **YES** | Gift-buying frequency/seasonality per customer. |
| Gift Recipient Name / Gift Note | **NO / caveat** | Recipient Name is not a linked entity, low reuse value; Gift Note is NLP-only, same as other free text. |
| Packaging Option | **YES, limited** | Fulfillment/preference signal; low priority but free to capture. |
| Payment amount / method / date (on Payment) | **YES** | Payment-method preference by customer segment; deposit-vs-full-payment behavior; time-to-pay-off patterns. |
| Payment note | **YES, with caveat** | Same as order note — NLP-only, not a raw structured feature. |
| Order Event Timeline entries | **YES, indirect** | Not a feature by itself, but source data for derived timing signals — e.g. time from Reserved to Completed. |

No field was added purely for display — every field above either drives a business rule (§4–§12), a report, or a future AI signal, per the design rules for this sprint.

---

## 16. Module Impact

Descriptive only — nothing below is being changed in this phase.

- **Customer** — Customer Detail's purchase history section will eventually read from Orders instead of `customer_purchases`; the Customer record itself is untouched (no new columns needed on `customers`).
- **Product** — Product's existing `available`/`reserved`/`sold` counters and `status` become **driven by** Order state transitions instead of manual edits (full state machine in §7). The Product's `sale_price`/`discount` fields remain as-is, now understood as "suggested/list price," not "sold-at price" (that lives on the Order Item as Snapshot Sale Price, §9). Product's existing `certificate_no` is read live from Order Detail, never duplicated (§10).
- **Inventory** *(expressed today as fields on Product, not a separate module)* — gains its first real, auditable trigger for state changes (Orders) instead of being hand-edited.
- **Dashboard** — gains real-time revenue/pending-payment/recently-completed KPIs sourced from Orders, filtered by the Revenue Recognition rule (§5) rather than Order Status alone. No existing Dashboard card is removed or broken by this design.
- **Reports** — existing tables (By Source, By Salesperson, Top Customers, Monthly Revenue) keep the exact shape they have today but move to a more accurate, Revenue-Recognized source (§5); new report dimensions (payment status, lost rate by Lost Reason, discount analysis) become possible without new schema. "By Salesperson" now specifically means "By Sales Owner" (§6).
- **Settings** — **three** small new master-data categories are needed: `payment_method`, `lost_reason` (renamed from `cancellation_reason` in Revision 3), and `packaging_type` (§12) — all managed with the exact same generic CRUD screen already used for `market`/`country`/`salesperson`. No change to how Settings itself works.
- **Batch** — no immediate change; Orders' data model is what makes future batch-level profitability reporting possible (see §1), nothing in Batch needs to change today.

---

## 17. Risks

- **Resolved in Revision 5:** the tension flagged in Revision 4 between "Draft can represent a pre-decision inquiry" and "Order Status only exists post-decision" is now resolved — `Draft` means "the order record is being prepared inside CRM," always post-decision (§14). Orders do not track pre-decision opportunity, quotation, or negotiation at all. If the business wants that tracked in the future, it needs its own module/entity outside Orders — not a revival of the Revision 3 Sales Stage/Lead Source/Decision Maker/Purchase Intent fields on this table (see §18 for a V2 placeholder note).
- **Order Number daily-reset sequence is an unconfirmed assumption (§3, §19).** If the business actually wants a single ever-increasing sequence instead of a per-day reset, or a per-market/per-branch sequence, the format needs to change before implementation — resetting daily is only this document's best guess from the example given.
- **Revenue Recognition confusion is the single biggest risk in this spec overall.** If any report or dashboard widget is built filtering on Order Status = Completed alone (forgetting the AND Payment Status = Paid condition, §5), revenue will be silently overstated the moment the business starts using "complete on partial payment." This must be caught in implementation review, not discovered later in a reconciliation.
- **Migrating existing `customer_purchases` history into Orders.** If/when this migration happens, double-counting revenue in Reports during the transition is a major risk — must be a one-time, carefully-sequenced cutover, not an ongoing dual-write.
- **Concurrent reservation of a one-of-a-kind product.** Two staff attempting to add the same Product to two different orders at the same moment must be prevented (the `available → reserved` transition must be atomic/exclusive) or the business will oversell unique pieces.
- **Price/discount editability window.** If "editable while open, locked once Completed" isn't enforced strictly, historical reporting and any future AI pricing model will be trained on numbers that silently changed after the fact.
- **Sales Owner vs. Created By confusion.** If the UI doesn't visually de-emphasize Created By relative to Sales Owner, staff may edit/rely on the wrong field, or Reports may accidentally attribute performance to Created By instead of Sales Owner. Mitigate with clear UI hierarchy (§13), not by merging the two fields.
- **`Cancelled` → `Lost` is a pure rename of the same underlying concept** (Revision 3) — there is no new state or new master-data meaning, only vocabulary. The risk is purely one of consistency: every place the old name appeared (UI copy, master-data category name, report labels) must be updated together. (The earlier Revision 3 `Order Source` → `Lead Source` rename is now moot — the Lead Source field itself was removed entirely in Revision 5.)
- **Mandatory Lost Reason could add friction to quickly marking an order Lost** (e.g. staff made a data-entry mistake and just wants to void a draft). Keep the `lost_reason` list short and include a generic "Other/Mistake" option so this never blocks a legitimate quick action.
- **Free-text note fields.** Left unconstrained, they become a dumping ground that's unusable for both reporting and AI without a cleanup/NLP pass later — acceptable for V1 as long as this is a known, accepted limitation rather than a surprise. Applies equally to the Gift Note free-text field and the order-level Note field.
- **Certificate Reference is display-only in V1 — do not let staff or customers assume it's a verification link.** Building a real per-lab lookup URL prematurely (guessing at a lab's URL pattern) risks showing an incorrect or broken link, which is worse for trust than no link (§10).
- **Packaging/Gift pricing scope creep.** Both fields are explicitly display/fulfillment-only in V1 with zero pricing impact (§11, §12) — if a future request tries to attach a surcharge to premium packaging, that is a real pricing-model change requiring its own review, not a quiet UI tweak.
- **Underspecifying Payment as its own table now avoids a bigger risk later** — if V1 had instead put a single `amount_paid` column on `orders`, adding deposits/installments in V2 would require a breaking schema change and a data migration. Modeling Payment as its own table from day one avoids that redesign even though V1's UI only exposes simple payment recording.
- **Order-level discount is deliberately excluded from V1**, but the schema (`discount_total` as a rollup, not the source of truth) should not block adding a genuine order-level discount field later without re-deriving historical rollups.

---

## 18. Future Versions

**V1 (this sprint's design target — kept intentionally small):**
- Order header + Order Items + Payments + Order Events (as designed above).
- Order Number, format `OD-{YYYYMMDD}-{6-digit sequence}` (§3).
- Order statuses: Draft, Reserved, Completed, Lost — Draft strictly post-decision (§14).
- Payment statuses: Unpaid, Partially Paid, Paid — derived from Payments, with no cap on payment count.
- Revenue Recognition rule: Completed AND Paid (§5).
- Sales Ownership: Sales Owner (reassignable) distinct from Created By (immutable) (§6).
- Lost Reason captured when an order is marked Lost (§4).
- Product Lifecycle: Available/Reserved/Sold, fully Order-driven (§7).
- Order Timeline (simplified, UI-facing) alongside the detailed Order Event Timeline (§8).
- Per-line price confirmation, per-line discount, per-line Gift tracking, per-line Packaging Option.
- Certificate Reference displayed read-only via live Product join, no verification link.
- Order List, Order Detail, Create Order, Payment recording, Customer history integration.
- Reports/Dashboard read from Completed-and-Paid Orders.

**V2 (explicitly not in V1):**
- Return/Refund flow for Completed orders (reopening a completed sale, reversing inventory, handling overpayment/credit notes).
- Order-level discount (in addition to per-line discount).
- Printable invoice/receipt export, including a gift receipt variant.
- Manager-approval workflow for discounts above a threshold.
- Automatic `customer_stage` upgrade suggestions based on completed order value.
- Migration of legacy `customer_purchases` data into Orders.
- Real per-lab certificate verification links.
- Packaging/gift-wrap pricing (a genuine line-item add-on, not display-only).
- A separate Opportunity/Pipeline entity for pre-decision inquiry, quote, and negotiation tracking (Lead Source, Sales Stage, Decision Maker, Purchase Intent, Expected Close Date, Next Follow-up Date) — explicitly **not** part of Orders per Revision 5; if the business still wants this tracked, it needs its own design as a distinct module.

**V3 (explicitly not in V1 or V2):**
- AI-assisted price/discount suggestions at the "Confirm prices" step.
- AI upsell/cross-sell product suggestions during "Select products."
- Predictive cancellation/payment-risk scoring, if the business wants it later — would need its own schema design, since no opportunity-score field is reserved in this version of Orders (the Revision 3 AI Opportunity Score reservation was removed in Revision 5).
- Multi-currency support.
- External payment gateway / e-invoicing / tax-compliance integration.
- Loyalty points tied to completed Orders.

---

## 19. Acceptance Checklist

**Business**
- [ ] Product Owner confirms the workflow in §2 matches how a real in-store sale happens.
- [ ] Product Owner confirms per-line (not order-level) discount is sufficient for V1.
- [ ] Product Owner confirms a Completed order being un-editable (no in-place refund) is acceptable for V1.
- [ ] Product Owner confirms the Revenue Recognition rule (Completed AND Paid, §5) matches accounting/finance expectations.
- [ ] Product Owner confirms the Sales Owner / Created By distinction (§6) matches how deal handoffs actually work.
- [ ] Product Owner confirms mandatory Lost Reason when marking an order Lost (§4) is acceptable staff friction.
- [ ] Product Owner confirms Gift Tracking and Packaging Option are display/fulfillment-only with zero pricing impact for V1 (§11, §12).
- [ ] Product Owner confirms Certificate Reference display is read-only with no verification link in V1 (§10).
- [ ] **Product Owner confirms Orders explicitly do not track opportunity, quotation, or negotiation** (Revision 5, item 1) — any future pipeline/CRM opportunity tracking is understood to require a separate, not-yet-designed module (§18).
- [ ] **Product Owner confirms the `Draft` status definition** — "the order record is being prepared inside CRM," always post-decision (§14, Revision 5 item 2).
- [ ] Product Owner confirms the Order Number format `OD-{YYYYMMDD}-{6-digit sequence}` (§3, Revision 5 item 3) and the daily-reset-sequence assumption flagged in §17.
- [ ] Product Owner confirms the simplified Order Timeline (`Created → Reserved → Payment → Completed`, §8) is the right at-a-glance progress view for Order Detail.
- [ ] Product Owner confirms a gift line must always reference a real Product, with no free-text gift item name, is acceptable (§11).

**Database**
- [ ] Four-table design (`orders`, `order_items`, `payments`, `order_events`) reviewed and approved — no SQL written yet.
- [ ] Confirmed no existing table (`customers`, `products`, `product_batches`) needs a column changed for V1.
- [ ] Confirmed snapshot fields (Snapshot Sale Price, discount) are understood as intentional, not accidental duplication (§9).
- [ ] Confirmed the three new master-data categories (`payment_method`, `lost_reason`, `packaging_type`) match the generic Settings pattern.

**UI**
- [ ] Order List, Order Detail, Create Order, Payment, and Customer History screens reviewed against §13, including the Order Timeline, Sales Owner vs. Created By display, and Order Event Timeline.
- [ ] Confirmed no existing screen (Customer, Product, Settings) needs a design change to support V1.

**Testing**
- [ ] Reservation race condition (two orders, one product) identified as a required test case before build.
- [ ] Inventory transition test cases identified: add-to-order, complete, mark Lost (§7).
- [ ] Payment-status derivation test cases identified: unpaid → partial → paid boundaries, including payments logged after Completion.
- [ ] Revenue Recognition boundary test identified: a Completed order with Partially Paid status must **not** appear in revenue totals (§5).
- [ ] Marking-Lost-blocked-without-Lost-Reason test identified (§4).
- [ ] Sales Owner reassignment test identified: Created By never changes when Sales Owner is reassigned (§6).
- [ ] Order Number generation test identified: format and daily-reset-sequence behavior, including same-day concurrent order creation (§3, §17).

**Release**
- [ ] V1 scope explicitly excludes everything listed under V2/V3 (§18) — no scope creep at build time, in particular no packaging/gift pricing, no certificate verification links, and no opportunity/pipeline tracking on Orders.
- [ ] This document stored at `/docs/ORDERS_SPEC.md` and reviewed before any implementation ticket is opened.
