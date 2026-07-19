# Infrastructure Investigation Report

**Status:** Investigation complete, per Product Owner decision. Documentation only — no code, migration, or database was modified in producing this report.

**Scope:** Why the Orders module is blocked in Development, specifically the `orders.order_number`/`sales_owner`/`created_by` column-not-found errors reported against the live application, and whether the approved migration `20260716_orders_database_foundation.sql` was ever actually applied.

**Sourcing note (important):** this report distinguishes two kinds of findings —
- **Directly verified in this session**, with a tool call and output I observed myself.
- **Reported by the Product Owner**, from work done outside this session's tool access (SQL Editor, `information_schema`/`pg_attribute` queries, REST API calls, a standalone `supabase-js` script). I have no SQL Editor, database-query, or JavaScript-runtime access in this session, so these items are recorded as reported, not independently re-verified here.

---

## 1. Timeline

1. **CRM Baseline V1, Sprint 0** begins — Package 1 (`customers`, `products`) authored as a migration file, reviewed, revised (UNIQUE constraints added), approved. Never executed by this session directly (no DDL-capable credential existed at that point).
2. **Package 2** (`master_data`, `tag_options`) authored, comment wording revised per Product Owner review, approved.
3. **Package 3** (`customer_purchases`) authored per locked spec, approved.
4. **Root-cause task (Vietnamese-language):** Orders page reported failing because Development's `orders` table was still on a legacy schema. `20260716_orders_database_foundation.sql` was reviewed and judged syntactically valid and spec-accurate, with two unverifiable preconditions flagged: `customers`/`products` must already exist, and the legacy `orders`/`order_items` must hold 0 rows.
5. **Package 4** (`product_batches`, `product_images`) authored, approved.
6. **`docs/CRM_DATABASE_SPECIFICATION.md`** created as the schema Source of Truth, covering the four approved Package 1/2 tables, later extended for Package 4.
7. **"Package 5" (Orders Foundation) attempted** — a new migration file was authored citing `docs/ORDERS_DATABASE.md`. **Rejected** by the Product Owner: a migration for this exact scope already existed (`20260716_orders_database_foundation.sql`); creating a second one was a duplicate.
8. **Line-by-line Review Report** produced for the existing `20260716_orders_database_foundation.sql` (no execution, no edits). Found schema-correct against `docs/ORDERS_DATABASE.md`; flagged an asymmetric safety check, the absence of an `updated_at` trigger, and that its live-state assumptions predated this session's other work and were unverified.
9. **"Orders Foundation STATUS PASS"** reported by the Product Owner. `CRM_DATABASE_SPECIFICATION.md` extended with Sections 7–10 (`orders`, `order_items`, `payments`, `order_events`), sourced from that migration file and `docs/ORDERS_DATABASE.md`.
10. **`customer_purchases` documentation gap** closed — Section 11 added after Package 3's PASS status was confirmed.
11. **"Orders Module is BLOCKED"** — a fresh, repository-file-only investigation (no database access permitted) found that a second, duplicate Orders-foundation-shaped file (`20260716_crm_baseline_orders_foundation.sql`, my rejected Package 5 output) still physically existed in `supabase/migrations/` alongside the approved file — flagged as a Root Cause candidate, pending live-database confirmation this session could not perform.
12. **Repository Cleanup approved and executed:** the duplicate file was moved (not deleted) from `supabase/migrations/` to `supabase/rejected_migrations/`.
13. **Supabase CLI installed** via `npm install -g supabase` (v2.109.1, confirmed working).
14. **`supabase link --project-ref uvbbevnhytuxledbxapq`** initially blocked — `supabase login`'s automatic browser flow cannot run in this session's non-TTY shell. Authentication was subsequently completed outside this session's visible tool calls (presumably via a manually generated access token, as guided), and the link succeeded — confirmed against `crm-thubinh-dev` (ref `uvbbevnhytuxledbxapq`, `ACTIVE_HEALTHY`, `linked:true`), distinct from the unlinked `crm-thubinh` (ref `ktvrgnhpdarsachxlguy`, presumed Production).
15. **`supabase migration list` run (read-only):** 22 local migration files found; **every single one** shows an empty `remote` field, meaning the Supabase CLI's own tracked migration-history ledger records zero migrations ever applied through the CLI — including `20260716_orders_database_foundation.sql`.
16. **`supabase db diff --linked` attempted** — blocked immediately: shadow-database provisioning requires Docker Desktop, which is not installed. Product Owner subsequently ruled out installing Docker.
17. **`supabase db dump --linked --schema public` attempted** — blocked for the same underlying reason (the CLI's dump path also depends on a Dockerized `pg_dump`). No local `pg_dump` or `psql` binary exists on this machine either, ruling out a Docker-free CLI path.
18. **Product Owner reports five additional evidence items** (SQL Editor, `information_schema`, `pg_attribute`, REST API, standalone `supabase-js`) — see Evidence below.
19. This report.

---

## 2. Evidence Collected

| # | Evidence | Source | Verified in this session? |
|---|---|---|---|
| 1 | SQL Editor confirms `orders` contains `order_number`. | Reported by Product Owner | ❌ Not independently verified (no SQL Editor access in this session). |
| 2 | `information_schema` confirms `order_number`. | Reported by Product Owner | ❌ Not independently verified (no database-query access in this session). |
| 3 | `pg_attribute` confirms `order_number`. | Reported by Product Owner | ❌ Not independently verified. |
| 4 | REST API returns `42703` (Postgres "undefined column") against `orders`. | Reported by Product Owner | ❌ Not independently verified (no REST/API call made in this session). |
| 5 | Standalone `supabase-js` script reproduces the same `42703`. | Reported by Product Owner | ❌ Not independently verified (no JS runtime invoked in this session). |
| 6 | `supabase migration list` shows 22 local migrations, **all** with an empty `remote` field. | This session | ✅ Directly observed — full command output captured. |
| 7 | `supabase db diff --linked` fails at shadow-database provisioning: Docker Desktop not installed. | This session | ✅ Directly observed. |
| 8 | `supabase db dump --linked --schema public` fails for the same Docker dependency; no local `pg_dump`/`psql` fallback exists. | This session | ✅ Directly observed. |
| 9 | The approved migration file `20260716_orders_database_foundation.sql` defines `order_number`, `sales_owner`, `created_by` (and 12 other columns) on `orders`, matching `docs/ORDERS_DATABASE.md` column-for-column. | This session (repository review) | ✅ Directly verified — this is a fact about the migration file's contents, not about the live database. |
| 10 | A second, functionally-overlapping Orders-foundation file existed in `supabase/migrations/` until Repository Cleanup moved it to `supabase/rejected_migrations/`. | This session | ✅ Directly performed and verified. |

---

## 3. Confirmed Facts

- The Development project is correctly linked (`crm-thubinh-dev`, ref `uvbbevnhytuxledbxapq`), distinct from the unlinked Production project.
- The Supabase CLI's own tracked migration-history table has **no record of any of the 22 local migrations being applied through the CLI** — this is true across the board, not specific to Orders.
- `docs/ORDERS_DATABASE.md` and `20260716_orders_database_foundation.sql` both name `order_number`, `sales_owner`, and `created_by` as required columns on `orders`.
- Neither `supabase db diff` nor `supabase db dump` can run in this environment without Docker, and no Docker-free CLI alternative (`pg_dump`/`psql`) exists locally.
- A duplicate Orders-foundation migration file existed in the migrations folder until this session's Repository Cleanup task removed it (by relocation, not deletion) from the CLI's scan path.

## 4. Unknown Facts

- Whether `orders` (and its columns, including `order_number`) was created via a CLI-tracked migration or via raw SQL pasted directly into the Supabase Dashboard SQL Editor. The CLI's empty migration ledger cannot distinguish these two cases — manual SQL Editor execution leaves no trace in that ledger either way.
- Whether `sales_owner` and `created_by` (and the remaining columns of the approved 15-column shape) have been confirmed to exist at the catalog level the same way `order_number` is reported to have been — not stated in the evidence provided.
- Whether PostgREST's schema cache has been reloaded (e.g. via `NOTIFY pgrst, 'reload schema'` or a project restart) since `order_number` was reportedly added — not confirmed as attempted.
- How much time elapsed between the column reportedly being added and the `42703` error being observed/reproduced.
- Whether the `42703` error is isolated to specific columns/queries or affects every column on `orders`.

## 5. Final Conclusion

The available evidence — Postgres' own catalog (`information_schema`, `pg_attribute`) and the SQL Editor (both of which read directly from Postgres' live system catalog) reportedly agreeing `order_number` exists, versus the REST API and `supabase-js` (both of which go through PostgREST) reportedly returning `42703` for the same table — is internally consistent with a specific, already-documented risk in this project: **PostgREST schema-cache propagation lag**, explicitly named as a risk for this exact migration in `docs/ORDERS_DATABASE_FOUNDATION.md` §6 before it was ever applied ("Postgres' own catalog can show the new tables/columns while PostgREST's cached schema hasn't refreshed yet, producing exactly the `42703`/`PGRST205` errors... even for a few moments after a genuinely successful migration").

Combined with the CLI's empty migration history — which is fully explained by the schema having been applied outside the CLI (most plausibly via the SQL Editor, consistent with this project's established pattern where a Product Owner/ops applies approved migrations manually) rather than by the migration never having run — the most coherent explanation supported by the reported evidence is:

**The Orders schema change was very likely applied to the underlying Postgres database, but PostgREST's cached schema on the API layer has not picked up the change, causing the application (which talks to Postgres exclusively through PostgREST/`supabase-js`) to see `42703` for columns that genuinely exist underneath.**

This is the most consistent reading of the evidence as reported, not a certainty — items in Section 4 (particularly whether `sales_owner`/`created_by` are confirmed at the catalog level, and whether a schema reload has already been tried) would materially firm this up or rule it out.

## 6. Recommended Next Action

1. **Reload PostgREST's schema cache** for `crm-thubinh-dev` — the standard, non-destructive remediation for this exact failure mode. Either:
   - Run `NOTIFY pgrst, 'reload schema';` via the SQL Editor (lightest touch, no downtime), or
   - Restart the project's API service from the Supabase Dashboard (Project Settings), which forces a full PostgREST reload if the `NOTIFY` approach doesn't resolve it.
2. **Immediately after**, re-run the exact same check that produced the `42703` (the REST API call / `supabase-js` script from Evidence #4–5) to confirm the error is gone.
3. **If it persists after a reload**, that would rule out the propagation-lag theory and point back toward the column genuinely being absent despite the SQL Editor/`information_schema`/`pg_attribute` reports — at that point, re-verifying `sales_owner` and `created_by` (and the rest of the 15-column shape) at the catalog level would be the next diagnostic step, not a re-run of the migration.
4. This report makes no changes and recommends none be made by me — every action above requires Dashboard/SQL Editor access this session does not have, and should be carried out by the Product Owner or ops, then reported back.

No code, migration, or database was modified in producing this report.
