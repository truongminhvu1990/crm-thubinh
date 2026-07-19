# Knowledge Vault Module — Migration Design

**Module:** Knowledge Vault
**Status:** Draft — Revision 1, awaiting Product Owner Migration Design approval.
**Phase:** Migration design only. No SQL, no migration file, no implementation were written for this document.
**Based on:** `docs/KNOWLEDGE_VAULT_SPEC.md` (Revision 2 — **LOCKED**), `docs/KNOWLEDGE_VAULT_UI.md` (Revision 2 — **LOCKED**), `docs/KNOWLEDGE_VAULT_DATABASE.md` (Revision 2 — **LOCKED**). This document does not redesign, reinterpret, or add business logic; every element below traces back to an already-locked section of one of those three documents, cited inline as (Spec §N), (UI §N), or (DB §N).

**Current state (reconfirmed):** no `knowledge_entries` table exists anywhere in the Development database, and no migration file for it exists in `supabase/migrations/` — confirmed during Development Increment 1 (live `PGRST205` error) and by a direct listing of the migrations folder. This is a pure "create from nothing" migration — unlike `ORDERS_RESET_PLAN.md`, there is no legacy table, no conflicting schema, and no drop step.

---

## 1. Migration Design

### 1.1 Table Creation Strategy

One new, purely additive table: `knowledge_entries`. No existing table is touched, altered, or dropped by this migration — Knowledge Vault has no legacy table to reconcile with (unlike Orders), so this is a single `CREATE TABLE` statement at the point the actual SQL is written, not a drop-then-create sequence.

**No RLS is enabled on this table** (explicit requirement; restates DB §1.8 Decision 5 — Read Only is application-level only). This is a deliberate departure from the RLS-enabled-plus-"Allow full access"-policy pattern every other table in this codebase uses (`customers`, `products`, `product_batches`, `customer_purchases`, the Orders tables) — see §1.9 Risks for why this needs explicit attention at execution time rather than being treated as "just skip a step."

No companion table, view, or trigger infrastructure is proposed as part of table creation itself — a single flat table, matching DB §1.1's "one new table" scope.

### 1.2 Columns

Exactly the 7 columns locked by `KNOWLEDGE_VAULT_DATABASE.md` §1.2, with this task's two explicit TEXT requirements applied:

| Column | Business Data Type | Required? |
|---|---|---|
| Internal ID | Internal ID (system-generated Primary Key, same pattern as `customers.id`/`products.id`) | Required |
| Title | TEXT | Required |
| Category | **TEXT** — application-validated against the 5 values locked in Spec §1.3 (DB §1.5, Decision 1: no ENUM) | Required |
| Body | TEXT (plain text only — no rich text, no HTML, no attachments, Spec §1.4 Decision 4) | Required |
| Tags | **TEXT** — comma-separated (DB §1.2, Decision 2: no array/list type) | Optional |
| Last Updated | Date/Timestamp — **maintained automatically by the database** on every row change (DB §1.2, Decision 3), never set by application code (there is no write path) | Required |
| Status | **TEXT** — this task's explicit requirement. Application-validated against `Active`/`Archived` only (Spec §1.4). **Flagged in Open Questions §2.1: `KNOWLEDGE_VAULT_DATABASE.md` §1.2 still lists Status as an Enum — this migration follows this task's explicit "status TEXT" instruction, but the two documents now disagree.** | Required |

No column beyond these 7 is introduced.

### 1.3 Constraints

Business-level only — no SQL, no `CHECK`/`NOT NULL` syntax:

- **Primary Key**: Internal ID — unique, always present (DB §1.3).
- **Not-null**: Title, Category, Body, Last Updated, Status. Tags may be empty (DB §1.2).
- **No Foreign Key of any kind** (explicit requirement; restates Spec §1.7/§1.9 Decision 6) — no column references `customers`, `products`, `product_batches`, or `master_data`.
- **No value-list constraint (CHECK or ENUM) on Category or Status.** Consistent with DB §1.5's exact reasoning for Category ("the 5-value constraint is application-validated, not database-typed") — this migration extends the same reasoning to Status now that both are TEXT. The database itself does not reject an invalid Category or Status value; only whoever prepares seed/import data (DB §1.8 Decision 7) is responsible for correctness. Whether a lightweight `CHECK` constraint (distinct from an ENUM type, and not explicitly ruled out by the "No ENUM" requirement) should be added anyway as a safety net is raised in Open Questions §2.3.
- **No uniqueness constraint on Title, Category, or Tags** — nothing in the locked Spec/UI implies Title must be unique, and duplicate titles across different categories are not prohibited anywhere.

### 1.4 Indexes

Restates `KNOWLEDGE_VAULT_DATABASE.md` §1.7's business-level index list — no SQL, no index type chosen:

| Access pattern | Index target |
|---|---|
| Every application read filters Status = Active (DB §1.4) | Status |
| Default Knowledge List order is Title ASC (UI §1.3, Decision 5) | Title |
| Category Filter + Entry Count (UI §1.2, Decision 6) | Category |
| ILIKE keyword search against Title/Body/Tags (DB §1.6, Decision 4) | Title, Body, Tags — **search-oriented, not a plain equality index.** A standard index does not accelerate a leading-wildcard `ILIKE '%term%'` search the way it would an equality or prefix match; a trigram-style index would be the typical mechanism for this in Postgres, but choosing one is implementation-time work, not decided here (DB §1.9 already scoped this as out of scope for the Database Design phase; it remains out of scope for this Migration Design too, see §1.10). |

### 1.5 Default Values

- **Internal ID**: system-generated on insert, same pattern as every other table's Primary Key in this codebase — no value supplied by whoever prepares seed/import data.
- **Last Updated**: defaults to the row's creation time on insert, and updates automatically on any subsequent change (DB §1.2, Decision 3) — the exact mechanism (a default expression vs. a trigger) is implementation detail, not decided here.
- **Tags**: defaults to empty when a seed/import row omits it (DB §1.2 — Optional).
- **Title, Category, Body**: no default — always required, always supplied explicitly by whoever prepares each row (DB §1.8, Decision 7 — Content Authoring is seed/import only).
- **Status**: **no default is assumed by this document.** Whether an omitted Status should default to `Active`, or whether the seed/import process must always specify it explicitly, is raised in Open Questions §2.4 rather than decided unilaterally here.

### 1.6 Rollback Strategy

Simpler than `ORDERS_RESET_PLAN.md`'s four-table sequence, because this migration touches exactly one new table with no dependents and no pre-existing data:

- Since table creation is the only operation, the complete and exact rollback is dropping that one table — nothing else in the schema references it (no Foreign Key anywhere points at `knowledge_entries`, per §1.3's "No FK" requirement, and nothing else has a Foreign Key *from* it either), so there is no dependency ordering to get right.
- No existing data is ever at risk — this is a purely additive migration against a table that doesn't exist yet, so "rollback" means undoing the creation, not recovering lost rows.
- If content has already been seeded/imported by the time a rollback is needed, that content is lost when the table is dropped — but since Content Authoring is seed/import only, outside the CRM (DB §1.8, Decision 7), the seed/import file itself remains the system of record; re-running it after the table is recreated restores the same state. The database is never the only copy of the content.
- When the actual SQL is drafted, the creation statement should be written idempotently (`CREATE TABLE IF NOT EXISTS`) so re-running the migration after a partial failure is safe rather than erroring on "already exists" — the same convention `ORDERS_RESET_PLAN.md` §5 already establishes for this codebase.
- **Production is never in scope.** No Knowledge Vault table exists there, and nothing in this design — or its eventual SQL — touches anything outside the Development database.

### 1.7 Verification Steps

To run **after** execution (nothing in this document has been executed):

- [ ] `knowledge_entries` responds to a select naming every locked column (`title, category, body, tags, last_updated, status`) with no "column does not exist" error.
- [ ] The table is reachable via the anon key (the same key `lib/supabase.ts` already uses everywhere else in this app) with `200`, not `401`/`403` — confirms the "No RLS" decision (§1.1) doesn't accidentally block the application's own reads, the specific risk named in §1.9.
- [ ] The table reports 0 rows immediately after creation, before any seed/import runs — a clean baseline.
- [ ] Development Increment 1's already-written, untouched code (`lib/knowledgeVault/knowledgeVault.service.ts`) — currently failing with `PGRST205` — successfully queries the table with no error once this migration is applied.
- [ ] `/knowledge-vault` loads with zero console error (replacing the currently-confirmed `PGRST205` error), and — once at least one row is seeded — Search, Category Filter, Title ASC sort, and Entry Count all behave correctly against real data (all four were already built and verified against an empty/error state in Increment 1; this step re-verifies them against real rows).
- [ ] No write succeeds against the table through any application code path — there is none, so this simply reconfirms the read-only promise still holds now that the schema physically exists to write to.
- [ ] Re-run this repo's DoD sequence (`tsc`, `eslint`, `next build`) — no code change is implied by this migration, so these should already pass; re-running just confirms nothing broke.
- [ ] Confirm every other existing table (`customers`, `products`, `product_batches`, `customer_purchases`, Orders tables) is completely unaffected — this migration should have zero footprint outside the one new table.

### 1.8 Backward Compatibility

- **No existing table, column, view, or application code is modified.** This migration is purely additive — the same "zero footprint outside the new table" property `ORDERS_RESET_PLAN.md` §4's last checklist item verifies for Orders' reset.
- **No existing module reads or writes `knowledge_entries`.** Confirmed by the "No CRM references" requirement (restating Spec §1.7/§1.9 Decision 6) — nothing in Products, Customers, Orders, Inventory, Reports, Market Intelligence, or Jade Intelligence names or depends on this table.
- **No naming collision.** Confirmed during Development Increment 1 (grep of `supabase/migrations/` and a live schema-cache error) that no table named `knowledge_entries`, or anything resembling it, exists anywhere in the current database or migration history.
- **Increment 1's application code needs no change.** It was already written against exactly this column list (`id, title, category, body, tags, last_updated, status`) during Development, before this migration existed — this migration is the missing prerequisite for already-completed application code, not a trigger for new development work.

### 1.9 Risks

- **No RLS is a real, disclosed security posture, not an oversight.** With RLS disabled and no Foreign Keys, this table is protected only by whatever general privileges the anon key holds at the database level — "read-only" is purely an application-code promise (no insert/update/delete anywhere in the app), the same category of risk `ORDERS_DATABASE.md` §13 already names for `order_events`' append-only guarantee and `KNOWLEDGE_VAULT_DATABASE.md` §1.8 Decision 5 explicitly accepts. Anyone holding the anon key (which ships in the client bundle, same as every other table) could in principle write to this table directly via the Supabase REST API, bypassing the application entirely.
- **This Supabase project's RLS default behavior for new tables is unconfirmed for this migration.** `ORDERS_RESET_PLAN.md` §2 notes that new tables in this project have previously defaulted to "RLS-enabled-with-no-policy," which silently blocks the anon key unless a policy is added. If that default still holds, "No RLS" needs to mean an explicit, deliberate step (disabling RLS, or enabling it with a permissive read policy) at execution time — not simply the absence of an `ENABLE ROW LEVEL SECURITY` statement, which could otherwise leave the table in a state that blocks the application's own reads. This needs to be confirmed against the live project at execution time, not assumed from this document.
- **No database-level value validation on Category or Status** (§1.3) means a typo during a future seed/import (e.g. a misspelled status, or a 6th category name that doesn't match Spec §1.3's locked list) is not rejected by the database — it would only surface if someone checks the seed/import data manually, or would simply vanish from every read (since the application always filters `Status = Active` — a misspelled status value would silently behave like "Archived," i.e. invisible, rather than erroring).
- **Status as TEXT is a requirement newly introduced by this task, not yet reflected in the LOCKED `KNOWLEDGE_VAULT_DATABASE.md` §1.2**, which still documents Status as an Enum. This is a genuine, disclosed inconsistency between two documents (Open Questions §2.1) — this Migration Design follows the explicit instruction given here rather than the older locked wording, but the two documents disagree until reconciled.
- **ILIKE search on Title/Body/Tags has no efficient index strategy decided anywhere yet** (§1.4) — a non-issue at small scale, but standard indexes don't accelerate substring search the way they accelerate equality/prefix lookups; a future full-text or trigram approach would need its own separate decision if the vault grows large.

### 1.10 Out of Scope

- Any DROP, ALTER, or modification to any existing table — purely additive (§1.1, §1.8).
- Any Row-Level Security policy of any kind (explicit requirement; DB §1.8 Decision 5, restated in DB §1.9 Out of Scope).
- Any Foreign Key or reference to `customers`, `products`, `product_batches`, or `master_data` (explicit requirement; Spec §1.7/§1.9 Decision 6).
- Any ENUM type, for Category or Status (explicit requirement; DB §1.5 Decision 1, extended here to Status).
- Any application code change — Development remains paused; no React or service code is touched by this document.
- Any actual SQL statement, migration file, or execution — design/description only, per this task's explicit instruction.
- Any seed or import of real content — happens after this migration is approved and executed, as its own separate step (DB §1.8 Decision 7), not part of this document.
- Any full-text-search infrastructure decision (trigram index, `tsvector`, or otherwise) — named as a risk (§1.9), not decided here, same as DB §1.9 already scoped it out of the Database Design phase.
- Any CHECK constraint on Category or Status — not proposed by this document (§1.3); whether one should exist is raised in Open Questions §2.3, not decided unilaterally.

---

## 2. Open Questions

1. **Status TEXT vs. the locked Database Design's Enum:** This task requires `status TEXT`, but `KNOWLEDGE_VAULT_DATABASE.md` §1.2 (LOCKED) still specifies `Status | Enum: Active/Archived`. Does this Migration Design's requirement amend the locked Database Design — needing a formal Revision 3 to `KNOWLEDGE_VAULT_DATABASE.md` for the two documents to agree — or should Status remain an Enum and this requirement be reconfirmed?
2. **RLS default behavior in this Supabase project:** Confirm whether leaving RLS disabled on a new table actually yields the intended open-read access via the anon key in this project's current configuration, or whether — per the precedent noted in `ORDERS_RESET_PLAN.md` §2 — new tables default to RLS-enabled-with-no-policy, which would need an explicit "disable RLS" step at execution time rather than simply omitting an "enable RLS" step.
3. **CHECK constraint as a safety net:** "No ENUM" is explicit, but a plain `CHECK` constraint is a different mechanism. Is a lightweight CHECK restricting Category to its 5 locked values (and Status to Active/Archived) acceptable as a safety net against seed/import typos, or is "application-validated only" intended to rule out any database-level value validation, not just ENUM specifically?
4. **Default value for an omitted Status:** Should a seed/import row that omits Status default to `Active`, or must the seed/import process always specify it explicitly with no database-level default at all?
5. **Last Updated auto-maintenance granularity:** DB §1.2 (Decision 3) locks this as "automatically maintained by the database," but doesn't specify whether it updates on every column change or only on content-relevant ones. Not blocking for this migration's approval, but worth confirming before the auto-update mechanism itself is chosen at implementation time.

---

Migration design only. No SQL written. No implementation. Stopping — waiting for Product Owner Review.
