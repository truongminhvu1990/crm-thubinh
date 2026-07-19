# Orders Module — Sprint 1 Execution Checklist

**Status:** Execution checklist only. No code, no SQL, no UI in this document. Planning/Architecture/Implementation Plan/Supabase Plan are all LOCKED per Product Owner decision — this document sequences their execution, it does not revisit them.

**How to read "Review Gate" vs "Merge Gate":** these are two different checkpoints, not the same thing twice.
- **Review Gate** — what the Product Owner checks *before* an increment's work is accepted as correct (scope, correctness, spec compliance).
- **Merge Gate** — what must be true for that increment's code to land in Development and the next increment to begin (`tsc`/`eslint`/`next build`/Playwright-if-UI, plus explicit Product Owner go-ahead).

Neither gate is the Production "**OK Merge**" gate — per `docs/PROJECT_MANIFEST.md`'s release process (Development → Technical Review → Product Owner Review → User Testing → **OK Merge** → Production), every increment below lands in Development only. Production is untouched until the user explicitly types "OK Merge," which is out of scope for this entire sprint.

**Scope:** Sprint 1 (Orders) only, per `docs/PROJECT_MANIFEST.md`'s Sprint Roadmap. Reports/Dashboard cutover to Orders is explicitly out of scope for this sprint (`ORDERS_IMPLEMENTATION_PLAN.md` Task 15) and is not listed as an increment here.

**Already complete (schema-independent groundwork, not a numbered increment):** DTOs, validation layer, business rules/derived calculations, repository contracts + result models + mapping helpers, service orchestration (dependency-injected against `OrderRepository`), a domain-model cleanup pass, an architecture audit, and `docs/ORDERS_SUPABASE_PLAN.md`. All of it lives in `lib/orders/` and `types/order.ts` today, fully type-checked, waiting on Increment 1 below.

---

## Sprint 1 — Orders Foundation

### Increment 1 — Development Database Reset

**Goal:** Apply `supabase/migrations/20260712_orders_reset.sql` to the `crm-thubinh-dev` Development project and independently confirm the live schema matches `docs/ORDERS_DATABASE.md` exactly.

**Expected Output:** All four tables (`orders`, `order_items`, `payments`, `order_events`) exist with the approved columns, the 9 named indexes (DB §9), RLS enabled, and the "Allow full access" policy — verified via the migration file's own verification block AND an independent read-only anon-key probe (not a status report alone; this exact gap has silently failed twice before on this project).

**Review Gate:** Product Owner (or ops with DB execute access) confirms the migration ran; Development Engineer re-verifies live before treating this as cleared.

**Merge Gate:** No code changes in this increment — "merged" means the live Development schema is confirmed matching DB §4/§9 column-for-column, index-for-index. Nothing in Increment 2 starts until this is independently re-verified.

---

### Increment 2 — Repository Implementation (Reads)

**Goal:** Implement the read side of `OrderRepository` against the now-live schema: `findAllOrders`, `findOrderById`, `findOrderItemsByOrderId` (reconciled from the legacy schema they currently target), plus the two new methods `findPaymentsByOrderId` and `findOrderEventsByOrderId`, per `ORDERS_SUPABASE_PLAN.md` §1/§2.

**Expected Output:** All 5 read methods return real Development data. The already-built Order List/Detail pages show real rows instead of the current empty-list/"not found" states.

**Review Gate:** Product Owner reviews against `ORDERS_SUPABASE_PLAN.md` §1 (build order), §2 (join-with-fallback query mapping) — read-only, no data-mutation risk.

**Merge Gate:** `tsc`/`eslint`/`next build` clean; manual verification of `/orders` and `/orders/[id]` against real Development rows; Product Owner approval before Increment 3 begins.

---

### Increment 3 — Repository Implementation (Simple Writes) + Service Wiring

**Goal:** Implement the non-concurrency-critical `OrderWriteRepository` methods — `createOrder`, `addPayment`, `markOrderLost`, `reassignSalesOwner`, `completeOrder`, `appendOrderEvent`, `updateOrderRollups` — per `ORDERS_SUPABASE_PLAN.md` §1/§3 Category B/§4. Assemble `supabaseOrderRepository` and wire it into `createOrderService`.

**Expected Output:** `OrderWriteService` fully operational for every action except adding/removing/updating order items (blocked on Increment 4's atomic reservation mechanism).

**Review Gate:** Product Owner reviews the error-handling reconciliation (`ORDERS_SUPABASE_PLAN.md` §4 — repository throws rather than returning a `{data,error}` tuple) and accepts the sequential-per-product-update risk on `completeOrder` (§3 Category B).

**Merge Gate:** `tsc`/`eslint`/`next build` clean; no user-facing UI exercises these paths yet, so verification is direct (script/console) against Development data; Product Owner approval before Increment 4.

---

### Increment 4 — Atomic Operations (Product Reservation + Order Number Generation)

**Goal:** Resolve `ORDERS_DATABASE.md` §13's two named concurrency risks. Requires a **separate, explicit Product Owner SQL-approval gate** (this project's established "approve plan → approve SQL → approve execution" pattern) for two small Postgres functions per `ORDERS_SUPABASE_PLAN.md` §3 — `reserve_product_for_order`, `next_order_number` — before either is written into a migration. Then implement `addOrderItem`, `updateOrderItem`, `removeOrderItem`, and order-number generation against them.

**Expected Output:** Adding a product atomically reserves it (no double-reservation under concurrent requests); Order Number generation is atomic and collision-free for two same-day concurrent creations.

**Review Gate:** (a) Product Owner approves the two Postgres functions' SQL before it's written. (b) After implementation, the concurrency test named in `ORDERS_SPEC.md` §19 (two near-simultaneous reservation attempts on the same product) passes.

**Merge Gate:** New migration file reviewed and approved; `tsc`/`eslint`/`next build` clean; concurrency test passes with evidence; Product Owner approval before Increment 5.

---

### Increment 5 — UI: Create Order

**Goal:** Build the 4-step Create Order screen exactly as described in `ORDERS_UI.md` §4 — Customer, Select Products, Confirm Prices, Payment — against the now-complete write service.

**Expected Output:** Staff can create a Draft/Reserved order end-to-end against real Development data, including live-computed totals and immediate product reservation.

**Review Gate:** Product Owner reviews strictly against `ORDERS_UI.md` §4 — no feature beyond the four named steps (this project has already rolled back one increment for exactly this kind of scope creep; the lesson stands).

**Merge Gate:** `tsc`/`eslint`/`next build`/Playwright (UI changed) clean; manual verification in the dev server with screenshots; Product Owner approval before Increment 6.

---

### Increment 6 — UI: Order Detail Edit Mode + Product Lifecycle

**Goal:** Edit mode on Order Detail — inline price/product edit, add/remove products, Reassign Sales Owner, Mark as Lost modal, Complete action, and the action-bar visibility rules — per `ORDERS_UI.md` §5/§6/§10. Wire the Product Lifecycle (`available`/`reserved`/`sold`) so Orders becomes the sole writer of those counters, per `ORDERS_SPEC.md` §7.

**Expected Output:** Order Detail becomes a full read/write hub; Product status transitions fire correctly and exclusively from Order actions.

**Review Gate:** Product Owner reviews against `ORDERS_UI.md` §5/§6/§10 and `ORDERS_SPEC.md` §7 exactly, including the action-bar's "absent, not disabled" rule for inapplicable actions.

**Merge Gate:** `tsc`/`eslint`/`next build`/Playwright clean; manual verification (edit, reassign, mark lost, complete, each from the correct starting status); Product Owner approval before Increment 7.

---

### Increment 7 — UI: Payments

**Goal:** Add Payment modal + Payment History list + prominent remaining-balance display, per `ORDERS_UI.md` §7/§8.

**Expected Output:** Payments fully recordable and visible on Order Detail; remaining balance and Payment Status update live with each payment; the non-blocking overpayment warning behaves per §7.

**Review Gate:** Product Owner reviews against `ORDERS_UI.md` §7/§8 exactly, including availability rules (never on Lost, never once Paid, still available on Completed-but-unpaid per `ORDERS_SPEC.md` §5).

**Merge Gate:** `tsc`/`eslint`/`next build`/Playwright clean; manual verification of the full payment lifecycle (deposit → partial → paid); Product Owner approval before Increment 8.

---

### Increment 8 — UI: Timelines, Quick View, Validation Messages

**Goal:** Order Timeline simplified progress bar + detailed Order Event Timeline on Order Detail (`ORDERS_UI.md` §9); Quick View popup on Order List (§3); wire the full validation-message set from §17 across Create Order, Add Payment, and Mark Lost.

**Expected Output:** Both timeline widgets render per spec (including the Lost-interrupt visual treatment); Quick View is read-only with no editing surfaced; every validation message matches §17's table exactly.

**Review Gate:** Product Owner reviews against `ORDERS_UI.md` §9/§3/§17 exactly.

**Merge Gate:** `tsc`/`eslint`/`next build`/Playwright clean; manual verification of each timeline stage transition and Quick View; Product Owner approval before Increment 9.

---

### Increment 9 — Customer History Integration + Auto-Refresh

**Goal:** Redesign Customer Detail → Purchase History to one row per Order Item, sourced from Orders instead of `customer_purchases`, per `ORDERS_UI.md` §2/§18. Implement the auto-refresh rule (§1, Design Principle 9): Dashboard, Customer Purchase History, and Reports refresh automatically after Order Save/Complete.

**Expected Output:** Purchase History shows Order-sourced rows with the exact columns named in §2; the three named surfaces update without any manual reload.

**Review Gate:** Product Owner reviews against `ORDERS_UI.md` §2/§18/§1 exactly. **This increment touches the Customer module** — per Project Rules' Impact rule, an Impact Analysis must be presented and approved before this increment starts, since Orders' module ownership doesn't automatically extend to modifying Customer Detail.

**Merge Gate:** Impact Analysis approved; `tsc`/`eslint`/`next build`/Playwright clean; manual verification (save/complete an order, confirm all three surfaces update with no manual refresh); Product Owner approval before Increment 10.

---

### Increment 10 — Full Test-Case Pass (Concurrency + Revenue Recognition)

**Goal:** Execute every test case named in `ORDERS_SPEC.md` §19's Testing checklist: reservation race condition, inventory transitions (add/complete/lost), payment-status derivation boundaries (including payments logged after Completion), the Revenue Recognition boundary (a Completed-but-Partially-Paid order must **not** appear in revenue totals), Marking-Lost-without-a-reason block, Sales Owner reassignment (Created By never changes), and Order Number generation under same-day concurrency.

**Expected Output:** Every named test case passes, with recorded evidence per case — this is explicitly called out in `ORDERS_SPEC.md` §17 as "the single biggest risk in this spec overall," so a passing run needs to be demonstrable, not just asserted.

**Review Gate:** Product Owner reviews the test evidence against §19 verbatim. This gate is a hard stop — no next sprint (Inventory, Sprint 2) begins until it clears.

**Merge Gate:** All test cases pass with evidence; Product Owner explicit sign-off. This is the last increment of Sprint 1 — Reports/Dashboard cutover, Return/Refund, and every other V2 item stay out of scope until a new sprint is opened for them.

---

## Stop Conditions (apply throughout every increment above)

- Never touch Production.
- Never modify a module outside Orders without an approved Impact Analysis (Increment 9 is the one already-known exception requiring one).
- Never skip a Review Gate or a Merge Gate, and never treat silence as approval.
- Every increment ends with the Definition of Done sequence (`tsc`, `eslint`, `next build`, Playwright if UI changed) and then **stops** — no automatic continuation to the next increment.
