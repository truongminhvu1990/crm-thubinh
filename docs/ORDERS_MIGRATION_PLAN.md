# Orders Module — Migration Plan (Existing `orders` Table vs. `ORDERS_DATABASE.md`)

**Sprint:** 1 — Phase 4, Migration Review
**Module:** Orders V1
**Status:** Draft — comparison and plan only. No SQL, no database changes. Awaiting Product Owner review.
**Trigger:** Sprint 1.1 Review surfaced that the Development database already contains an `orders` table with a legacy schema unrelated to the locked `ORDERS_DATABASE.md` design. This document reconciles the two before any migration SQL is written.
**Based on:** `docs/ORDERS_DATABASE.md` (approved, locked), compared against the live Development database's existing `orders` table. Inspected **read-only**, via the Supabase REST API using the public anon key — no DDL, no writes, no rows inserted or altered to produce this comparison.

**How the existing table was confirmed (not just taken on faith):** selecting the nine columns named in the task request (`id, order_code, customer_id, employee_id, order_date, total_amount, payment_method, status, notes`) succeeds. Selecting any locked-design column (`order_number, sales_owner, created_by, lost_reason, subtotal, discount_total, order_status, payment_status`) fails with a live Postgres error — `column orders.order_number does not exist` — confirming the locked design's columns are not present under any name. The table currently holds **0 rows**. Exact column data types, nullability, defaults, and any `CHECK` constraint on `status` could **not** be inspected (no schema-introspection access with the anon key) — every type/domain statement below is inferred from naming and codebase convention, not confirmed, and should be checked directly (Supabase Dashboard → Table Editor, or by someone with DB console access) before any `ALTER TABLE` is drafted.

**A direct consequence worth surfacing here, even though this document doesn't fix it:** the Increment 1 application code (`lib/orders/order.repository.ts`, `order.service.ts`) queries the locked-design column names. Every Orders List/Detail read is therefore currently failing against this table (the exact `42703` error above) — caught by the repository's error handling and rendered as an empty list rather than a visible error, so it silently looked like "zero orders" rather than "wrong schema." Also worth noting: the migration file written for the prior increment (`supabase/migrations/20260712_orders_module.sql`) used `CREATE TABLE IF NOT EXISTS orders`, which silently no-ops when a table of that name already exists — so none of that file's `orders` columns or constraints were ever actually applied. Neither of these is addressed here (no code or database changes in this task) — flagged for the Product Owner's awareness alongside the plan below.

---

## 1. Existing Fields

The live `orders` table, as confirmed above, with its inferred purpose and the locked-design field it corresponds to (if any):

| Existing column | Inferred purpose | Locked-design counterpart |
|---|---|---|
| `id` | Primary key | Internal ID |
| `order_code` | Business-facing order code | Order Number (`order_number`) |
| `customer_id` | Customer reference | Customer reference (`customer_id`) — same name |
| `employee_id` | A single staff reference | Split in the locked design into **two** fields — Sales Owner and Created By (Spec §6) — see §3 below |
| `order_date` | When the order was placed | Order date (`order_date`) — same name |
| `total_amount` | Order total | Total amount (`total_amount`) — same name, but the locked design makes this a **derived** rollup (Subtotal − Discount total, DB §4), not a directly-entered value |
| `payment_method` | A single payment method for the whole order | Relocated in the locked design to `payments.payment_method` — one method **per payment**, not one per order (DB §4, §3 "Deliberately not duplicated") |
| `status` | A generic status | Order status (`order_status`) — value domain unconfirmed, see §3 |
| `notes` | Free text | Note (`note`) — same meaning, plural/singular naming difference |

## 2. Missing Fields

Present in the locked design (`ORDERS_DATABASE.md` §4), absent from the existing table under any name:

- `sales_owner`
- `created_by`
- `lost_reason`
- `subtotal`
- `discount_total`
- `payment_status`
- `created_at`
- `updated_at`

(`total_amount` is not listed here — the column already exists — but see §1: its meaning needs to change from directly-entered to derived. That's a semantic change to an existing column, not a missing field.)

## 3. Fields to Rename

Straightforward, same-concept renames:

- `order_code` → `order_number`. The existing column already follows the same business-code convention this codebase uses elsewhere (`products.product_code`, `product_batches.batch_code`) — the locked design's reasoning for a separate, non-PK business code (DB §6) already fits what's here. What's unconfirmed: the existing column's actual format/generation rule. The locked design requires `OD-{YYYYMMDD}-{6-digit sequence}` (DB §3); with 0 rows in the table there's nothing to sample, so whatever format `order_code` currently follows (or whether it's even enforced) is an open question for whoever built the original table.
- `notes` → `note`. Trivial pluralization difference, same free-text meaning, no data to lose (0 rows).
- `status` → `order_status` — **rename is plausible but not confirmed safe.** The locked design constrains `order_status` to exactly `Draft` / `Reserved` / `Completed` / `Lost` (DB §8). The existing `status` column's allowed values are unknown — no `CHECK` constraint was inspectable, and there's no data to sample. This should be confirmed (does `status` have a constraint today? what values does it enforce, if any?) before treating this as a safe rename rather than a value-domain migration.

**Fields with no direct target — not a rename, need a decision:**

- `employee_id` — the locked design has no single equivalent. It splits "who's responsible for this order" into two deliberately distinct facts (Spec §6): **Sales Owner** (reassignable, drives sales attribution) and **Created By** (immutable audit fact, who opened the record). A single `employee_id` can't become both without an explicit rule for what happens to existing data — moot today since the table is empty, but the rule still needs deciding before this migration is written (see §6).
- `payment_method` — not a column-level rename at all. The locked design moves this concept to a **different table** (`payments`, one row per payment event, DB §3), specifically so an order can have multiple payments with different methods (deposit in cash, balance by bank transfer, etc. — Spec §4). Renaming `orders.payment_method` in place would preserve the old single-method-per-order limitation the locked design was written to remove.

## 4. Fields to Add

New columns needed on `orders` to match the locked design (DB §4), none of which exist under any name today:

| Field | Business type | Notes |
|---|---|---|
| `sales_owner` | Text (master-data reference) | Reassignable while order is open (Spec §6) |
| `created_by` | Text (master-data reference) | Set once at creation, never changes (Spec §6) |
| `lost_reason` | Text (master-data reference) | Required only when `order_status = Lost` (DB §8) |
| `subtotal` | Decimal | Derived rollup from order items |
| `discount_total` | Decimal | Derived rollup from order items |
| `payment_status` | Text, enum | `Unpaid` / `Partially Paid` / `Paid`, derived from `payments` (DB §8) |
| `created_at` | Timestamp | Audit only |
| `updated_at` | Timestamp | Audit only |

## 5. Fields to Keep

Existing columns that already match the locked design closely enough to keep their current name, **pending type/constraint confirmation** (§Risks):

- `id` — assumed uuid primary key, matching every other table's convention in this codebase; not confirmed.
- `customer_id` — assumed uuid, references `customers(id)`; name and concept match DB §4/§7 exactly.
- `order_date` — assumed `date`; name and concept match DB §4 exactly.

## 6. Data Migration Strategy

**Current state simplifies this considerably: the table has 0 rows today.** There is no existing data to preserve, convert, or risk losing right now. The strategy below is written as if data could exist, so it doesn't have to be re-derived the moment someone puts a row in this table before the real migration lands.

- **Structural changes** (adding the eight missing columns, §4) are additive and safe regardless of row count — no existing data is threatened by adding nullable/defaulted columns.
- **`order_code` → `order_number`:** a plain rename is safe for existing rows *if* the existing values already happen to fit `OD-{YYYYMMDD}-{6-digit sequence}` — unconfirmed, and irrelevant today (0 rows). If real `order_code` values exist before this migration runs, each would need converting to the target format or the format requirement revisited — a decision to make then, not now.
- **`status` → `order_status`:** needs the existing value domain confirmed first (§3). If/when rows exist, each existing `status` value would need an explicit mapping to `Draft` / `Reserved` / `Completed` / `Lost` — this can't be a blind rename if the legacy values don't already match that vocabulary.
- **`employee_id` → `sales_owner` + `created_by`:** if rows ever exist before this is resolved, the only mechanical option is backfilling **both** new fields from the one `employee_id` value (i.e., treat "whoever's on the order" as both creator and owner at migration time) — a deliberate approximation, not a true recovery of two facts that were never separately recorded. This needs Product Owner sign-off as an accepted approximation, not something to decide silently in a migration script.
- **`payment_method` → `payments` table:** if an order row has a `payment_method` and a `total_amount` before this migration runs, the only way to carry that forward is synthesizing one `payments` row per order (amount = the order's `total_amount`, method = the old `payment_method`, date = unknown — probably `order_date` as a best guess). This assumes the order was paid in full in one shot, which may not be true — another approximation needing explicit sign-off, not a silent default.
- **`subtotal` / `discount_total`:** with no `order_items` data behind any existing order row, these can only be backfilled as `subtotal = total_amount`, `discount_total = 0` — another approximation, safe only because there's currently nothing to get wrong.
- **Net effect today:** because the table is empty, the actual migration can most likely be a straightforward additive/rename pass with no backfill logic exercised at all. The approximations above exist only as a documented fallback in case that stops being true before this plan is acted on.

## 7. Backward Compatibility

- **No existing application code in this repository reads or writes the legacy `orders` table.** A repo-wide search found exactly one file referencing an `orders` table: this session's own `lib/orders/order.repository.ts` — and that file already expects the *locked* schema, not the legacy one, which is why it's currently failing against live data (see the note at the top of this document). There is therefore no in-repo feature whose behavior this migration would need to preserve.
- **Caveat, not an assumption to build on:** this only covers code in this repository. Whether anything outside it (a BI/reporting tool, a manual export, a script run by someone else against this Supabase project) reads the legacy `orders` table is unknown to me and should be confirmed by the Product Owner before this table is altered, not assumed absent.
- Because the table is empty, there's also no existing *data* whose backward compatibility needs protecting today — the concern is purely about external consumers of the schema, not stored records.

## 8. Risks

- **Type/constraint blind spot.** Every mapping in this document is inferred from column names alone — actual data types, nullability, defaults, and any constraint on `status` were not inspectable with the access available here. Treat every "assumed" statement above as needing direct confirmation (Supabase Dashboard or DB console) before any `ALTER TABLE` is drafted, not as settled fact.
- **`employee_id` → Sales Owner + Created By is a lossy one-to-many split** with no automatic, faithful mapping — it needs an explicit Product Owner–approved approximation rule (§6), not a mechanical rename, the moment real data exists.
- **`payment_method` relocating to the `payments` table is a structural, cross-table change**, not a column rename — any script touching this must synthesize `payments` rows, and do so under an explicit "assume paid in full" approximation that should be named and approved, not buried in migration code.
- **`order_code` / `status` format and value-domain compatibility with the locked design is unconfirmed** because the table is empty — a "quiet until it isn't" risk: a row inserted into the legacy schema before this migration lands, using old conventions, won't fit the locked design's rules (`OD-{YYYYMMDD}-{6-digit}` format, `Draft/Reserved/Completed/Lost` domain) without conversion.
- **The prior migration file's `CREATE TABLE IF NOT EXISTS orders` silently no-op'd** against this pre-existing table. Any future migration touching `orders` must use `ALTER TABLE` (or an equivalent guarded-modify approach), not `CREATE TABLE IF NOT EXISTS` — otherwise it will continue to silently do nothing, exactly as it did before.
- **This review was scoped to the `orders` table only, per the task.** `order_items` also already exists in the live database (confirmed in the prior review) and has not been schema-verified against the locked design the way `orders` was here — the same reconciliation exercise is needed for `order_items` (and, once created, `payments`/`order_events`) before any of them are trusted to match the locked design. Flagged as necessary follow-up work, not resolved by this document.
- **Zero rows today is the current state, not a guarantee.** If this plan sits unreviewed for a while and something starts writing to the legacy `orders` table in the meantime, every "no data to migrate" statement in §6/§7 goes stale and needs re-verifying before the migration is actually written.
