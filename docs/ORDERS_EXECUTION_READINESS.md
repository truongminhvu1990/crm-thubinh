# Orders — Execution Readiness Review

**Status:** Review only. No code changed, no SQL written, no UI touched, no implementation performed. Everything below reflects a live re-inspection performed for this review — not a restatement of prior session notes — including a direct, independent check of the actual Development database, because two existing documents in `docs/` currently disagree about its state (see §5).

---

## 1. Current Code Status

All Orders code present is exactly what the locked planning/architecture increments produced; nothing has regressed or drifted:

| Area | Files | State |
|---|---|---|
| Types/DTOs | `types/order.ts` | Complete — `Order`, `OrderItem`, `OrderPayment`, `OrderEvent`, `OrderEventType`, and all 6 write-operation DTOs + `OrderRollups`. |
| Constants | `lib/orders/order.constants.ts` | Complete — status/payment options, badge variants, `ORDER_EVENT_TYPES`, `ORDER_NUMBER_PATTERN`. |
| Validation | `lib/orders/order.validation.ts` | Complete — pure DTO-shape validators, no I/O. |
| Business Rules | `lib/orders/order.rules.ts` | Complete — rollup calculations, payment-remaining, status-transition guards, completion/lost-transition validation, no I/O. |
| Repository | `lib/orders/order.repository.ts` | **Reads implemented (against the legacy schema — see §5), writes are contract-only.** `OrderReadRepository`/`OrderWriteRepository`/`OrderRepository` interfaces defined; no concrete write implementation exists. |
| Service | `lib/orders/order.service.ts` | Reads (`getOrderList`/`getOrderDetail`) implemented and live. Writes (`createOrderService`) fully orchestrated against the `OrderRepository` interface via dependency injection — but **nothing instantiates it anywhere in the app** (confirmed: zero call sites for `createOrderService(` outside `lib/orders/` itself). |
| UI | `app/orders/page.tsx`, `app/orders/[id]/page.tsx`, `components/order/*` | Read-only List + Detail (header + line items), Sidebar enabled. A `PaymentStatusBadge` component now exists and is wired into `OrderTable`/`OrderDetailHeader` (a display-only addition, still read-only — no write UI anywhere). |

**Net:** every schema-independent artifact planned in `ORDERS_IMPLEMENTATION_PLAN.md` is built and type-checks cleanly. Nothing beyond read-only display exists in the running app.

---

## 2. Repository Contracts

`OrderRepository` (`OrderReadRepository` + `OrderWriteRepository`) is fully specified and internally consistent with `ORDERS_DATABASE.md`'s four-table design — **with one confirmed gap, newly surfaced by `docs/INVENTORY_WRITE_PATH_AUDIT.md` (§7 of that document) and independently confirmed here by re-reading the interface directly:**

`OrderWriteRepository` has **no method that writes to `products.available`/`reserved`/`sold`**. `ORDERS_DATABASE.md` §7 and §16 require Orders to be the sole driver of the Product Lifecycle (`Available → Reserved → Sold`, `Reserved → Lost → Available`), but nothing in the current contract — not `addOrderItem`, not `completeOrder`, not `markOrderLost` — has an inventory-transition side effect modeled anywhere, even as a signature. This is a real contract gap, not yet a bug (nothing has been implemented to exercise it), but it means the current contract **cannot fulfill the locked design as written** without an addition. See Blocker B in §6.

Everything else in the contract — result models (`OrderWithItemCount`, `FullOrderRecord`, etc.), mapping helpers (`extractItemCount`, `toFullOrderRecord`), and the read/write method signatures for `orders`/`order_items`/`payments`/`order_events` themselves — is complete and consistent.

---

## 3. Service Layer

`createOrderService(repository: OrderRepository): OrderWriteService` fully implements the DTO → Validation → Business Rules → Repository pipeline for all 8 write actions, with dependency injection through the interface only (no concrete or fake repository referenced). Confirmed via repo-wide search: it has **zero callers** anywhere in `app/` — it is complete, correct, and entirely dormant. It inherits Repository Contracts' one gap (§2): once a concrete repository exists, the service still has no way to trigger a product-lifecycle transition, since the interface it depends on doesn't expose one yet.

Also confirmed still true from the prior Service Layer increment: Order Event logging (`appendOrderEvent`) is deliberately never called anywhere in the service, because every write DTO is missing an `actor` field. This remains an open, previously-flagged gap, not a regression.

---

## 4. UI Readiness

Not ready, and not expected to be — per `ORDERS_SPRINT_CHECKLIST.md`, UI work (Increments 5-9) doesn't start until Increments 2-4 (repository/service/atomic-operations implementation) are done. Confirmed current UI is exactly List + Detail, read-only, no Create Order, no Edit, no Payments, no Timelines, no Quick View — consistent with the checklist's sequencing, not a gap relative to where the sprint should be right now.

---

## 5. Database Readiness

**Independently re-verified live, right now, via the app's own anon key (read-only, no DDL):**

| Table | Live state |
|---|---|
| `customers` | Exists, has real data (multiple rows confirmed). |
| `products` | Exists, has real data. |
| `master_data` | Exists, has real data. |
| `product_batches` | Exists, has real data. |
| `customer_purchases` | Exists, has real data. |
| `orders` | Exists, **0 rows**, but still the **legacy schema** — querying approved columns (`order_number`, `sales_owner`, `order_status`, etc.) fails `42703 column does not exist`. |
| `order_items` | Exists, **0 rows**, still missing approved columns (`snapshot_sale_price` → `42703`). |
| `payments` | **Does not exist** (`PGRST205`). |
| `order_events` | **Does not exist** (`PGRST205`). |

**This directly contradicts `docs/DEVELOPMENT_DATABASE_FOUNDATION.md`**, which states (as of its own writing) that Development is "confirmed empty... for `customers`, `master_data`, and every other table." That is not the current live state — `customers`/`products`/`master_data`/`product_batches`/`customer_purchases` all have real rows right now. Either that document reflects a moment in time that has since changed (data was restored, or a different check target was used), or it was mistaken. **This discrepancy needs Product Owner reconciliation before that document's "master rebuild from scratch" framing is treated as current truth** — it may no longer apply, or may apply only to the Orders-specific tables (which do remain broken, consistent with both documents). I'm flagging the conflict rather than silently picking one account.

What both documents and this live check **do agree on**: `orders`/`order_items`/`payments`/`order_events` are not in the approved state, and `20260712_orders_reset.sql` has not been successfully applied.

---

## 6. Remaining Blockers

### Blocker A — Development DB reset not applied

- **Description:** `supabase/migrations/20260712_orders_reset.sql` has not run against the `crm-thubinh-dev` project. `orders`/`order_items` carry the pre-existing legacy schema; `payments`/`order_events` don't exist.
- **Impact:** Blocks all of Increments 2-10 in `ORDERS_SPRINT_CHECKLIST.md` — no repository code can be written or tested against the real schema without reproducing the exact silent-failure pattern already seen twice on this project.
- **Dependency:** Requires DDL execution access (service-role key, DB password, or Supabase CLI/dashboard) that this session does not have.
- **Resolution:** Product Owner or ops applies the migration, then an independent read-only re-verification (the same probe used in §5) confirms it before Increment 2 begins — not a status report alone.

### Blocker B — `OrderWriteRepository` has no product-lifecycle transition method

- **Description:** No method in the write contract can flip `products.available/reserved/sold`, despite `ORDERS_DATABASE.md` §7/§16 requiring Orders to be the sole driver of that state machine.
- **Impact:** Even after Blocker A clears, Increments 2-4 as currently scoped could implement every `OrderWriteRepository` method and still not satisfy the locked design — Order completion/Lost/item-add would have no inventory side effect.
- **Dependency:** A contract addition to `OrderWriteRepository` (e.g., a reservation/release/sell method) — this touches the architecture layer, which the Product Owner has explicitly LOCKED. Extending it requires an explicit unlock/approval, not a unilateral fix.
- **Resolution:** Flag to Product Owner as a required, scoped addition to the (currently locked) repository contract before Increment 4 (Atomic Operations) is implemented — Increment 4 is where the reservation logic lives per the sprint checklist, making it the natural point to also close this gap, not before.

### Blocker C — `DEVELOPMENT_DATABASE_FOUNDATION.md` vs. live reality conflict

- **Description:** That document asserts total Development emptiness; this review's live check shows `customers`/`products`/`master_data`/`product_batches`/`customer_purchases` all populated.
- **Impact:** If Blocker A's resolution is planned around that document's "rebuild everything from scratch, including `customers`/`products` baseline" framing, effort could be spent on tables that already exist and hold real data — or, conversely, if the document is right and this check caught a transient state, treating the DB as healthy could be equally wrong.
- **Dependency:** Product Owner clarification on which account is current.
- **Resolution:** Before acting on `DEVELOPMENT_DATABASE_FOUNDATION.md`'s rebuild plan, re-run its own verification checklist live and reconcile against this review's findings — not something this review can resolve unilaterally.

### Blocker D — Order Event actor field missing (carried forward, unchanged)

- **Description:** Every write DTO lacks an `actor` field; `appendOrderEvent` is consequently never called anywhere in the service layer.
- **Impact:** `ORDERS_SPEC.md` §8's Order Event Timeline cannot be populated even once everything else works.
- **Dependency:** A DTO field addition — same locked-architecture consideration as Blocker B.
- **Resolution:** Bundle with Blocker B's contract-unlock conversation, since both are additive contract changes gated by the same architecture lock; natural point is Increment 8 (Timelines) per the sprint checklist, but the field itself needs to exist on the write DTOs before Increment 3 wires up any writes that should be logging events.

---

## 7. Execution Order

Given the above, `ORDERS_SPRINT_CHECKLIST.md`'s sequencing still holds, with two insertions:

1. **Increment 1 (Database Reset)** — unchanged, still first, still blocked (Blocker A). Add: reconcile Blocker C before treating any "DB is ready" signal as final.
2. **Before Increment 2 starts:** Product Owner decision on Blocker B (extend `OrderWriteRepository`) and Blocker D (add `actor` to write DTOs) — both are contract/architecture changes needing an explicit unlock, cheaper to decide once than to discover mid-Increment-3 or mid-Increment-4.
3. **Increments 2-10** — proceed as written in `ORDERS_SPRINT_CHECKLIST.md`, with Increment 4 (Atomic Operations) now also scoped to include the product-reservation method from Blocker B, and Increment 3's write-wiring including event-logging calls once Blocker D's field exists.

---

## Verdict: **Not Ready**

Four blockers open, two of them (A) hard-blocking and previously known, two (B, D) newly surfaced contract gaps requiring a Product Owner decision to unlock the currently-LOCKED architecture, and one (C) a factual conflict between two existing documents that needs reconciling before anyone acts on either. No implementation should begin until Blocker A clears and Blockers B/C/D have explicit Product Owner direction.

No code changed. No SQL written. No UI touched. Stopping — waiting for Product Owner review.
