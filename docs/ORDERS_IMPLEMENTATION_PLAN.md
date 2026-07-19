# Orders Module — Implementation Plan

**Sprint:** 1 — Phase 4 ("Orders Foundation")
**Module:** Orders V1
**Status:** Planning only — no code written for this document, per task instructions.
**Based on (all read this pass, all still LOCKED per `PROJECT_MANIFEST.md`'s Module Status table — "Orders: IN PROGRESS"):** `docs/PROJECT_MANIFEST.md`, `docs/ORDERS_SPEC.md` (Rev. 5), `docs/ORDERS_DATABASE.md`, `docs/ORDERS_UI.md`.

This document does not redesign business rules, does not reinterpret any approved doc, and does not add scope. Every task below maps to a screen/rule/field already named in one of the four locked documents above. It only inventories what exists today (verified by direct inspection, not assumption) versus what those documents require, and sequences the gap.

---

## 0. Blocker — must clear before any task below can start

**The Development database does not match `ORDERS_DATABASE.md`.** Verified live via the app's own anon key (read-only, no DDL run):

| Table | Live state |
|---|---|
| `orders` | Exists, but still the **old legacy schema** (`order_code`, `employee_id`, `payment_method`, `status`) — querying the approved columns (`order_number`, `sales_owner`, `order_status`, etc.) fails with `42703 column does not exist`. |
| `order_items` | Exists, but missing approved columns (`snapshot_sale_price` → `42703`). |
| `payments` | Does not exist (`PGRST205`). |
| `order_events` | Does not exist (`PGRST205`). |

`supabase/migrations/20260712_orders_reset.sql` (already drafted, approved-plan-backed, single transaction) has not actually been applied to this Development project. I have no DDL execution path (anon key only) — this requires the Product Owner or ops tooling with a service-role/DB-password connection to run it. **Every task in this plan except Task 1 itself is blocked until this is resolved**, since the repository layer cannot be extended or tested against columns that don't exist without reproducing the exact silent-failure pattern already seen twice in this project's history (queries fail, errors are caught, pages render empty instead of erroring).

---

## 1. Current State — reviewed this pass

### Database
- Legacy/broken — see §0. Indexes/RLS/policies not yet checked; moot until tables match.

### Repository (`lib/orders/order.repository.ts`)
- `findAllOrders`, `findOrderById`, `findOrderItemsByOrderId` — read-only, joins `customers`/`products`. No write functions exist yet (no create/update anywhere in `lib/orders/`).

### Service (`lib/orders/order.service.ts`)
- `getOrderList` (adds `item_count`), `getOrderDetail` (order + items only). No payments, no events, no derived Order Timeline, no totals recomputation, no status-transition logic.

### UI / Routes / Components
- `app/orders/page.tsx` (List) and `app/orders/[id]/page.tsx` (Detail) exist and build/route correctly. Components: `OrderTable`, `OrderDetailHeader`, `OrderLineItemsTable`, `OrderStatusBadge`. Sidebar's "Đơn hàng" is enabled.
- **Everything else in `ORDERS_UI.md` is unbuilt**: Create Order, Edit Order (inline price/product edit), Add Payment modal, Payment History list, Order Timeline (simplified bar), Order Event Timeline, Quick View popup, Mark as Lost flow, Reassign Sales Owner, Customer Detail → Purchase History redesign.

### Types (`types/order.ts`)
- `Order`, `OrderItem`, `OrderPayment`, `OrderEvent` interfaces already match `ORDERS_DATABASE.md` §4 field-for-field (kept as inert types since the Sprint 1.1 rollback, per project memory). No gap here for V1's data shape.

### Validation
- None exists yet — no client-side or service-layer validation anywhere in `lib/orders/`. `ORDERS_UI.md` §17's full validation-message table is unbuilt.

### Reports impact
- `lib/report.service.ts` still reads exclusively from `customer_purchases` (confirmed via direct read) — **zero Orders-related change has landed in Reports yet**, consistent with `ORDERS_SPEC.md` §16/`ORDERS_DATABASE.md` §11 deferring that cutover. Out of scope for Orders Foundation itself; flagged only so it isn't mistaken for "done."

### Settings / master data
- `types/masterData.ts`'s `MasterDataCategory` union does **not** yet include `payment_method`, `lost_reason`, or `packaging_type` (confirmed by direct read) — the three new categories `ORDERS_SPEC.md` §16 / `ORDERS_DATABASE.md` §1 require. Nothing in `app/settings` manages them yet.

---

## 2. Task List

Ordered by dependency chain, not just business priority — most later tasks are blocked by earlier ones regardless of relative importance.

| # | Task | Priority | Est. Effort | Dependencies | Expected Output |
|---|---|---|---|---|---|
| 1 | **Apply `20260712_orders_reset.sql` to Development** (execution only — file already drafted/approved) | **Blocker** | Ops action, ~5 min | Product Owner / ops with DDL access | 4 tables live, matching `ORDERS_DATABASE.md` §4 exactly; verification queries at the bottom of the migration file all pass |
| 2 | Add `payment_method`, `lost_reason`, `packaging_type` to `MasterDataCategory` + seed their `master_data` rows via Settings (or a small seed script) | High | Small (~1–2 hrs) | Task 1 | Settings' existing generic CRUD screen manages all three; picklists available for Tasks 4/6/8 |
| 3 | Repository: add write functions — `createOrder`, `addOrderItem`, `removeOrderItem`, `updateOrderItemPrice`, `addPayment`, `markOrderLost`, `completeOrder`, `reassignSalesOwner`, plus an atomic "claim product" primitive for the concurrency constraint (`ORDERS_DATABASE.md` §8/§13's top-named risk) | High | Large | Task 1 | `lib/orders/order.repository.ts` write-side, no UI wired yet |
| 4 | Service: order-number generation (`OD-{YYYYMMDD}-{6-digit sequence}`, daily-reset, concurrency-safe per `ORDERS_SPEC.md` §3/§17), rollup recomputation (subtotal/discount/total/payment_status), Order Timeline derivation (§8), event-log writes on every mutation | High | Large | Task 3 | `lib/orders/order.service.ts` write-side + derived-state logic |
| 5 | Product Lifecycle wiring: `available → reserved → sold` / `reserved → available` transitions on the `products` table, scoped to Orders as sole writer (`ORDERS_SPEC.md` §7, §16) | High | Medium | Task 3 | Product status transitions fire correctly from Order actions; no other write path touches these three counters going forward |
| 6 | UI: Create Order (4-step single-scroll screen, `ORDERS_UI.md` §4) | High | Large | Tasks 2, 3, 4, 5 | New route + components; produces Draft/Reserved orders |
| 7 | UI: Order Detail — Edit mode (inline price/product edit, Reassign Sales Owner, Mark as Lost modal, Complete action, action-bar visibility rules — `ORDERS_UI.md` §5, §6, §10) | High | Large | Tasks 3, 4, 5 | Order Detail becomes a full read/write hub, not read-only |
| 8 | UI: Add Payment modal + Payment History list + remaining-balance display (`ORDERS_UI.md` §7, §8) | High | Medium | Tasks 3, 4 | Payments fully recordable/visible on Order Detail |
| 9 | UI: Order Timeline (simplified bar) + Order Event Timeline (detailed log) on Order Detail (`ORDERS_UI.md` §9) | Medium | Medium | Tasks 4, 7, 8 | Both widgets rendered per spec, sourced from `order_events` |
| 10 | UI: Quick View popup on Order List (`ORDERS_UI.md` §3) | Low | Small | Task 4 | Read-only summary modal off the list row |
| 11 | Validation: wire the full message set from `ORDERS_UI.md` §17 across Create Order / Add Payment / Mark Lost | Medium | Medium | Tasks 6, 7, 8 | Inline, non-blocking-where-specified validation matching the spec's table exactly |
| 12 | Customer Detail → Purchase History redesign: one row per Order Item, sourced from Orders instead of `customer_purchases` (`ORDERS_UI.md` §2, §18) | Medium | Medium | Task 4 | Existing "Lịch sử mua hàng" section re-pointed at Orders data |
| 13 | Auto-refresh rule: Dashboard, Customer Purchase History, and Reports refresh automatically after Order Save/Complete, no manual step (`ORDERS_UI.md` §1, Design Principle 9) | Medium | Small–Medium | Tasks 6, 7, 12 | Verified via manual test — save/complete an order, confirm the three surfaces update without a page reload |
| 14 | Concurrency test pass: two near-simultaneous attempts to reserve the same Product (`ORDERS_SPEC.md` §19 Testing checklist, `ORDERS_DATABASE.md` §13) | High (test) | Small | Task 3 | Confirmed one request wins, the other gets the "just reserved elsewhere" message per `ORDERS_UI.md` §11.2 |
| 15 | Reports/Dashboard cutover to Orders (Completed-and-Paid filter) | **Out of scope for Orders Foundation** — explicitly deferred by `ORDERS_SPEC.md` §16/`ORDERS_DATABASE.md` §11 to a later sprint-internal step; listed here only so it isn't silently skipped when its time comes | — | Tasks 4, 5 fully done and stable | Not started in this increment |

Tasks 6–13 correspond to what `ORDERS_UI.md`'s own Acceptance Checklist (§23) still lists as unconfirmed/unbuilt; none of them are new inventions.

---

## 3. Recommended increment boundaries

Per this project's established pattern (one increment = one reviewable slice, Product Owner reviews after each — see the Sprint 1.1 rollback precedent), Tasks 3–5 (repository + service + product lifecycle) form one coherent increment (no UI surface to review, but a necessary foundation), followed by Task 6 (Create Order) as its own increment, then 7+8 together (Order Detail becomes writable), then 9–13 as a final polish increment. This keeps each increment small enough to review against a specific, named slice of `ORDERS_UI.md` — the same granularity the Product Owner has required before.

---

## 4. Next step

Per task rules ("begin only the first approved task"): **Task 1 is first in the dependency chain, but I cannot execute it** — no DDL access. I'm stopping here rather than starting Task 2+ against a database that doesn't yet match the approved schema, since doing so would repeat the exact silent-failure pattern already flagged twice in this project. Waiting for Task 1 to be cleared before beginning Task 2.
