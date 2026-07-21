# Production Readiness — Database Design

**Sprint:** v4.0.1 — Production Readiness (no new business features)
**Module:** Cross-cutting (Production Readiness) — not a product module
**Status:** Draft — Revision 2. Product Owner issued 4 scoped Decisions (27–30) against Revision 1; applied below, nothing else changed. Awaiting Product Owner Database Design approval.
**Phase:** Database design only. No SQL, no migration script, no implementation were written for this document. No existing table/column is altered, renamed, or dropped anywhere in this design.
**Based on:** `docs/PRODUCTION_READINESS_SPEC.md`, Revision 2 — **approved and LOCKED**. This document defines only the database-level impact of that spec's 8-dimension Production Ready definition (Decision 22) — it does not redesign, reinterpret, or add business logic to any frozen module, and every candidate new table below is purely additive, optional, and clearly marked as needing its own approval before it becomes a migration.

---

## 1. Database Architecture

No architectural change to the schema itself. What changes is the **number of Postgres instances the same schema must exist in identically**:

- Today: 2 Supabase projects, same schema, kept in sync by manually applying the same migration files to both (`docs/PRODUCTION_READINESS_SPEC.md` §2, §11).
- If §21's Go Live Strategy (Staging) is adopted: 3 Supabase projects, same requirement, one more place migrations must be applied in the same order.
- No new database technology, no new connection pattern, no change to how the app talks to Postgres (`@supabase/ssr`/`@supabase/supabase-js`, unchanged) — this section exists only to state plainly that "Production Readiness" does not imply a different database architecture, only more disciplined operation of the one that already exists.

---

## 2. Environment Separation

| Environment | Status | Database impact |
|---|---|---|
| **Development** | Exists (`crm-thubinh-dev-v2`) | None — already the target of every migration written so far. |
| **Staging** | **Does not exist** (Spec §21) | If stood up: a new, empty Supabase project, brought to schema parity by applying every existing migration file in order (§4 below) — not a schema fork, not a different structure, the identical schema Development and Production already share. No new table is required to create Staging itself; standing it up is an infrastructure/provisioning action, not a database design change. |
| **Production** | Exists (`crm-thubinh`, unlinked from this repo's CLI) | None — this document defines policy/process around it, it does not touch its schema. |

**The one genuine schema-adjacent question this raises:** how do we know, at any point, whether Development/Staging/Production actually have the same set of applied migrations? Addressed in §4 below, not by adding a new table to every environment (see §4's reasoning for why a new custom tracking table is *not* recommended).

---

## 3. Migration Strategy

Restates and formalizes the already-locked convention (`PRODUCTION_READINESS_SPEC.md` §11), extended to a 3-environment world rather than 2:

- Every migration remains a single, additive-only, transaction-wrapped (`BEGIN`/`COMMIT`), dated SQL file under `supabase/migrations/`, with a verification block of read-only `SELECT`s appended — unchanged, not redesigned here.
- **Promotion order is always Development → Staging → Production**, never applied to two environments simultaneously, never applied to Production first. A migration is only promoted after its target environment's own DoD (`tsc`/`build`/`lint`, plus this project's live-verification convention) passes against the *previous* environment.
- No migration is ever edited after being applied to any environment (roll-forward only, §5) — this applies identically across all three environments, not just Production.

### 3.1 Migration Verification Checklist (Decision 30)

Run after **every** migration applied to Staging or Production (Development is exempt — it's where mistakes are expected to surface first, and this checklist's cost is only worth paying once a migration is being promoted):

- [ ] **Migration completed** — the CLI/tool reported success, and the migration's own appended verification block (already this project's standing convention, §3) returns the expected shape with no error.
- [ ] **Record counts** — row counts for every table the migration touched (created, altered, or seeded) match expectations: new tables have exactly their seeded row count (or zero, if unseeded), altered tables have the same row count as before the migration (since this project's migrations are additive-only and never delete rows).
- [ ] **Constraints** — every `PRIMARY KEY`/`FOREIGN KEY`/`UNIQUE`/`CHECK` constraint the migration defined actually exists and is enabled (a read-only `information_schema`/`pg_constraint` check, conceptually — not written here), matching the migration file's own intent.
- [ ] **Application startup** — the app boots against the migrated database without error (relevant because `lib/env.ts`/`instrumentation.ts` already fail fast on missing config, and a schema mismatch between what the app's TypeScript types expect and what the database actually has would otherwise only surface at first query time, not at boot).

This checklist is deliberately the same shape regardless of which environment it's run against (Staging or Production) — running the identical checklist in both is what makes a Staging pass meaningful evidence for the following Production promotion, rather than two unrelated ad hoc checks.

---

## 4. Migration Ordering

Two migrations already exist in the repository, drafted but **not yet applied anywhere**, per the locked spec (§10, §17). Their relative ordering, if and when the Product Owner authorizes applying them, is:

1. `20260718_performance_indexes.sql` (index-only, purely additive `CREATE INDEX IF NOT EXISTS`) — no dependency on anything else; safe to apply independently, in any environment, at any time once authorized.
2. `20260718_audit_log_foundation.sql` (the drafted, never-adopted `audit_log` table) — **not recommended for application at all** (see §8) now that `activity_logs` is the project's real, working audit mechanism; ordering is moot if this is retired instead of applied.

**On tracking which migrations have actually been applied where (the Critical checklist item from the locked spec, §15):** this document does **not** recommend building a new custom "migrations applied" tracking table. Supabase's own CLI already maintains one automatically (`supabase_migrations.schema_migrations`, in its own schema, separate from the application's `public` schema) whenever a migration is applied *through the CLI*. The real gap — already named in `INFRASTRUCTURE_INVESTIGATION_REPORT.md` — is that migrations have historically sometimes been applied outside the CLI (e.g., via the Supabase SQL Editor directly), which is what makes that ledger unreliable. **The fix for this is a process rule (always apply via `supabase db query --linked -f <file>` or `supabase db push`, never the SQL Editor, for anything after this document), not a new database table** — building a second, custom ledger table alongside a native one Supabase already provides would be redundant schema, not a real fix for a process gap.

---

## 5. Rollback Strategy

No change from the already-locked convention (`PRODUCTION_READINESS_SPEC.md` §12) — restated here at the database-design level, extended across 3 environments:

- **Schema rollback:** roll-forward only, everywhere. A migration found to be wrong after being applied to Development or Staging is corrected by a new migration file before it is ever promoted further — it is never edited or reverted in place, and it never reaches Production in its wrong form to begin with, which is the entire point of a Staging gate (§2).
- **Data rollback:** unchanged — depends entirely on backup/PITR availability (§6), not a schema-level concern.
- **The Permission Center's existing purely-additive design (nullable columns, new tables only, no altered constraint) remains the model** every future migration — including anything this document's candidate tables (§6, §7) might eventually become — should follow, precisely because it makes rollback-by-simply-not-using-the-new-thing low-risk. Not a new rule invented here, an existing one reaffirmed.

---

## 6. Backup Metadata

**Candidate new table — optional, not authorized by this document, needs its own explicit approval before becoming a migration.**

The locked spec (§4) found that backup/PITR posture is unconfirmed and can only be checked in the Supabase Dashboard per project — nothing in the application schema today records that fact anywhere queryable. Two ways to close that gap exist; this document names both rather than choosing one:

- **Option A (no schema change):** track backup posture confirmation in a written runbook/checklist document (like the locked spec's own §15 checklist), re-confirmed manually on a schedule. Zero database impact.
- **Option B (candidate table, if the Product Owner wants it queryable in-app):** a small `backup_metadata` table — one row per (environment, confirmation date) — recording what was confirmed in the Dashboard that day: `environment` (text), `checked_at` (timestamptz), `plan_tier` (text), `pitr_enabled` (boolean), `retention_days` (integer, nullable), `storage_backup_confirmed` (boolean), `confirmed_by` (text, staff name — no FK to `staff`, since this may be checked by someone outside the staff roster, e.g. an ops contact), `notes` (text). Purely additive, no relationship to any existing table, RLS matching the existing permissive convention (or, given this is operational/ops metadata rather than business data, arguably fine to restrict to Owner-only — a scope decision for whoever approves this table, not decided here).

**Scope rule (Decision 27), binding on Option B if it's ever built:** `backup_metadata` stores **operational metadata only** — every column listed above describes a fact *about* a backup (when it was checked, what plan tier, whether PITR is on, who confirmed it), never the backed-up data itself. **It must never contain business or customer data** — no customer rows, no product rows, no sample data of any kind, not even for verification purposes (a future temptation this rule is specifically written to head off, e.g. someone adding a "sample restored customer name" column to "prove" a restore worked — that verification belongs in a restore drill's own record, §7, as a row count or boolean, never as an actual copied business-data value).

**Recommendation:** Option A is lower-risk and requires zero schema change — this document leans toward it, but presents Option B's shape in case the Product Owner prefers an in-app record over a document that can go stale unnoticed. The Decision 27 scope rule applies regardless of which option is chosen — if Option A's runbook is used instead, the same "operational facts only, never business data" boundary applies to what gets written in it.

---

## 7. Restore Verification

Same two-option framing as §6, since it's the same class of gap (a process fact with no current database home):

- **Option A (no schema change):** a periodic restore drill (e.g., quarterly) — restore a backup to a scratch project, verify row counts/spot-check data, document the result in the same runbook §6 Option A proposes. Zero database impact.
- **Option B (candidate table, paired with §6's `backup_metadata` if built):** a `restore_drill_log` table, purely additive, same shape as §6.

**Minimum record requirements (Decision 28), binding regardless of which option is chosen.** Every restore drill, whether logged as a table row (Option B) or a runbook entry (Option A), must capture at least these six fields:

- **Timestamp** — when the drill was performed (`drilled_at`, timestamptz, if Option B).
- **Operator** — who performed it (`operator`, text — same reasoning as §6's `confirmed_by`: no FK to `staff`, since this may be someone outside the staff roster).
- **Backup reference** — which backup was restored from (`backup_reference`, text — e.g. a Supabase PITR timestamp or snapshot identifier; deliberately a reference/label, not a copy of the backup's contents, consistent with Decision 27's operational-metadata-only boundary).
- **Restore duration** — how long the restore took (`restore_duration`, interval or integer seconds).
- **Result** — success or failure, and if failure, why (`result`, text or a `success` boolean plus a `failure_reason` text — either shape satisfies this requirement; not locked to one here).
- **Notes** — free text for anything the other five fields don't capture.

If Option B is built, `restore_drill_log`'s column list is superseded by this six-field minimum (row-count/spot-check detail from the original sketch can still live inside **Notes**, not as separate required columns). If Option A (no table) is chosen instead, **these same six fields must exist as required entries in the operational runbook** for every drill — a drill log missing any of them (in either form) does not satisfy this document's Restore Verification requirement.

**Why this section exists separately from §6:** confirming a backup *exists* (§6) is not the same fact as confirming it can actually be *restored from* — the locked spec's own Backup Strategy section already draws this distinction (§4 vs. §5 in that document), and this document keeps that distinction rather than collapsing "backup" and "restore" into one record.

---

## 8. Audit Data Retention

- **What this governs:** `activity_logs` — the project's real, live audit mechanism (confirmed in the locked spec, §17), not the drafted-and-abandoned `audit_log` design from the P7 era.
- **No schema change proposed.** `activity_logs.created_at` already exists and is sufficient to express any future retention policy as a query predicate (`WHERE created_at < now() - interval '...'`) — retention is a **policy decision**, not something requiring a new column.
- **Recommended policy, pending Product Owner confirmation, not decided unilaterally here:** retain indefinitely for now. Current volume (per the locked spec's own scale assessment, §19 — hundreds to low thousands of rows across all tables) makes storage cost a non-issue, and this project's standing rule ("never delete or truncate data") argues against introducing an automatic deletion job without an explicit business or compliance reason to do so. If a real compliance requirement is ever named (the locked spec's §17 already flags that none has been, to date), retention/deletion policy would need to be revisited then, against whatever that requirement actually specifies — not guessed at now.
- **What this document explicitly does not do:** propose an archival table, a partition scheme, or a deletion job for `activity_logs` — none is justified at current volume, and building one now would be solving a problem this project doesn't have yet.

---

## 9. Log Retention

- **This is not currently a database concern at all.** Application logs (`lib/logger.ts`) write to `console.log`/`warn`/`error` only — there is no log table in Postgres, so there is nothing in the schema for a retention policy to govern. Retention today is entirely a function of whatever the (still-undocumented, per the locked spec §1/§3) hosting platform's own log capture retains, for however long it retains it.
- **This document does not propose persisting application logs into Postgres.** Doing so would conflate two different kinds of data with very different volume/query/retention profiles (high-volume, ephemeral, `console`-shaped operational logs vs. low-volume, permanent, structured `activity_logs` business-audit records) — mixing them would be a real design mistake, not a Production-readiness improvement. If log persistence/searchability is wanted (the locked spec §7 already names this as a gap), the standard answer is an external log-aggregation service, not a new Postgres table — a monitoring-vendor decision (locked spec §6), not a database design one.

---

## 10. Index Review

A review of what already exists, not a proposal for new indexes beyond what's already drafted (per the locked spec §10):

- **Already applied, confirmed good precedent:** every table `staff`, `activity_logs`, `roles`, `permissions`, `role_permissions`, `role_data_scopes`, `permission_sensitive_fields` etc. has an index on every foreign-key column and on the columns its own module's locked UI actually filters/sorts by (`PERMISSION_DATABASE.md` §17 is the most recent example of this discipline being followed correctly).
- **Drafted, not applied — still the right set, not re-litigated:** `customer_purchases.sale_date`/`.product_id`, `products.status`/`.category`, `customers.vip_level`/`.assigned_salesperson` (`supabase/migrations/20260718_performance_indexes.sql`). This review does not propose changing this list — it recommends applying it as-is (§15, High priority in the locked spec).
- **No additional index gap was found in this review** beyond what §10/§17 of the locked spec already named. This document does not go looking for new ones in frozen modules, consistent with "do not redesign existing tables."

---

## 11. Constraint Review

A review, not a redesign — checking that existing constraints already say what the business rules they encode require, not proposing new ones:

- `role_data_scopes.scope` `CHECK (scope IN ('own','team','all'))` — matches Decision 4's locked 3-value list exactly. ✅
- `permission_sensitive_fields.field_key` `CHECK (field_key IN ('cost_price','profit','commission','company_revenue','internal_notes'))` — matches Decision 6's locked 5-field list exactly. ✅
- `staff.role` `CHECK (role IN ('Owner','Manager','Sales','Marketing','Viewer'))` — deliberately left untouched by Decision 10, still matches the legacy 5-value list. ✅ (unchanged, not re-opened here)
- `master_data.category` / `tag_options.category` `CHECK` lists — both still closed-vocabulary, matching the "final approved category list" comment already in their migration. ✅
- **No constraint gap was found** that this document recommends closing. This section exists to confirm the schema's existing constraints are internally consistent with the business rules already locked elsewhere — it is a verification exercise, not a source of new schema work.

---

## 12. Data Integrity Verification

A process this document recommends running periodically (quarterly, or before any major release) against Production — described at the level of *what to check*, not *how* (no SQL written here):

- **Orphaned references:** any row whose foreign-key-shaped column (even the deliberately-not-a-real-FK plain-text references like `products.salesperson`/`orders.sales_owner`) points at a `master_data`/`staff`/`roles` value that no longer exists or was hard-deleted rather than disabled — this project's own established rule is "disable, never delete" for exactly this reason, so this check verifies that rule has actually held, not that it might fail.
- **Duplicate business-facing codes:** `customers.customer_code`, `products.product_code`, `staff.staff_code`, `roles.role_key`, `permissions.permission_key` — all already `UNIQUE`-constrained at the database level, so a duplicate should be structurally impossible; this check exists as a defense-in-depth sanity check, not because a gap is suspected.
- **Cross-environment schema drift:** confirm Development/Staging/Production have identical table/column/constraint/index sets (a `information_schema` comparison, conceptually — not written here) — directly closes the "no way to verify schema parity across environments" gap the locked spec (§2) already named.
- **Permission Center specifically:** confirm every `staff.role_id` (where set) still points at an `is_active = true` role, and every `role_permissions`/`role_data_scopes` row still points at existing, active parents — `ON DELETE CASCADE`/`SET NULL` already make most of this structurally impossible, but a periodic check is cheap insurance given how new this module is.

---

## 13. Seed Data Policy

- **Reference/lookup data** (the 5 seeded `roles`, 10 seeded `permissions`, `master_data`/`tag_options` categories, `commission_rules` defaults) — already the established pattern of idempotent `INSERT ... ON CONFLICT DO NOTHING` inside the same migration that creates the table (`20260729_permission_center_module.sql` is the most recent example). This policy formalizes that convention as the standing rule for any future reference data: **seed data belongs in the migration itself, applied identically to every environment**, never hand-inserted differently per environment.
- **Business/test data** (fake customers, products, purchases used for Development testing) — **must never be part of any migration file**, and must never be copied or promoted from Development/Staging into Production. This is not a new rule — it's the "never modify Production" project rule applied specifically to the seed-data question, stated explicitly here because migrations are exactly the mechanism that could accidentally leak test rows into Production if this weren't explicit.
- **Staging's seed data, if Staging is stood up (§2):** should match Production's *reference* data (roles, permissions, master data) but may carry its own test business data for UAT purposes, same as Development — Staging is a rehearsal environment, not a read-only mirror of Production's actual business data, unless a future decision says otherwise (not decided here).

---

## 14. Production Data Protection

Restates and formalizes what's already this project's standing practice, at the database-design level:

- **No direct schema-altering access to Production** outside an approved, promoted-from-Staging migration (§3) — unchanged.
- **No service-role key is used anywhere in application code** (confirmed in the locked spec §9) — only the anon key, everywhere, in every environment. This remains true for any future work; this document does not propose introducing service-role usage anywhere.
- **PII handling:** `customers.phone`, `staff.phone`/`.email`, and similar fields are stored as plain columns, no field-level encryption, no data masking for non-Owner roles — consistent with this project's single-tier-access history (Permission Center's Data Scope/Field Visibility mechanisms exist but aren't wired into Customer/Staff queries yet, per that sprint's own stated boundary). Not a gap this document proposes fixing now (would be redesigning a frozen module's query layer) — named here so it's on record as a known, accepted-for-now posture.
- **RLS remains uniformly permissive** (`TO anon` + `TO authenticated`, same policy shape) across every table in every environment — this document does not propose differentiating it per environment (e.g., stricter RLS in Production than Development), since that would itself be a form of schema/policy redesign outside this document's mandate, and would risk Production behaving differently from what was tested in Staging/Development, undermining the entire point of environment parity (§2).
- **Production → Development data flow (Decision 29), the reverse direction from §13's rule:** §13 already forbids Development/Staging test data ever reaching Production. This rule closes the other direction — **Production data must not be copied into Development** (a realistic, common practice this project has never previously stated a position on — e.g., pulling a real data snapshot into Development for more realistic testing) **unless at least one of:**
  - Sensitive information is masked/anonymized first (customer names/phone/email, staff PII, commission/cost figures — the same fields already named as candidates for the Permission Center's Sensitive Field registry, §9's own cross-reference, are the natural starting list for what "sensitive" means here, though this document does not mandate reusing that exact list), or
  - Explicit Product Owner approval exists for that specific copy, unmasked.
  
  Absent either condition, no Production data — masked or not — moves into Development. This is a **process rule, not a technical control** — nothing in the schema enforces it (no trigger, no export restriction), the same way "never modify Production" itself has always been a process rule this project relies on people following, not a database-level lock.

---

## 15. Performance Considerations

Restates the locked spec's §10 findings, at the database-design level, without proposing to fix any frozen module's query pattern now:

- The already-drafted index migration (§10 above) is the one concrete, low-risk, ready-to-apply performance improvement this document endorses.
- No pagination, no server-side aggregation, and the one known N+1 (`getCustomerOrderHistory`) remain **application-layer** concerns, not database-design ones — fixing them would mean touching frozen modules' query code, explicitly out of this document's mandate ("do not redesign existing tables," and by extension, existing query logic).
- **Recommendation for any future module-touching work:** any new query written against this schema going forward should default to `.range()`-based pagination and Postgres-side aggregation (`count`, `sum`, `group by` pushed to Postgres) rather than repeating the client-side-aggregation pattern found elsewhere — a standard for new code, not a retrofit of old code, mirroring the same "don't redesign, do better going forward" posture the locked spec already took on error handling (§8).

---

## 16. Scalability Considerations

- **Current comfort zone:** hundreds to low thousands of rows per table (locked spec §19) — every index/constraint/architecture decision in this document is sized for that reality, not for a materially larger business.
- **Trigger points, not yet reached:** pagination becomes necessary once list-view fetch time is noticeably slow to a user; server-side aggregation becomes necessary once Reports/Market Intelligence's full-table-fetch approach strains client memory or times out; the Permission Center's `role_data_scopes`/`applyDataScope()` (built, not yet wired into any module) is the concrete mechanism ready to absorb per-module data-volume scoping once any module's dataset grows large enough that "every authenticated user sees everything" becomes a real performance problem, not just a security-posture one.
- **Multi-environment scalability:** adding a third environment (Staging, §2) triples the number of places a migration must be applied and verified, but does not change the schema itself — the operational cost scales with environment count, not with any new architectural complexity.
- **No schema change is proposed in this section** — it exists to confirm nothing in this document's own recommendations (index migration, candidate metadata tables) creates a new scalability concern of its own. None of them do: both candidate tables in §6/§7 are tiny, low-write-frequency, and have no relationship to any high-volume table.

---

## 17. Risks

| Risk | Likelihood | Impact | Notes |
|---|---|---|---|
| A migration gets applied via the Supabase SQL Editor again instead of the CLI, silently reintroducing the exact ledger-unreliability problem `INFRASTRUCTURE_INVESTIGATION_REPORT.md` already found once | Medium (already happened historically) | Makes §4's "which migrations are where" question unanswerable again | §4 |
| Staging never gets stood up, so the first time a migration meets Production-like data is Production itself | Certain unless §2/§21 is acted on | Every risk a Staging gate exists to catch (schema drift, bad migration, unexpected data shape) goes uncaught until it's already in Production | §2 |
| `backup_metadata`/`restore_drill_log` (§6/§7) get built as tables but never actually populated/maintained, becoming a second stale source of truth alongside the Supabase Dashboard itself | Medium, if Option B is chosen without discipline | A false sense of "we tracked this" when the record is actually out of date | §6, §7 |
| Reference-data seeding convention (§13) isn't followed by a future migration, and test/business data leaks into a seed insert that later gets applied to Production | Low today (only one precedent exists, done correctly) | Would put fake data directly into Production's real tables | §13 |
| Schema drift between Development/Staging/Production is never actually checked (§12), so "environment parity" stays an assumption, not a verified fact | Medium — no verification has ever been run, per this document's own admission | Undermines every other section's assumption that all environments share one schema | §2, §12 |
| The Production→Development masking rule (§14, Decision 29) is process-only — nothing technical stops an unmasked copy | Medium (same class of risk as "never modify Production" itself always being process-only) | Real customer PII could land in the lower-trust Development environment without anyone violating a system control, only a stated rule | §14 |
| The Migration Verification Checklist (§3.1, Decision 30) is a manual checklist, not an automated gate | Certain — no CI exists to enforce it (per the locked Business Design spec's own §3/§13 findings) | A skipped checklist item is only caught if a human notices, same limitation as every other manual process this document formalizes | §3.1 |

---

## 18. Open Questions

1. **§6/§7 — Backup Metadata / Restore Verification:** Option A (written runbook, no schema change) vs. Option B (candidate `backup_metadata`/`restore_drill_log` tables) — not chosen here; needs a Product Owner decision before either becomes a migration.
2. **§4 — Migration application process:** confirm the "CLI-only, never the SQL Editor" rule going forward is actually acceptable operationally (e.g., does whoever applies Production migrations always have CLI access?) — assumed yes, not confirmed.
3. **§2/§21 — Staging environment:** whether and when to provision a third Supabase project — a cost/scheduling decision, not a database-design one, but this document's Environment Separation section is incomplete until it's answered.
4. **§8 — Audit retention:** "retain indefinitely" is this document's recommendation, not a decision — confirm, or set a concrete window if the Product Owner prefers one.
5. **§14 — PII posture:** confirm the Product Owner is comfortable with the current no-encryption, no-masking, uniformly-permissive-RLS posture for customer/staff PII being the accepted state for Production, not an oversight to fix in this sprint.
6. **§10/§15 — Drafted index migration:** confirm authorization to actually apply `20260718_performance_indexes.sql` (design-approved implicitly by being restated here, but not itself re-approved by this document — the locked Business Design spec already flagged it as a High-priority action item, not this Database Design doc's to authorize).
7. **§14 — What counts as "sensitive" for the Production→Development masking rule (Decision 29):** this document points at the same field categories already named for the Permission Center's Sensitive Field registry as a natural starting list, but does not mandate reusing it exactly — confirm the actual masking scope before the first real Production→Development data copy is attempted.

---

## Self Review (Revision 2)

- **Every candidate new table in this document (§6, §7) is explicitly optional and dual-optioned** (a no-schema-change alternative is always given first) — this document does not assume new schema is the answer just because it's a "Database Design" document; §9 and §15/§16 explicitly decline to propose schema where the honest answer is "this isn't a database problem."
- **No existing table's columns, constraints, or business meaning are changed anywhere in this document** — §10/§11/§12 are reviews confirming the existing state is already correct, not redesign proposals; the one concrete recommendation (§10's index migration) was already drafted and flagged before this document existed.
- **§4's recommendation not to build a second migration-tracking table** is a deliberate case of choosing "fix the process" over "add more schema" — worth flagging as the one place this document actively argued against building something, since a less careful pass might have proposed a custom ledger table as the obvious "database design" answer to a process problem.
- **§13's seed data policy and §14's Production data protection restate existing project rules** rather than inventing new ones — the one new rule this revision adds (Decision 29, Production→Development masking) is genuinely new, not a restatement, and is flagged as such (§14, §17, §18) rather than presented as if it always existed.
- **Decision 28's minimum record fields supersede §7's original candidate `restore_drill_log` column sketch** rather than sitting alongside it — the six named fields (Timestamp, Operator, Backup reference, Restore duration, Result, Notes) are now the actual requirement, whether met by a table or a runbook; the original sketch's extra detail (row-count/spot-check specifics) folds into Notes rather than staying as separate required columns, avoiding two competing "the real requirement" statements in the same section.
- **Decision 27's operational-metadata-only rule is written to bind both options equally** (table or runbook) — it would have been easy to phrase it as a column constraint on Option B only, but the actual risk (business data creeping into a record meant to be about backups) applies just as much to a free-text runbook entry.

---

Database design only. No code written. No SQL written. No existing schema changed. No business rule modified. Stopping — waiting for Product Owner Review.
