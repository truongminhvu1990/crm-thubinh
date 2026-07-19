# Orders Module — Development Reset Plan

**Sprint:** 1 — Phase 4, Migration Review
**Module:** Orders V1
**Status:** Draft — plan only. No SQL, nothing executed. Awaiting Product Owner approval before any SQL is written.
**Decision this plan implements:** Product Owner reviewed `docs/ORDERS_MIGRATION_PLAN.md` and decided **not** to migrate the legacy `orders` table (confirmed 0 rows, doesn't match the locked architecture, no migration value). Instead: drop the legacy/incomplete Orders tables in **Development only**, then recreate the Orders module exactly as defined in the locked `docs/ORDERS_DATABASE.md`.
**Environment:** Development only. Production is untouched — no Orders tables exist there, and nothing in this plan reaches it.

**Current state, reconfirmed read-only immediately before writing this plan** (same method as `ORDERS_MIGRATION_PLAN.md` §0 — column-select probes via the Supabase REST API, anon key, no writes):

| Table | Exists today? | Schema |
|---|---|---|
| `orders` | Yes | Legacy (`order_code, employee_id, payment_method, status, notes, ...`) — 0 rows |
| `order_items` | Yes | Unverified against the locked design (never schema-confirmed the way `orders` was) — 0 rows |
| `payments` | No | — |
| `order_events` | No | — |

Because `order_items`' schema was never confirmed to match `ORDERS_DATABASE.md` either (flagged as follow-up work in the prior review), this plan resets **all four** Orders tables, not just `orders` — dropping and recreating `order_items` too removes that open question entirely rather than leaving it unresolved.

---

## 1. Tables to Drop

All four, in Development only. Every drop should be written as a guarded/idempotent statement (`DROP TABLE IF EXISTS ...`) when the actual SQL is written, so the script is safe to re-run even if a prior partial attempt already removed some of them:

- `order_events` — does not currently exist; guarded drop is a no-op, included for idempotency.
- `payments` — does not currently exist; guarded drop is a no-op, included for idempotency.
- `order_items` — exists today (0 rows); dropped so its schema is unambiguously reset to the locked design rather than left unverified.
- `orders` — exists today (0 rows, legacy schema); this is the table the Product Owner explicitly ruled has no migration value.

No other table is touched. `customers` and `products` are only ever *referenced* by Orders' foreign keys, never dropped or altered by this plan.

## 2. Tables to Create

All four, exactly as specified in `ORDERS_DATABASE.md` §2–§9 — same field list, types, constraints, and indexes already designed and approved in that document (and already drafted once, correctly, in the superseded `20260712_orders_module.sql`, whose `orders` block never actually took effect because of the pre-existing legacy table — see `ORDERS_MIGRATION_PLAN.md`):

- `orders` — header record (DB §4): `id, order_number, customer_id, sales_owner, created_by, order_date, lost_reason, subtotal, discount_total, total_amount, order_status, payment_status, note, created_at, updated_at`.
- `order_items` — line record (DB §4): `id, order_id, product_id, snapshot_sale_price, discount, quantity, line_total, is_gift, gift_recipient_name, gift_note, packaging_option`.
- `payments` — payment-event record (DB §4): `id, order_id, amount, payment_method, payment_date, note, created_at`.
- `order_events` — append-only audit log (DB §4): `id, order_id, event_type, event_detail, actor, event_timestamp`.

Also to (re)create, per the same locked design: the indexes named in DB §9 (customer_id, order_status+payment_status, order_date, sales_owner on `orders`; order_id and product_id on `order_items`; order_id and payment_date on `payments`; order_id+event_timestamp on `order_events`), and Row Level Security enabled with the same unrestricted "Allow full access" policy already used by every other table in this codebase (`customer_purchases`, `product_batches`, and the superseded Orders migration) — new tables default to RLS-enabled-with-no-policy, which silently blocks the anon key the app uses if skipped.

## 3. Execution Order

Dependency-safe ordering — children dropped before their parent, parent created before its children, so no step ever fails on a foreign-key reference to a table that doesn't exist yet (or still exists when it shouldn't):

**Drop phase** (children → parent):
1. `order_events` (references `orders`)
2. `payments` (references `orders`)
3. `order_items` (references `orders`, `products`)
4. `orders` (references `customers`)

**Create phase** (parent → children):
5. `orders`
6. `order_items`
7. `payments`
8. `order_events`
9. Indexes (DB §9) — after all four tables exist.
10. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY "Allow full access"` on all four — last, once the tables and indexes are in place.

This whole sequence should be written as a **single transaction** when the SQL is drafted, so a failure partway through (e.g., a typo in step 7) leaves the database in its prior state instead of a half-dropped, half-created limbo — see §5.

## 4. Verification Checklist

To run **after** execution (none of this has been run yet — this is what "done" will look like):

- [ ] `orders` responds to a select naming locked-design columns only (`order_number, sales_owner, created_by, lost_reason, subtotal, discount_total, order_status, payment_status`) with no `column does not exist` error — confirms the legacy schema is fully gone, not just shadowed.
- [ ] `order_items` responds to a select naming `snapshot_sale_price, discount, is_gift, packaging_option` with no error.
- [ ] `payments` responds to a select naming `amount, payment_method, payment_date` with no error (this table has never existed before — first time it should resolve at all).
- [ ] `order_events` responds to a select naming `event_type, event_detail, actor, event_timestamp` with no error (same — first time it should resolve).
- [ ] All four tables report 0 rows (fresh tables, nothing carried over from the legacy schema — consistent with the Product Owner's "no migration value" decision).
- [ ] All four tables are reachable via the anon key with `200`, not `401`/`403` — confirms RLS + policy were applied, not just table creation.
- [ ] The four indexes' existence spot-checked (e.g., via `\d orders` / `\d order_items` in a DB console, or an `EXPLAIN` on a status+payment_status filter showing an index scan) — not verifiable through the anon REST key alone, needs DB console access.
- [ ] Re-run this repo's DoD sequence (`tsc`, `eslint`, `next build`) — no code changes are implied by this plan, so these should already pass; re-running just confirms nothing broke.
- [ ] Load `/orders` in a browser and confirm the empty state renders **without** a console error this time — the last time this was checked, the page silently swallowed a `42703 column orders.order_number does not exist` error and showed the same empty state for the wrong reason. A clean console alongside the same visual result is the actual pass condition here, not the visual result alone.
- [ ] Re-confirm `customers` and `products` are completely unaffected (row counts and a spot-check read unchanged) — this plan should have zero footprint outside the four Orders tables.

## 5. Rollback Strategy

The blast radius here is small and already bounded by the Product Owner's own findings — both existing tables are confirmed empty, and the Product Owner has explicitly ruled the legacy schema has no migration value. "Rollback" therefore means **safely recovering from a failed or partial execution**, not restoring lost data (there isn't any):

- **Wrap the whole sequence in a transaction** (§3) when the SQL is written. If any statement fails, the transaction rolls back automatically and the database ends up exactly where it started — no manual cleanup needed. This is the primary safeguard and should be non-negotiable for the actual script.
- **If the environment executing the SQL doesn't support wrapping arbitrary DDL in one transaction** (e.g., a tool that runs statements one at a time), every statement in this plan is written to be idempotent (`DROP TABLE IF EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`) — so if execution stops partway, simply re-running the same script from the top is safe and converges to the same end state, rather than erroring on "already exists" or leaving a mismatched partial schema.
- **No application code depends on the legacy schema** (confirmed in `ORDERS_MIGRATION_PLAN.md` §Backward Compatibility) — so there is no "put the old columns back so something keeps working" scenario to plan for. The only thing that currently reads `orders`/`order_items` is this module's own repository code, which already expects the *new* schema and is currently failing against the old one — this reset fixes that, it doesn't create a new compatibility problem.
- **The superseded migration file** (`supabase/migrations/20260712_orders_module.sql`) is left in place as a historical record rather than deleted — it documents the first (incomplete) attempt and why it didn't fully apply. The actual reset SQL, once approved, should be written as a **new**, separately dated migration file, not an edit to the old one — consistent with how this project treats other locked/superseded artifacts (new revision, not silent rewrite).
- **If something unexpected is found at execution time** (e.g., a row count above 0 on a re-check immediately before running, meaning something wrote to these tables between this plan's approval and its execution) — stop and re-confirm with the Product Owner before proceeding. This plan is based on a "0 rows, no migration value" state that was true at review time; it should be re-verified immediately before execution, not assumed still true after any delay.
- **Production is never in scope.** No Orders tables exist there, and nothing in this plan — or its eventual SQL — touches anything outside the Development database.
