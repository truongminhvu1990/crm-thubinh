# Orders — Database Foundation (Final Migration Preparation)

**Status:** Planning only. No SQL written, no repository/UI code touched. This is the final preparation pass before `supabase/migrations/20260712_orders_reset.sql` is actually executed against Development — it re-verifies the migration is still exactly right and states precisely what will change, column by column.

**Scope:** the Orders schema only (`orders`, `order_items`, `payments`, `order_events`), per this task's framing that the Development Orders schema is the one remaining blocker.

---

## 1. Current Database State

Re-verified live, right now, via the app's anon key (read-only, per-column probes — not just a table-level check, since a table can exist with the wrong columns and still return 200 on `select=*`).

### `orders` — exists, 0 rows, **legacy schema**

| Column | Present? |
|---|---|
| `id` | ✅ |
| `order_code` | ✅ (legacy) |
| `customer_id` | ✅ (happens to match the approved name) |
| `employee_id` | ✅ (legacy) |
| `order_date` | ✅ (happens to match the approved name) |
| `total_amount` | ✅ (happens to match the approved name) |
| `payment_method` | ✅ (legacy) |
| `status` | ✅ (legacy) |
| `notes` | ✅ (legacy) |

9 columns total. This is the same pre-existing, unrelated legacy table identified earlier in this project (see `docs/ORDERS_MIGRATION_PLAN.md`) — nothing in this repo's code ever referenced it before Orders. Confirmed 0 rows, so no data is at risk.

### `order_items` — exists, 0 rows, **partial/incomplete schema**

| Column | Present? |
|---|---|
| `id` | ✅ |
| `order_id` | ✅ |
| `product_id` | ✅ |
| `quantity` | ✅ |
| `snapshot_sale_price` | ❌ |
| `discount` | ❌ |
| `line_total` | ❌ |
| `is_gift` | ❌ |
| `gift_recipient_name` | ❌ |
| `gift_note` | ❌ |
| `packaging_option` | ❌ |

Only 4 of the 11 approved columns exist. This table's origin is unclear (never fully specified by any prior migration in this repo — `docs/ORDERS_MIGRATION_PLAN.md` flagged its schema as "never confirmed against the locked design"), but it is confirmed empty, so — same as `orders` — no data is at risk.

### `payments` — does not exist
### `order_events` — does not exist

Both return `PGRST205` (relation not found) on every query.

---

## 2. Required Schema

Per `docs/ORDERS_DATABASE.md` (locked) and already correctly encoded in `supabase/migrations/20260712_orders_reset.sql` (drafted, approved via `docs/ORDERS_RESET_PLAN.md`, never executed):

| Table | Columns | Primary Key | Foreign Keys |
|---|---|---|---|
| `orders` | `id, order_number, customer_id, sales_owner, created_by, order_date, lost_reason, subtotal, discount_total, total_amount, order_status, payment_status, note, created_at, updated_at` (15) | `id` | `customer_id → customers(id)` `ON DELETE RESTRICT` |
| `order_items` | `id, order_id, product_id, snapshot_sale_price, discount, quantity, line_total, is_gift, gift_recipient_name, gift_note, packaging_option` (11) | `id` | `order_id → orders(id)` `ON DELETE CASCADE`, `product_id → products(id)` `ON DELETE RESTRICT` |
| `payments` | `id, order_id, amount, payment_method, payment_date, note, created_at` (7) | `id` | `order_id → orders(id)` `ON DELETE CASCADE` |
| `order_events` | `id, order_id, event_type, event_detail, actor, event_timestamp` (6) | `id` | `order_id → orders(id)` `ON DELETE CASCADE` |

Plus: `order_status`/`payment_status` CHECK constraints (DB §8), `quantity > 0` and `amount > 0` CHECK constraints, 9 named indexes (DB §9), RLS enabled + an "Allow full access" policy on all 4 tables (matching every other table in this project).

**Re-verified this pass: the migration file's DDL matches this required schema exactly, column-for-column, constraint-for-constraint, index-for-index.** No drift found between `ORDERS_DATABASE.md` and the drafted SQL — nothing needs to be rewritten.

---

## 3. Exact Differences

| Table | Action needed | Detail |
|---|---|---|
| `orders` | **Drop and recreate** | Current 9 legacy columns (`order_code`, `employee_id`, `payment_method`, `status`, `notes`, plus the 3 that happen to share a name) share no meaningful structure with the approved 15-column design — an `ALTER TABLE` reconciliation would be more complex and riskier than a clean drop/recreate, especially since 0 rows exist. |
| `order_items` | **Drop and recreate** | 4 of 11 columns exist; the missing 7 are exactly the columns Orders' business rules depend on (`snapshot_sale_price`, `discount`, `line_total`, gift/packaging fields) — again 0 rows, so drop/recreate is safe and simpler than 7 individual `ADD COLUMN` statements plus verifying the 4 existing ones' types/constraints match. |
| `payments` | **Create** | Doesn't exist. |
| `order_events` | **Create** | Doesn't exist. |
| Indexes | **Create all 9** | None of the 9 named indexes exist today (they'd have been created by the same migration that never ran). |
| RLS + policies | **Enable + create** | Not applicable to legacy/partial tables in their current form; must be set on the recreated tables. |

This is exactly what `supabase/migrations/20260712_orders_reset.sql` already does — the differences above are the *justification* for that file's drop-then-create approach (already decided in `docs/ORDERS_RESET_PLAN.md`), not a new decision.

---

## 4. Migration Strategy

**No new SQL needs to be written.** `supabase/migrations/20260712_orders_reset.sql` (already drafted, reviewed, and approved) is re-confirmed correct by this pass and should be executed as-is:

1. Single transaction (`BEGIN`/`COMMIT`) — drop children before parent (`order_events → payments → order_items → orders`), create parent before children, then indexes, then RLS, then policies.
2. All `DROP TABLE IF EXISTS` guards make the file safe to re-run from the top if a prior attempt was aborted.
3. Execution requires DDL access (service-role key, DB password, or Supabase CLI/dashboard SQL editor) that this session does not have — the Product Owner or ops must run it.
4. Immediately after execution, run Verification (§5) — **not** as a formality, since this exact gap (a status report saying "executed" while the live schema stayed unchanged) has already occurred more than once on this project.

---

## 5. Verification Checklist

Two layers, both required — the first catches "did it run at all," the second catches "does PostgREST's schema cache actually see it" (a distinct failure mode already seen on this project):

**A. Structural verification** (the migration file's own built-in queries, run via SQL editor):
- [ ] `information_schema.tables` returns exactly 4 rows for `orders`/`order_items`/`payments`/`order_events`.
- [ ] `information_schema.columns` returns 15/11/7/6 rows respectively, names matching §2 above exactly.
- [ ] `pg_indexes` shows each table's PK index, `orders`' unique `order_number` index, plus the 9 named indexes from DB §9.
- [ ] `pg_class.relrowsecurity` is `true` for all 4 tables.
- [ ] `pg_policies` shows exactly 4 "Allow full access" rows, one per table, `cmd = 'ALL'`.

**B. Live application-layer verification** (read-only anon-key probes, the same technique used in §1 above — run from the app's actual connection, not just the SQL editor, since PostgREST's schema cache is a separate concern from Postgres' own catalog):
- [ ] `orders?select=order_number,sales_owner,order_status,payment_status,subtotal,discount_total,lost_reason,note,created_by` returns `200`, not `42703`.
- [ ] `order_items?select=snapshot_sale_price,discount,line_total,is_gift,gift_recipient_name,gift_note,packaging_option` returns `200`.
- [ ] `payments?select=*&limit=1` returns `200` (empty array), not `404`/`PGRST205`.
- [ ] `order_events?select=*&limit=1` returns `200` (empty array), not `404`/`PGRST205`.

Only when **both** layers pass should this be treated as cleared — either alone has already produced a false "it's done" signal once on this project.

---

## 6. Risks

- **PostgREST schema-cache propagation lag.** Postgres' own catalog can show the new tables/columns while PostgREST's cached schema hasn't refreshed yet, producing exactly the `42703`/`PGRST205` errors seen in §1 even for a few moments *after* a genuinely successful migration. Mitigation: re-run §5's Layer B check; if it still fails after a short wait, escalate rather than assume the migration itself failed.
- **Recurrence of the "table exists but wrong schema" trap.** This is the second time this exact failure mode has appeared on this project (`20260712_orders_module.sql`'s silent no-op against the same legacy `orders` table was the first). The drop-then-create approach (not `CREATE TABLE IF NOT EXISTS`) is specifically chosen to avoid a repeat — confirmed still correct in the current file.
- **No data-loss risk at this moment.** Both `orders` and `order_items` are confirmed 0 rows right now — the drop is safe today. This is a time-sensitive fact, not a permanent one: if any real order data is entered before this migration runs, the strategy above would need to change to a data-preserving `ALTER TABLE` approach instead. Execute this migration before any Orders data entry begins, not after.
- **`customers`/`products` foreign-key dependency.** `orders.customer_id` and `order_items.product_id` reference `customers`/`products` — both confirmed live and populated (§1 of `docs/ORDERS_EXECUTION_READINESS.md`), so this dependency is already satisfied; no risk here currently, but worth re-confirming immediately before execution in case that changes.

---

## 7. Rollback Strategy

- **No data-loss dimension today** — both tables being replaced hold 0 rows, so "rollback" here is about wasted execution time from a bad script, not lost records.
- The migration is already transaction-wrapped (`BEGIN`/`COMMIT`) — a failure partway through (e.g., a constraint typo) leaves the database in its exact pre-migration state, nothing half-created.
- Every `DROP TABLE IF EXISTS` guard makes the file idempotent — safe to re-run from the top after fixing any issue, without manual cleanup first.
- If verification (§5) fails after an apparently-successful run, the safe next step is re-running the same file (idempotent) rather than attempting a manual partial fix — consistent with how this project has already resolved this exact class of problem once before.
- Once real Development data exists in these tables (post this migration), this rollback strategy no longer applies as-is — a future schema change would need a genuine `ALTER`-based, data-preserving migration and a real backup/restore plan, neither of which exists yet and neither of which is in scope here.

---

## Next Step

This document confirms `supabase/migrations/20260712_orders_reset.sql` is still correct and ready to execute exactly as drafted — no rewrite needed. Waiting for Product Owner/ops to run it against `crm-thubinh-dev`, then for both verification layers in §5 to be independently confirmed, before Increment 2 of `ORDERS_SPRINT_CHECKLIST.md` begins.

No code changed. No SQL written. No UI touched. Stopping — waiting for Product Owner review.
