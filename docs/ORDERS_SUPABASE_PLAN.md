# Orders Module — Supabase Repository Implementation Plan

**Status:** Planning only. No SQL, no Supabase code, no UI, no implementation — per explicit task rules. This document describes *how* the already-locked `OrderRepository` contract (`lib/orders/order.repository.ts`) will be filled in once the Development database reset is applied. Architecture layer is LOCKED (per Product Owner decision) — nothing here revisits `order.rules.ts`/`order.validation.ts`/`order.service.ts`.

**Inspected for this plan:**
- `lib/orders/order.repository.ts` — the current `OrderReadRepository`/`OrderWriteRepository`/`OrderRepository` contracts, result models, and mapping helpers.
- `docs/ORDERS_DATABASE.md` — approved schema, indexes (§9), business constraints (§8), risks (§13).
- `lib/customer.service.ts` / `lib/product.service.ts` — this codebase's existing Supabase coding conventions (the only precedent to follow; Orders should look like a module that already belongs here, not a new style).

---

## 1. Repository Implementation Strategy

**Shape:** Customer/Product each export plain async functions directly from a flat `lib/*.service.ts` file — no class, no factory. Orders already deviates from that (its own `lib/orders/` folder, split repository/service layers) as a previously-approved exception. To stay maximally consistent with the rest of the codebase *within* that already-approved deviation, the concrete implementation continues exporting plain functions from `order.repository.ts` (not a class) — one function per `OrderRepository` method, matching the three that already exist (`findAllOrders`, `findOrderById`, `findOrderItemsByOrderId`).

**Bridging to the Service layer's dependency injection:** `order.service.ts`'s `createOrderService(repository: OrderRepository)` needs an object satisfying the interface, not a module of loose exports. Resolve this with one small assembly export added at the bottom of `order.repository.ts`:

```ts
export const supabaseOrderRepository: OrderRepository = {
  findAllOrders, findOrderById, findOrderItemsByOrderId,
  findPaymentsByOrderId, findOrderEventsByOrderId,
  createOrder, addOrderItem, updateOrderItem, removeOrderItem,
  addPayment, markOrderLost, completeOrder, reassignSalesOwner,
  appendOrderEvent, updateOrderRollups,
};
```

This is the only new "shape" introduced — everything else (each individual function) matches the existing flat-export convention exactly.

**Writable-field allowlists:** Customer/Product both gate `insert`/`update` payloads through a `WRITABLE_FIELDS` array + `pickWritableFields()` helper, rather than trusting the caller's object shape directly. Orders' DTOs (`CreateOrderInput`, `AddOrderItemInput`, etc.) are already narrow and purpose-built per action, so the same risk (a caller accidentally writing an unintended column) is smaller — but the pattern is still worth reusing for `updateOrderItem` specifically, since `UpdateOrderItemInput`'s fields are all optional and map 1:1 to real columns; a small `ORDER_ITEM_WRITABLE_FIELDS` allowlist keeps `undefined` fields from being sent as explicit `null` overwrites.

**Build order** (matches `ORDERS_IMPLEMENTATION_PLAN.md` Task 3's dependency chain, easiest/lowest-risk first):
1. `findPaymentsByOrderId`, `findOrderEventsByOrderId` — new reads, no concurrency concerns.
2. Reconcile the three existing reads against the *actual* post-reset column names (they currently target the approved schema already, per their `select` strings — they should work unmodified once the reset lands, but must be re-verified, not assumed — see §6).
3. `createOrder`, `addPayment`, `markOrderLost`, `reassignSalesOwner`, `updateOrderRollups`, `appendOrderEvent` — straightforward single-row writes, no race conditions.
4. `completeOrder` — single order-row write, but see §3 for the product-lifecycle side-effect this implies.
5. `addOrderItem` (and the reservation it triggers) and Order Number generation — last, because both are the two concurrency-sensitive operations DB §13 names explicitly, and need a transaction-strategy decision (§3) before they can be written safely.

---

## 2. Query Mapping Strategy

**Reuse the existing join-with-fallback pattern.** `getProducts`/`getMatchingProducts` already establish the exact pattern Orders needs: attempt a `select` with embedded relations, and on error, retry with a plain `"*"` select, rather than letting one missing/misconfigured relationship break the whole query. This is *the same failure mode* Orders has already hit twice (payments/order_events schema mismatches) — the concrete implementation should apply this fallback not just defensively but expecting it may actually fire during the transition period:

```ts
let { data, error } = await supabase.from("orders").select(`${WITH_CUSTOMER}, order_items(count)`)...;
if (error) ({ data, error } = await supabase.from("orders").select("*")...);
```

**Mapping helpers already written stay the mapping boundary.** `extractItemCount` and `toFullOrderRecord` (already in `order.repository.ts`) are where the raw-row-to-domain-shape conversion happens — new query functions should produce raw rows and hand them to these (or siblings of them), keeping `as unknown as X` casts localized to this boundary, exactly as `findAllOrders`/`findOrderById` already do.

**Composite Order Detail fetch.** Once `payments`/`order_events` exist, Order Detail (`ORDERS_UI.md` §6) needs order + items + payments + events together. Two options:
- (a) Four parallel queries (`Promise.all`) composed client-side via `toFullOrderRecord` — matches the existing `recomputeAndPersistRollups` pattern (already parallel-fetches items+payments) and is simplest to reason about.
- (b) One deeply-nested `select` embedding all three relations in a single request.
Recommend (a): PostgREST embed depth increases the "one relation errors, whole query fails" blast radius (§2 above), and Order Detail's four pieces don't need transactional consistency with each other (payments/events are naturally append-only and read a moment apart is harmless) — four cheap indexed queries in parallel is lower-risk than one fragile deep join.

**Currency/date formatting:** No mapping change needed — Customer/Product return raw numeric/date-string fields untouched and let the UI layer format them (`vi-VN` currency formatting lives in components, not services). Orders' repository should do the same: return `subtotal`/`total_amount`/etc. as plain numbers, no formatting at the data layer.

---

## 3. Transaction Strategy

**Codebase precedent: none.** Grepped the full repo for `.rpc(` and `CREATE FUNCTION` — zero matches anywhere. Every existing write (Customer, Product, Settings, Batch) is a single-table `insert`/`update`/`delete` call; even multi-field operations (e.g., Customer Notes) serialize into one JSON column on one row, sidestepping the need for a real multi-table transaction entirely. **Orders is the first module in this codebase that structurally needs one.**

Two categories of write, needing two different answers:

**Category A — genuinely atomicity-critical (DB §13's named risks):**
- Adding a product to an order must atomically check-and-flip `products.status: available → reserved`, exclusively, or two staff can reserve the same one-of-a-kind piece.
- Order Number generation must atomically read-and-increment the daily sequence, or two same-day orders can collide.

Supabase's client SDK (PostgREST) has no multi-statement transaction primitive — only a Postgres function invoked via `.rpc()` executes server-side as one atomic unit. This codebase has never used `.rpc()` before, so introducing it is a **new pattern requiring explicit Product Owner approval**, not something to build quietly under a "safe implementation" label. Recommend: when Task 1 unblocks, request approval for exactly two small Postgres functions (`reserve_product_for_order`, `next_order_number`) — nothing broader — each doing one atomic check-and-write, called from the repository via `.rpc()`. No other write needs this mechanism.

**Category B — everything else (add payment, mark lost, complete, reassign owner, update rollups):**
These have no cross-request race condition with the same stakes — a payment recorded a moment apart from another, or a rollup recomputed slightly after its trigger, self-heals on the next read/write (nothing is lost or double-sold). These follow the existing codebase convention exactly: sequential `await`ed single-table calls, no transaction needed. `completeOrder`'s product-lifecycle side effect (flipping every line's product to `sold`) is the one Category-B-adjacent case worth flagging: if the order-status update succeeds but a subsequent per-product update fails partway through a multi-item order, the order would read as Completed while a product is still `reserved`. Given this codebase's established risk tolerance (no transactions anywhere else either), recommend: sequential per-product updates with a caught-and-logged error per item (matching Customer/Product's existing "log and continue" style) rather than blocking on a transaction — flagged as an accepted, pre-existing-pattern-consistent risk, not silently ignored.

---

## 4. Error Handling Strategy

**Reconciliation point (the one real deviation from Customer/Product's style):** Customer/Product's reads swallow errors to a safe default (`[]`/`null`, logged via `console.error`); their writes return a `{ data, error }` tuple for the caller to inspect. But `order.service.ts`'s orchestration (already approved) expects each `OrderWriteRepository` method to **resolve with the value or throw** — `createOrder(input): Promise<Order>`, not `Promise<{data, error}>`. This isn't a style preference to reconsider; the Service layer is locked, so the Repository must be written to match what it already expects.

Resolution: at the repository boundary only, convert Supabase's tuple into throw-or-resolve:

```ts
export async function addPayment(input: AddPaymentInput): Promise<OrderPayment> {
  const { data, error } = await supabase.from("payments").insert(...).select().single();
  if (error) {
    console.error("Error adding payment:", error); // keep the existing log convention
    throw new OrderRepositoryError("addPayment", error);
  }
  return data as OrderPayment;
}
```

A new `OrderRepositoryError` (data-layer, distinct from the Service layer's `OrderNotFoundError`/`OrderValidationError`/`OrderRuleViolationError`) wraps the Postgres error code/message/operation name — giving the orchestration layer one consistent thrown-error family to catch, while keeping the underlying Postgres error inspectable for debugging. Reads keep the existing swallow-to-safe-default behavior unchanged (`findAllOrders` returning `[]` on error, etc.) — no reason to diverge there, since nothing downstream expects reads to throw.

---

## 5. Performance Considerations

- **Order List filtering stays client-side**, matching `getOrderList`'s existing comment ("Search/filter/sort stay client-side in the page component, same convention as Customer/Product List") and Customer/Product's actual behavior today (fetch-all, filter-in-browser). DB §9's Order Status + Payment Status combined index exists for when this needs to move server-side at real data volume — not needed for V1 given Customer/Product haven't needed it either.
- **No N+1 risk** for Order List's item counts — already solved via the existing `order_items(count)` PostgREST aggregate embed in `findAllOrders`.
- **Order Detail's four reads** (order, items, payments, events) should fire via `Promise.all`, matching the parallel-fetch pattern `recomputeAndPersistRollups` already established, each hitting its own `*_order_id` index (DB §9) — cheap, independent, no join fragility (§2).
- **`updateOrderRollups` recomputes from scratch** (re-fetches all items + payments) rather than an incremental running total. Acceptable for V1: `ORDERS_SPEC.md` frames quantity as "almost always 1" per line and orders as small, counter-style transactions, not high-line-count invoices — a full recompute of a handful of rows is not a real cost. Revisit only if usage patterns turn out to involve orders with many lines/payments.

---

## 6. Migration Risks

- **The Task 1 blocker itself.** Nothing in this plan can be implemented until `20260712_orders_reset.sql` is actually applied to the `crm-thubinh-dev` Development project — confirmed still not applied as of the last live check (`orders`/`order_items` on the legacy schema, `payments`/`order_events` absent).
- **Schema-cache propagation risk, already observed twice on this project.** PostgREST caches its schema and has, in this project's own history, not reflected a migration that had genuinely run. Recommend the concrete-implementation task open with the same read-only anon-key probe already used earlier in this project (`select` each of the 4 tables' approved columns individually) as an explicit pre-flight check — not just trusting a status report that the reset "succeeded."
- **The two atomicity-critical operations (§3) are also the two risks `ORDERS_DATABASE.md` §13 names first** (concurrent reservation, Order Number sequence) — carried forward here as a migration-adjacent risk because both need a Postgres function decision *before* the first line of `addOrderItem`/order-number code is written, not discovered mid-implementation.
- **Legacy `orders` table's prior existence is a precedent, not a one-off.** The same "PostgREST reports success against a table that isn't the one you think it is" failure mode that hit the original `orders` table could recur for any of the four tables if the reset is ever partially re-run or re-applied inconsistently — the pre-flight check above should be run before *every* implementation increment touching a new table, not just once at the start.

---

## Next Step

Waiting on Task 1 (Development DB reset execution) — no repository code should be written until it lands and is independently re-verified per §6 above. Once unblocked, implementation should proceed in the build order given in §1, with the two `.rpc()`-based Postgres functions (§3) called out to the Product Owner for explicit approval before any SQL for them is drafted.
