# P7 — Audit Logging

**Status:** Design + schema drafted. **Not implemented at the code level** — see §4 for why, and what remains as a fast-follow once the Product Owner approves the migration.

**Scope:** who changed what, when, in the modules that matter most for accountability in a sales/inventory business — Orders (status changes, payments, cancellations), Customers, Products, Inventory-affecting writes. Not a general-purpose event-sourcing system, not user-facing analytics — a plain append-only trail for "who did this and when," queryable by an admin later if a dispute or data question comes up.

---

## 1. Why this doesn't already exist

There is no audit trail anywhere in the current schema. The closest existing thing is `order_events` (Orders' own domain-specific timeline — "Reserved," "Payment Added," "Marked Lost," etc., built for the Order Detail UI, per `docs/ORDERS_UI.md` §9.2) — that's a *business* event log for one module's UI, not a cross-module technical audit trail, and this review does not touch or repurpose it (Orders' UI depends on its exact shape).

## 2. Design

**Table:** `audit_log` (drafted in `supabase/migrations/20260718_audit_log_foundation.sql`, **not applied** — see §4).

| Column | Purpose |
|---|---|
| `id` | Primary key. |
| `occurred_at` | When the change happened (DB-assigned `now()`, not client-supplied — can't be backdated by a bug or a malicious client). |
| `actor` | The signed-in user's email, resolved server-side via `supabase.auth.getUser()` at the point of the write — **not** the client-supplied `created_by`/`sales_owner` fields Orders currently uses (see `docs/P7_AUTHORIZATION_REVIEW.md` Finding 2 — those aren't tied to a real session identity and shouldn't be trusted as the audit actor). Nullable only for the theoretical case a session check fails after the write already succeeded — should be rare to never in practice. |
| `action` | `create` / `update` / `delete`. |
| `table_name` / `record_id` | What was changed. |
| `changes` | For `update`: `{ field: { before, after } }` for just the fields that changed, not a full row dump (keeps rows small, and directly answers "what changed" rather than requiring a diff at read time). For `create`/`delete`: the full row as it looked at that moment. |
| `request_path` | The API route that made the change, to cross-reference with `lib/logger.ts` output for the same request if deeper investigation is ever needed. |

**Append-only by design:** RLS grants `INSERT`/`SELECT` to `authenticated` only — no `UPDATE`/`DELETE` policy exists for any role, so nothing (including a compromised app server, short of a raw Postgres superuser session) can quietly edit or remove an existing audit row through the app's normal access path.

**Where it would be written from:** server-side, inside each API route's write handler, immediately after a successful Supabase write — never client-side (a browser-side audit write is trivially spoofable/skippable). Candidate call sites, in priority order: `app/api/orders/**` (every POST/PUT/DELETE — 8 routes total: create, update, delete, add item, update item, remove item, add payment, mark lost, complete, reassign owner), then Customers/Products create-edit-delete once those get their own `/api/` routes (today Customers/Products write directly from client components via `lib/customer.service.ts`/`lib/product.service.ts` — see §3).

## 3. A real constraint this design surfaces: most writes today don't go through a server route at all

Orders is the only module with API routes (`app/api/orders/**`). Customers, Products, Batches, Settings, and Product Images all write **directly from client components** to Supabase via `lib/customer.service.ts`, `lib/product.service.ts`, etc. — there is no server-side interception point for those writes today, so an audit log can only observe them by inserting a second, client-issued call right after the primary write (weaker: skippable by a client that simply doesn't make the second call, or by a direct REST call bypassing the app entirely) rather than a single trustworthy server-side chokepoint the way Orders has.

**This is out of scope to fix here** — moving Customers/Products/Batches/Settings writes behind server routes the way Orders is would be a real architecture change ("no database redesign," "no new CRM features," "minimize code changes," "keep architecture unchanged" all point away from this). Flagged as a real limitation of what audit logging can guarantee for those five modules until/unless the Product Owner decides those writes should move server-side too — not something this review decides unilaterally.

## 4. Why this is design-only, not implemented in code

`audit_log` is a new table. This project's standing database rule — reinforced on every prior schema change across every module built so far (Orders, Inventory, Reports, Knowledge Vault) — is: **draft the migration, do not apply it, wait for explicit Product Owner approval, then apply, then implement against it.** Writing `lib/audit.ts` and wiring it into `app/api/orders/**` today, before the table exists, would mean shipping code with no table to write to (broken at runtime) or shipping dead code with no caller (an explicitly disallowed half-finished implementation) — neither is acceptable.

**What's ready the moment the migration is approved and applied:** a `logAudit(action, tableName, recordId, changes, request)` helper that resolves `actor` via `supabase.auth.getUser()` and inserts one row, called from the end of each Orders route handler listed in §2. That's a small, mechanical next step once the schema exists — not proposed as code in this review, to avoid exactly the half-finished-implementation problem above.

## 5. Summary

| Item | Status |
|---|---|
| `audit_log` schema design | Done |
| Migration SQL | Drafted, `supabase/migrations/20260718_audit_log_foundation.sql` — **not applied** |
| Write-path integration (`lib/audit.ts` + Orders route call sites) | Not started — blocked on migration approval, per §4 |
| Customers/Products/Batches/Settings coverage | Not achievable without moving those writes server-side first (§3) — flagged for a separate Product Owner decision, not implemented |

No code was added that references a table that doesn't exist. No migration was applied.
