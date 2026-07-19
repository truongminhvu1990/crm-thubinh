# Orders Module — Database Design

**Sprint:** 1 — Phase 2
**Module:** Orders V1
**Status:** Draft — awaiting Product Owner Database Design approval (per `PROJECT_MANIFEST.md`'s workflow: Business Design → Product Review → **Database Design** → Product Review → UI Design).
**Phase:** Database design only. No SQL, no migrations, no Prisma, no Supabase, no TypeScript were written for this document.
**Based on:** `docs/ORDERS_SPEC.md`, Revision 5 (Final Product Review) — **approved and locked**. This document does not redesign, reinterpret, or add business logic; every table and field below traces back to an already-approved section of that spec, cited inline as (Spec §N).

---

## 1. Database Overview

Orders introduces **four new tables** — `orders`, `order_items`, `payments`, `order_events` — implementing the header/line/payment/audit-log structure approved in `ORDERS_SPEC.md`. No existing table (`customers`, `products`, `product_batches`, `master_data`) is altered by this design; Orders only *references* them.

The design follows conventions already established elsewhere in this codebase, so Orders looks and behaves like every other module already shipped (Customer, Product, Batch, Settings):

- Every table gets its own system-generated **internal identifier** as its Primary Key — the same pattern already used by `customers.id`, `products.id`, and `product_batches.id`. Business-facing identifiers (like Order Number) are a **separate, unique business field** — not the Primary Key — mirroring how `products.product_code` and `product_batches.batch_code` are business codes distinct from their internal `id`.
- Configurable picklists (Sales Owner, Created By, Lost Reason, Payment Method, Packaging Option) are **not** true database foreign keys to their own tables. They follow the same pattern already used by `products.source`, `products.salesperson`, and `customer_purchases.source`/`salesperson`: a plain reference value that must match an active entry in the existing generic `master_data` table (`category` + `value`), validated at the application layer, not by a database-level foreign key constraint. This design does not introduce a new pattern — it reuses the one already proven across Customer, Product, and Settings.
- `orders`/`order_items` follow the same **snapshot-vs-live-reference discipline** already established by `customer_purchases.source`/`salesperson` (a snapshot) versus `customer_purchases.customer_id`/`product_id` (a live reference) — see §4 below for exactly which Orders fields fall into each category.
- One new master-data categories addition is implied but **not created here**: `payment_method`, `lost_reason` (renamed from the existing `cancellation_reason` concept per Spec Revision 3), and `packaging_type` need to be added to the `master_data.category` allow-list at implementation time (Spec §16). This document only records that the dependency exists — adding the actual category values is implementation work, out of scope for a business/database design document.
- **No report or cache tables exist anywhere in this design.** Reports and Dashboard both compute live from `orders`/`order_items`/`payments` at query time — there is no report table, no materialized view, and no cached/snapshot table of any kind. See §8 and §11 for the full statement of this rule.

Four tables, no schema changes to anything that already exists, and no field introduced that isn't already named and approved in `ORDERS_SPEC.md`.

---

## 2. Tables

| Table | Role |
|---|---|
| `orders` | Header record — one row per transaction. |
| `order_items` | Line-item record — one row per product on one order. |
| `payments` | Payment-event record — one row per payment against one order. |
| `order_events` | Append-only audit log — one row per business event that happens to one order. |

---

## 3. Purpose of Each Table

### `orders`
The header of one transaction: which customer, who owns the deal, what it totals, what state it's in. Every other Orders table hangs off this one. Only ever created after the customer has decided to buy (Spec §1, §2, §14) — there is no pre-decision row anywhere in this design.

### `order_items`
One line of one order: which product, at what negotiated price, with what discount, in what quantity, and whether it's a gift and how it's packaged. This is where "confirm prices" (Spec §2, step 3) is permanently recorded.

### `payments`
One payment event against one order. Modeled as its own table — not a single running total column on `orders` — specifically so deposits, installments, and post-completion balance settlement (Spec §5) never require a schema change to support.

### `order_events`
An append-only history of everything that happened to one order — created, products added/removed, prices changed, payments added, status changed, sales owner reassigned, marked lost. Exists so Order Detail and Customer History have one reliable timeline instead of reconstructing "what happened" from `updated_at` columns, which only ever show the *last* change (Spec §8).

---

## 4. Fields

For every field: **Purpose**, **Business Data Type**, **Required / Optional**, and **Snapshot / Reference** — using four categories for the last column, since two fields are neither a snapshot nor a live reference:

- **Reference** — a live pointer to another table or master-data value; always read fresh, never copied.
- **Snapshot** — a frozen copy taken at one moment, deliberately surviving later edits elsewhere (Spec §9).
- **Native** — data that originates and lives on this row itself; not copied from anywhere and not a pointer.
- **Derived** — computed from other Orders data (never entered directly by a user).

### `orders`

| Field | Purpose | Business Data Type | Required / Optional | Snapshot / Reference |
|---|---|---|---|---|
| Internal ID | Primary Key — uniquely identifies the order row internally, never shown to staff. | Internal ID (system-generated, same pattern as `customers.id`) | Required | Native |
| Order Number | Human-readable identifier shown to staff/customers, e.g. on a receipt (Spec §3). Format `OD-{YYYYMMDD}-{6-digit sequence}`. | Text (formatted code, unique) | Required | Native |
| Customer reference | Which customer this order belongs to. | Reference (→ `customers`) | Required | Reference |
| Sales Owner | Staff member currently responsible for closing this deal; reassignable while open (Spec §6). | Reference (→ `salesperson` master data) | Required | Reference |
| Created By | Staff member who opened the order record; immutable audit fact (Spec §6). | Reference (→ `salesperson` master data) | Required | Native (set once, never re-derived) |
| Order date | When the order was opened. | Date | Required | Native |
| Lost Reason | Why the order was marked Lost (Spec §4). | Reference (→ `lost_reason` master data) | Conditional — required only when Order Status = Lost, otherwise must be empty | Reference |
| Subtotal | Sum of line totals before order-level adjustments. | Decimal (currency) | Required | Derived (from `order_items`) |
| Discount total | Rollup of all line discounts, for fast reporting; each line's own discount remains the source of truth. | Decimal (currency) | Required | Derived (from `order_items`) |
| Total amount | Final amount owed. | Decimal (currency) | Required | Derived (Subtotal − Discount total) |
| Order status | Where the order sits in the transaction workflow (Spec §14). | Enum: `Draft` / `Reserved` / `Completed` / `Lost` | Required | Native |
| Payment status | How much of the total has been paid (Spec §14). | Enum: `Unpaid` / `Partially Paid` / `Paid` | Required | Derived (from `payments`, rolled up for fast filtering) |
| Note | Free-text special requests / delivery instructions. | Text (free text) | Optional | Native |
| Created timestamp | Audit — when the row was inserted. | Timestamp | Required (system-set) | Native |
| Updated timestamp | Audit — when the row last changed. | Timestamp | Required (system-set) | Native |

### `order_items`

| Field | Purpose | Business Data Type | Required / Optional | Snapshot / Reference |
|---|---|---|---|---|
| Internal ID | Primary Key for the line row. | Internal ID (system-generated) | Required | Native |
| Order reference | Which order this line belongs to. | Reference (→ `orders`) | Required | Reference |
| Product reference | Which product this line sells (or gifts). | Reference (→ `products`) | Required | Reference |
| Snapshot Sale Price | The price actually agreed for this sale, frozen at the moment of sale (Spec §9). | Decimal (currency) | Required | **Snapshot** |
| Discount | The amount/percent actually applied to this line, frozen at the moment of sale (Spec §9). | Decimal (currency or percent) | Required (defaults to zero) | **Snapshot** |
| Quantity | Almost always 1 (unique jade pieces); present for the minority of mass-produced items. | Whole number | Required (defaults to 1) | Native |
| Line total | Snapshot Sale Price × Quantity, minus Discount. | Decimal (currency) | Required | Derived |
| Is Gift | Whether this specific line is a gift (Spec §11). | Yes/No (boolean) | Required (defaults to No) | Native |
| Gift Recipient Name | Who the gift is for; not a Customer reference — the recipient is frequently not a CRM customer at all. | Text (free text) | Conditional — only meaningful when Is Gift = Yes | Native |
| Gift Note | Occasion/message for the gift. | Text (free text) | Optional | Native |
| Packaging Option | Which packaging this line ships in (Spec §12). | Reference (→ `packaging_type` master data) | Optional (defaults to Settings' configured default) | Reference |

**Deliberately absent from this table** (Spec §9, §10): product name, code, category, color, size, weight, jade grade, certificate number, images. All of these are read live via the Product reference every time a line is displayed — none of them exist as columns here.

### `payments`

| Field | Purpose | Business Data Type | Required / Optional | Snapshot / Reference |
|---|---|---|---|---|
| Internal ID | Primary Key for the payment row. | Internal ID (system-generated) | Required | Native |
| Order reference | Which order this payment applies to. | Reference (→ `orders`) | Required | Reference |
| Amount | How much was paid in this event. | Decimal (currency, must be positive) | Required | Native |
| Payment method | How it was paid (cash, bank transfer, card, ...). | Reference (→ `payment_method` master data) | Required | Reference |
| Payment date | When the payment was made. | Date | Required | Native |
| Note | Free-text note on this payment. | Text (free text) | Optional | Native |
| Created timestamp | Audit — when the row was inserted. | Timestamp | Required (system-set) | Native |

### `order_events`

| Field | Purpose | Business Data Type | Required / Optional | Snapshot / Reference |
|---|---|---|---|---|
| Internal ID | Primary Key for the event row. | Internal ID (system-generated) | Required | Native |
| Order reference | Which order this event happened to. | Reference (→ `orders`) | Required | Reference |
| Event type | What kind of event this is (Spec §8): Order Created, Product Added, Product Removed, Price Changed, Payment Added, Status Changed, Sales Owner Reassigned, Marked Lost. | Enum / fixed picklist | Required | Native |
| Event detail | Short human-readable description of what happened. | Text (free text, system-generated) | Required | Native |
| Actor | Which staff member performed the action. | Reference (→ `salesperson` master data) | Required | Reference |
| Event timestamp | When the event happened. | Timestamp | Required (system-set) | Native |

---

## 5. Relationships

```
customers (existing)                 products (existing)
      │                                     │
      │ 1                                   │ 1
      │                                     │
      ▼ many                                ▼ many (across time, not concurrently — §8)
   orders ───────────────────────────▶ order_items
      │ 1                                     ▲
      │                                       │ many
      │ many                          (via order_items.product_id)
      ▼
   payments

   orders
      │ 1
      │ many
      ▼
   order_events
```

- **One Customer → many Orders.** An Order always belongs to exactly one Customer; a Customer may have any number of Orders over time.
- **One Order → many Order Items.** An Order groups one or more products bought in the same transaction (Spec §1's core reason for existing).
- **One Product → many Order Items, but only sequentially.** A Product may appear in several Order Items across time (if an earlier order containing it was marked Lost), but at most one **open** (Draft/Reserved) Order Item at once (Spec §4, §7).
- **One Order → many Payments.** No upper limit, no requirement that payments happen before Completion (Spec §4, §5).
- **One Order → many Order Events.** Every business event on that order gets its own append-only row (Spec §8).
- **Order Items and Payments and Order Events do not relate to each other directly** — they only relate to `orders`, which is the hub. This keeps the model a clean star shape around `orders`, matching the "Orders is the central transaction record" framing in Spec §1.

### Product Status Flow

```
Available
   ↓
Reserved
   ↓
Sold

Reserved
   ↓
Lost
   ↓
Available
```

- **Available → Reserved:** a Product is reserved the moment it's added to an open Order Item (Spec §7).
- **Reserved → Sold:** a Product becomes Sold when its Order reaches `Completed` (Spec §7). **`Sold` is terminal in V1** — there is no transition out of it. A Completed order cannot become Lost (Spec §4), so a Sold Product cannot cycle back to Available in this version.
- **Reserved → Lost → Available:** a Product returns to Available when its Order is marked `Lost` while still Draft/Reserved (Spec §4, §7) — this is the only path back to Available.
- **Return/Refund is explicitly V2-only** (Spec §18) — it is the future mechanism that would let a Sold Product move again; nothing in V1's schema or state machine supports it.

---

## 6. Primary Keys

Every table gets its own **system-generated internal identifier** as its Primary Key — the same generation pattern already used by `customers.id`, `products.id`, and `product_batches.id` elsewhere in this codebase:

- `orders` — Internal ID.
- `order_items` — Internal ID.
- `payments` — Internal ID.
- `order_events` — Internal ID.

**Order Number is deliberately not the Primary Key.** It is a separate, unique, human-facing business field (Spec §3) — exactly the same relationship `products.product_code` and `product_batches.batch_code` already have to their own internal `id` columns in this codebase. Keeping them separate means the Order Number format (§3, §14 of this document) can evolve later (as it already has once, in Spec Revision 5) without touching the internal identifier anything else references.

---

## 7. Foreign Keys

| From | To | Business Meaning | Required? |
|---|---|---|---|
| `orders.customer` | `customers` | Which customer owns this order. | Required — every Order must have a Customer. |
| `order_items.order` | `orders` | Which order this line belongs to. | Required — an Order Item cannot exist without a parent Order. |
| `order_items.product` | `products` | Which product this line sells/gifts. | Required — no free-standing, non-inventory line items exist in V1 (Spec §11). |
| `payments.order` | `orders` | Which order this payment applies to. | Required — a Payment cannot exist without a parent Order. |
| `order_events.order` | `orders` | Which order this event describes. | Required — an Order Event cannot exist without a parent Order. |

**Sales Owner, Created By, Lost Reason, Payment Method, Packaging Option, and Order Event Actor are *not* true foreign keys** in the database sense — they are text/reference values validated against the `master_data` table's `category`+`value` pairing, the same pattern `products.source`/`salesperson` already use. This is a deliberate consistency choice, not an oversight: introducing a real foreign-key relationship to `master_data` here, while every other module still uses the plain-value pattern, would make Orders behave differently from Customer/Product/Settings for no user-facing benefit — see §13 (Risks) for the integrity trade-off this implies.

**Customer lifecycle note:** the CRM does not support Customer deletion at all — a Customer only ever moves between `Active`, `Inactive`, and `Archived` (an existing Customer-module concept, unrelated to Orders). There is therefore no Customer-deletion scenario for this design to account for: an Order's Customer reference is never at risk of pointing at a removed row, regardless of what status the Customer is in — an Archived Customer's Orders remain fully intact and queryable, exactly like an Active Customer's.

**Deletion behavior (business-level, no SQL):**
- **Product → Order Items:** a Product that is referenced by any Order Item must **not** be deletable — doing so would break Snapshot Sale Price traceability and the live Certificate Reference lookup (Spec §10) for every past order that sold it.
- **Order → Order Items / Payments / Order Events:** these three child tables only make sense attached to their parent Order, so if an Order row were ever removed, its children should go with it. In practice, per the Project Rules' "never delete or truncate data" constraint and the fact that V1 has no "delete order" action anywhere in the UI (Spec §13) — an Order is abandoned via `Lost`, never deleted — this deletion behavior is expected to never actually fire in normal use. It exists only as a data-integrity backstop, not a supported workflow.

---

## 8. Business Constraints

(No SQL — these are the rules the schema must uphold, translated from `ORDERS_SPEC.md`.)

- **Order Number is unique** across all orders, and immutable once assigned (Spec §3) — never reused, even for a Lost order.
- **A Product may belong to at most one open (Draft/Reserved) Order Item at a time.** This is a conditional uniqueness rule — scoped to *open* order items only, not all order items ever created for that product (Spec §4, §7). This is the single most important constraint in the whole design: violating it means overselling a one-of-a-kind piece.
- **Order Status must be exactly one of:** `Draft`, `Reserved`, `Completed`, `Lost` — no other value, and no status representing a pre-decision state exists anywhere in this design (Spec §14).
- **Payment Status must be exactly one of:** `Unpaid`, `Partially Paid`, `Paid`, and must always be system-derived from the sum of Payments versus Total amount — never directly settable by a user-facing write (Spec §4, §14).
- **Lost Reason is required when, and only when, Order Status = Lost** — a conditional-required rule, not a plain NOT NULL (Spec §4, §7).
- **Sales Owner, Created By, Lost Reason, Payment Method, and Packaging Option values must match an active entry** in the relevant `master_data` category — application-enforced, per §7 above.
- **A disabled Master Data item must not affect historical display.** If a Sales Owner/Created By/Lost Reason/Payment Method/Packaging Option value is disabled in Settings (`master_data.is_active = false`), every Order, Order Item, Payment, or Order Event that already stored that value before it was disabled must continue displaying it correctly. Disabling only removes a value from *future* selection pickers — it must never be deleted from `master_data`, and it must never cause an existing row's stored value to disappear, blank out, or error when displayed.
- **Reports never store data.** There is no report table, no cache table, and no materialized/snapshot table anywhere in this design. Reports always calculates live from `orders`, `order_items`, and `payments` at query time, filtered by the Revenue Recognition rule (Spec §5) — the same "compute at query time, nothing to keep in sync" pattern already used for Payment Status and Revenue Recognized (§4 above).
- **Once Order Status = Completed, Snapshot Sale Price and Discount on every Order Item of that order become immutable.** No further edit is permitted through any normal application path (Spec §4) — an application-level lock, since the underlying pattern (plain reference values, no DB-level FK) means this can't be enforced by a database trigger without introducing new machinery this codebase doesn't otherwise use.
- **Quantity must be a positive whole number** (at least 1).
- **Payment Amount must be a positive number** (greater than zero) — overpayment is allowed (Spec §4) but a zero or negative payment is not.
- **A Gift line (Is Gift = Yes) must still reference a real Product** — there is no free-text "gift item name" path, and no nullable-Product gift row is permitted (Spec §11).
- **No certificate status field exists anywhere in this schema** (Spec §10) — Certificate Reference is read live from `products.certificate_no`; enforced structurally by the simple absence of any such column on `order_items`.
- **No customer profile field (name, phone, market, etc.) is ever stored on `orders`** — enforced structurally by the absence of those columns; always read live via the Customer reference (Spec §9).
- **`order_events` is append-only** — rows are only ever inserted, never updated or deleted, by any normal application code path (Spec §8).
- **An order can only be marked Lost while Draft or Reserved** — never from Completed (Spec §4); this is a status-transition constraint, not a column-level constraint, and must be enforced by the application's status-change logic.

---

## 9. Business Index Strategy

(No SQL — the business access patterns this data model must serve quickly.)

| Access pattern | Why it needs to be fast | Index target |
|---|---|---|
| Look up an order by its Order Number | Staff searching by receipt number (Spec §13) | `orders` — Order Number (unique) |
| List all Orders for one Customer | Customer Detail purchase history (Spec §1, §13) | `orders` — Customer reference |
| Filter Order List by Order Status and/or Payment Status | Order List filters, and — critically — the Revenue Recognition query, which always filters on *both* fields together (Spec §5) | `orders` — Order Status + Payment Status combined |
| Filter/sort Orders by date, or by Sales Owner | Order List filters, Reports "By Sales Owner," Dashboard date-range KPIs (Spec §1, §13, §16) | `orders` — Order date; `orders` — Sales Owner |
| Enforce "at most one open Order Item per Product" and show a Product's order history | The single most important business constraint (§8 above) plus Product Detail's purchase history | `order_items` — Product reference (scoped/conditional on open orders for the constraint check) |
| Fetch all lines for one Order | Order Detail line-items table (Spec §13) — the most frequent Order Detail query | `order_items` — Order reference |
| Fetch all payments for one Order, compute remaining balance | Order Detail payments list and running balance (Spec §13) | `payments` — Order reference |
| Analyze payments by method or date range | Reports payment-method/date-based analysis (Spec §15) | `payments` — Payment date |
| Fetch an Order's full activity log in chronological order | Order Detail's Order Event Timeline (Spec §8, §13) — always read as one ordered block per order | `order_events` — Order reference + Event timestamp, combined |

No index is proposed purely for a hypothetical future query — every entry above ties directly to a screen or report already named in `ORDERS_SPEC.md`.

---

## 10. Data Flow

```
Customer
   ↓  (Order created only after purchase decision — Spec §1, §2, §14)
Order
   ↓  (products added, prices confirmed — Order Items created/updated)
Order Item
   ↓  (payments recorded against the Order total)
Payment
   ↓  (Order Status = Completed AND Payment Status = Paid — Spec §5)
Reports
   ↓  (Completed-and-Paid Orders roll up into revenue/discount/lost-rate aggregates)
Dashboard
```

**Narrative:**

1. **Customer** — an existing Customer is picked; nothing is written to Orders yet.
2. **Order** — an `orders` row is created in `Draft` (Spec §14), carrying Order Number, Customer reference, Sales Owner, Created By, and Order date. Subtotal/Discount total/Total amount all start at zero.
3. **Order Item** — as products are added, `order_items` rows are created, each flipping its Product from `available` to `reserved` (Spec §4, §7). Confirming a price/discount writes the Snapshot Sale Price and Discount for that line; `orders`' rollup totals (Subtotal, Discount total, Total amount) are recomputed.
4. **Payment** — `payments` rows are inserted as staff records deposits/installments/settlement; `orders.payment_status` is recomputed from the sum each time. This can continue even after the Order reaches `Completed` (Spec §5).
5. **Reports** — the moment an Order is *both* `Completed` and `Paid` (Spec §5), it becomes visible to revenue aggregations. An Order that is `Completed` but not yet `Paid` is fully visible everywhere else (Order List, Customer History) but excluded from revenue totals until it crosses that line — no new row, no re-entry, just a live filter.
6. **Dashboard** — reads the same Completed-and-Paid Orders (plus pending-payment and recently-completed views that don't require the full Revenue Recognition gate) to refresh its KPI cards.

Every arrow in this chain is either an insert into one of the four Orders tables or a derived recomputation of an existing rollup field — nothing here requires touching `customers` or `products` beyond reading them for reference and writing their `available`/`reserved`/`sold` counters (Spec §7).

---

## 11. Module Relationships

| Module | Database-level relationship to Orders |
|---|---|
| **Customer** | `orders.customer` is a required Foreign Key to `customers`. No write ever goes the other direction — Orders never modifies a `customers` row. Customer Detail's purchase history reads `orders` (+ joins) instead of `customer_purchases` once Orders ships. |
| **Product** | `order_items.product` is a required Foreign Key to `products`. Orders is the only module permitted to write `products.available`/`reserved`/`sold` going forward (Spec §7, §16) — every other write path to those three columns is superseded. `products.sale_price`/`discount`/`certificate_no` are read, never written, by Orders. |
| **Batch** | No direct relationship — `product_batches` is only reachable transitively via `order_items.product → products.batch_id`. No Orders table references `product_batches` directly in V1; batch-level profitability reporting (a Reports-side join) is enabled by this data model but not built in V1 (Spec §1). |
| **Inventory** *(fields on `products`, not its own table today)* | Entirely driven by Orders: `available → reserved` when an Order Item is added, `reserved → sold` on Completion, `reserved → available` on Lost (Spec §4, §7). Orders is the sole legitimate writer of these counters. |
| **Reports** | **Reports never store data.** There is no Reports table anywhere in this design, and none is implied — Reports always calculates live from `orders` + `order_items` + `payments` at query time, filtered by the Revenue Recognition rule (Completed AND Paid, Spec §5), to produce revenue, discount, and lost-rate-by-reason aggregates (Spec §15, §16). No cached or precomputed report data exists; nothing is written by Orders into Reports, and nothing in Reports can ever drift out of sync with the underlying Orders rows, because it is never copied in the first place. |
| **Dashboard** | Reads the same Completed-and-Paid `orders` rows as Reports, plus a broader read of `orders`/`payments` for pending-payment and recently-completed KPI cards that don't require the full revenue gate. Read-only, same as Reports — no Dashboard table stores or caches data either. |
| **Settings** | Supplies the `master_data` rows that `orders.sales_owner`/`created_by`/`lost_reason`, `payments.payment_method`, and `order_items.packaging_option` validate against. Three new `master_data` categories are implied (`payment_method`, `lost_reason`, `packaging_type`) but not created by this document (§1 above) — that's implementation work. Disabling a `master_data` value in Settings (`is_active = false`) must never affect how an already-stored Order/Order Item/Payment displays that value — disabling only hides it from *future* pickers (§8). |

---

## 12. AI Readiness

How each table supports future AI work (Spec §15 already rates individual fields; this section summarizes at the table level):

### `orders`
The header row is the natural join key for almost every customer-transaction model: customer lifetime value, churn, sales-performance-by-owner, seasonality (Order date), lost-rate and win/loss analysis (Order Status + Lost Reason), and discount-sensitivity (Discount total vs. Total amount). Because Order Status and Payment Status are clean, small, derived enums rather than free text, they're immediately usable as structured model features with no cleanup pass needed.

### `order_items`
The per-line grain is what makes product-level and category-level modeling possible: which specific pieces sell, which get discounted most (Snapshot Sale Price vs. Product's list price), cross-sell/basket patterns (multiple lines per order), and — once joined through `products.batch_id` — real margin analysis against Batch cost. The Is Gift flag is a ready-made structured feature for gift-buying seasonality per customer.

### `payments`
A time-series of payment events per order is exactly the shape needed for payment-behavior modeling: who tends to pay in full vs. deposit-and-installment, which payment methods correlate with which customer segments, and time-to-pay-off patterns once enough history accumulates.

### `order_events`
The append-only, timestamped event log is the one table in this design built specifically to serve *future* AI rather than today's screens (Spec §8) — it's the only place duration/velocity signals can be derived from (e.g., time from `Reserved` to `Completed`), since every other table only ever stores current state, not the history of how it got there. No model consumes this table in V1; it exists so that history isn't lost while a model doesn't exist yet, the same reasoning already applied to modeling `payments` as its own table instead of a single running total.

**What was deliberately kept out of AI-readiness scope:** free-text fields (`orders.note`, `payments.note`, `order_items.gift_note`) are acknowledged as NLP-only, not raw structured features, consistent with Spec §15's field-by-field rating — no attempt is made here to structure them further, since doing so would be redesigning business logic, not database design.

---

## 13. Risks

- **Concurrent reservation of a one-of-a-kind Product is the single biggest risk in this schema.** The "at most one open Order Item per Product" constraint (§8) must be enforced atomically at write time; a naive check-then-insert from the application layer has a race window where two staff could both reserve the same piece a few milliseconds apart. This needs a real concurrency-safe mechanism at implementation time, not just an application-level `if` check.
- **Order Number generation is a second concurrency risk.** Two orders created in the same second, on the same day, must never receive the same sequence number — the daily-reset sequence (Spec §3, flagged as an unconfirmed assumption in Spec §17) needs an atomic counter at implementation time, not a "read max, add one" pattern.
- **Master-data-as-plain-text-reference has no real referential integrity — but only for renames/hard-deletes, not for disabling.** Because Sales Owner, Lost Reason, Payment Method, and Packaging Option are validated at the application layer rather than by a database foreign key (§7 above, matching the existing `products.source`/`salesperson` pattern), a typo, a renamed master-data value, or a direct hard-delete of a `master_data` row could silently produce an order referencing a value that no longer resolves to anything. Ordinary **disabling** (`is_active = false`) is explicitly safe by design (§8) — the row stays in `master_data`, so historical Orders keep resolving it correctly; only the picklist stops offering it for new entries. This is an accepted, pre-existing trade-off in this codebase, not new to Orders — but it's worth naming here because Orders leans on it more heavily (five fields) than any prior module.
- **`order_events` being append-only is an application-layer promise, not a database-enforced one** in this design (§8) — nothing here structurally prevents a future code path from issuing an UPDATE or DELETE against it. If the append-only guarantee matters as much as Spec §8 implies (and it does, for audit trust), implementation should seriously consider a stronger enforcement mechanism than "no code path currently does this."
- **Snapshot immutability post-Completion is also application-enforced, not database-enforced** (§8) — same category of risk as the two points above: nothing here stops a direct write from bypassing the rule.
- **Rollup drift.** `orders.subtotal`/`discount_total`/`total_amount`/`payment_status` are all derived/rollup values recomputed from child rows (§4). If any code path updates an `order_items` or `payments` row without also recomputing the parent rollups, the `orders` row silently goes stale — this is the same category of risk Spec §17 already flags for Revenue Recognition specifically, but it applies to every rollup field, not just the two status fields.
- **Migrating `customer_purchases` history into Orders** (Spec §17, carried over) remains a risk at the database level too: a naive migration would need to fabricate Order Numbers, Order Items, and a single "migration" Payment per historical row, and get the sequencing right so it doesn't collide with live Order Number generation on the day of cutover.

---

## 14. Future Expansion

Carried forward from `ORDERS_SPEC.md` §18, translated into what it means for this data model specifically:

- **Return/Refund (V2)** will need either a new table (e.g. a `refunds`/`returns` table mirroring `payments`) or reversing entries against `order_items` — this design deliberately does not guess at that shape now, since Spec §18 defers it.
- **Order-level discount (V2)** fits into the existing `orders.discount_total` rollup without a breaking change — it was deliberately modeled as a rollup rather than "the source of truth" for exactly this reason (Spec §17).
- **Real per-lab certificate verification links (V2)** need no schema change here at all — Certificate Reference is read live from `products.certificate_no`; only Product's schema would ever need to grow a verification-URL field, not Orders'.
- **Packaging/gift-wrap pricing as a real line-item add-on (V2)** would need a new column or a related row on `order_items` (e.g. a packaging surcharge amount) — not present in this design, since V1's Packaging Option is explicitly display/fulfillment-only (Spec §12).
- **A separate Opportunity/Pipeline entity (V2, if the business still wants it)** would be an entirely new table set outside Orders — Spec §18 is explicit that this is not an Orders concern, and this database design reflects that by having no trace of Lead Source, Sales Stage, Decision Maker, Purchase Intent, Expected Close Date, or Next Follow-up Date anywhere in the four tables above.
- **Predictive scoring (V3)**, if ever pursued, has no reserved column anywhere in this schema (the Revision 3 AI Opportunity Score reservation was removed in Spec Revision 5) — it would need its own schema addition at that time, informed by whatever `order_events` history has accumulated by then (§12 above).
- **Multi-currency (V3)** would require every currency-typed field in §4 (Snapshot Sale Price, Discount, Line total, Subtotal, Discount total, Total amount, Payment Amount) to carry a currency designator — not needed for V1's single-currency scope.

---

## 15. Acceptance Checklist

**Structure**
- [ ] Product Owner confirms the four-table structure (`orders`, `order_items`, `payments`, `order_events`) matches the approved `ORDERS_SPEC.md` design (§2, §3).
- [ ] Product Owner confirms every field in §4 traces to an already-approved spec field — no field was added, renamed, or reinterpreted during database design.
- [ ] Product Owner confirms no existing table (`customers`, `products`, `product_batches`, `master_data`) needs a structural change to support Orders (§1).
- [ ] Product Owner confirms the explicit "Reports never store data / no report or cache tables" rule (§1, §8, §11) is the intended architecture going forward.

**Keys & References**
- [ ] Product Owner confirms Order Number as a separate unique business field (not the Primary Key) is the right pattern, matching `product_code`/`batch_code` (§6).
- [ ] Product Owner confirms the master-data-as-plain-reference pattern (Sales Owner, Created By, Lost Reason, Payment Method, Packaging Option) is acceptable for Orders, consistent with the existing `products.source`/`salesperson` pattern, despite the integrity trade-off flagged in §13.
- [ ] Product Owner confirms the Master Data disabled-value display rule (§8, §13) — a disabled value must never break historical display on an existing Order/Order Item/Payment.

**Constraints & Performance**
- [ ] Product Owner (with implementation input) confirms the "at most one open Order Item per Product" constraint and the Order Number generation both need a concurrency-safe mechanism before build (§8, §13) — flagged as the two biggest risks in this document.
- [ ] Product Owner confirms the proposed index strategy (§9) covers every access pattern that matters, especially the combined Order Status + Payment Status index needed for Revenue Recognition queries.
- [ ] Product Owner confirms application-layer (rather than database-layer) enforcement of append-only Order Events and post-Completion Snapshot immutability is acceptable for V1, given the risks named in §13.

**Data Flow & AI**
- [ ] Product Owner confirms the Data Flow (§10) and Module Relationships (§11) accurately reflect how Orders should connect to Customer, Product, Batch, Inventory, Reports, Dashboard, and Settings.
- [ ] Product Owner confirms the AI Readiness framing (§12) — particularly that `order_events` exists partly to serve future AI, not just V1 screens — is still the intended reasoning.

**Release**
- [ ] This document stored at `/docs/ORDERS_DATABASE.md` and reviewed before UI Design (the next phase per `PROJECT_MANIFEST.md`'s workflow) begins.
- [ ] Confirmed this document contains no SQL, no migration, no Prisma, no Supabase, and no TypeScript — design only, per the Sprint 1 Phase 2 task rules.
