# Data Scope Rollout — Business Design Spec

**Sprint:** v4.1 — Data Scope Rollout
**Module:** Cross-cutting (applies the Enterprise Permission Center's existing Data Scope model to 8 named, already-frozen modules) — not a new product module
**Status:** Draft — Revision 2. Product Owner issued 4 scoped Decisions (39–42) against Revision 1; applied below, nothing else changed. Awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no code, no database redesign, no Permission Center redesign, no UI redesign were written for this document.
**Based on:** `docs/PERMISSION_SPEC.md` (LOCKED), `docs/PERMISSION_DATABASE.md` (LOCKED), `docs/PERMISSION_UI.md` (LOCKED) — Enterprise Permission Center, FROZEN. This document does not redesign, reinterpret, or add to that specification. It defines only how the already-approved Own/Team/All model, `role_data_scopes` table, and `applyDataScope(query, staff, resource, ownerField?)` utility (built, not yet integrated into any module — `lib/permission/dataScope.ts`) get wired into 8 named modules' existing read paths. Every fact about current schema/code cited below was verified directly against the repository, not assumed.

**A scope correction stated up front:** the 8 resources named for this rollout (Customers, Orders, Customer Purchases, Dashboard, Reports BI, Sales Ledger, Marketing, Activity Log) are **not identical** to the 8 named in the original locked `PERMISSION_SPEC.md` §4 (Customers, Orders, Revenue, Sales Ledger, Dashboard, Reports, Marketing, **Commissions**). This rollout **drops Commissions** and **adds Activity Log**. That's a legitimate scoping decision for this sprint, but it has one real consequence flagged throughout this document (§6, §7, §13, §14): Dashboard's own Commission widget and parts of Reports BI read `sales_commissions`, a table outside this rollout's named list — so Dashboard/Reports BI end this rollout only **partially** scoped, not fully, unless a future sprint adds Commissions.

---

## 1. Objectives

Apply real, server-side Own/Team/All visibility — already business-approved (`PERMISSION_SPEC.md` §4, Decision 4) and already database-modeled (`role_data_scopes`, `PERMISSION_DATABASE.md` §4/§13) — to the 8 named resources' actual read paths, which today remain fully open to any authenticated staff member regardless of role (the explicit, disclosed boundary Permission Center's own Decision 1 left for "a future per-module enforcement sprint"). This sprint is that sprint.

This is **wiring, not invention**: no new Data Scope value, no new resource beyond the 8 named, no new column, no change to what `applyDataScope()` does — only *where* it gets called.

---

## 2. Scope

**In scope:**
- Read-path Data Scope enforcement (via `applyDataScope()`) for the 8 named resources listed in §3.
- Defining, per resource, what "Own"/"Team"/"All" concretely means given that resource's actual current ownership field(s) (§3, §4).
- Sequencing (§12) and risk/testing (§11, §13) for rolling this out without a big-bang release.

**Explicitly out of scope:**
- Any change to Permission Center's own spec, database, or UI (frozen, per this task's instruction) — this document only *consumes* what's already there.
- Any new database column, table, or index (per this task's instruction) — every resource's Own/Team resolution in §3/§4 uses a field that **already exists** today; where none exists cleanly (Orders, §3/§4/§13), this document works within that limitation rather than proposing a schema fix.
- Write-path business rules — Decision 7's standing principle ("only add permission enforcement, never change what any module computes") applies here exactly as it did in the original Permission Center sprint. No Order status flow, no Commission calculation, no Marketing segment logic changes.
- Commissions/`sales_commissions` as its own resource — not one of the 8 named here (see the scope correction above); its partial entanglement with Dashboard is flagged, not resolved, in §6/§14.
- Field Visibility / Sensitive Fields enforcement — a separate rollout, not this one (Data Scope governs *which rows*, Sensitive Fields govern *which columns*; conflating them here would be redesigning Permission Center's own already-locked separation of concerns).

---

## 3. Resources

For each resource: what Own/Team/All means, and the real field(s) that make it possible today.

### Customers
- **Own** — rows where `customers.assigned_staff_id = me`.
- **Team** — rows where `assigned_staff_id` belongs to any staff sharing my `team_id`.
- **All** — every row.
- **Field:** `customers.assigned_staff_id`, a real `uuid` FK to `staff.id` (added in the Staff Management module) — the cleanest ownership field of all 8 resources. The legacy `customers.assigned_salesperson` (free text, kept for backward compatibility) is **not** used for scope resolution — `assigned_staff_id` is authoritative.

### Orders
- **Own** — rows where `orders.sales_owner` (text) matches my `staff.full_name`.
- **Team** — rows where `sales_owner` matches any teammate's `full_name`.
- **All** — every row.
- **Field:** **Orders has no uuid staff-reference column at all** — `orders.sales_owner` and `orders.created_by` are both plain `text`, sourced from the `salesperson` master-data picklist (by original design, matching the same pattern `products.source`/`salesperson` already use — not something this sprint introduces or can fix without a schema change, which is out of scope). Own/Team resolution for Orders is therefore **name-matching against `staff.full_name`**, not a join — the exact same fallback convention this codebase already uses elsewhere (`matchesStaff()` in `lib/staff.service.ts`, already relied on for Customer Purchases below). This is the weakest ownership signal of the 8 resources — flagged as a real risk in §13, not something this document resolves.

### Customer Purchases
- **Own** — rows where `customer_purchases.salesperson_id = me` when that column is populated; for older rows where it's `NULL`, fall back to matching `customer_purchases.salesperson` (text) against my `staff.full_name` — exactly `matchesStaff()`'s existing logic, reused, not reinvented.
- **Team** — same resolution, extended to any teammate.
- **All** — every row.
- **Field:** `customer_purchases.salesperson_id` (`uuid` FK to `staff.id`, the system of record per the Reports BI migration's own comment) with `customer_purchases.salesperson` (text, always populated, the original/legacy field) as fallback for historical rows predating the Staff Management module.

### Dashboard
- **No ownership field of its own** — Dashboard is a rollup surface, not a table. Each KPI card's Data Scope is whatever the underlying resource it reads resolves to (Customers for customer counts, Customer Purchases for revenue), applied to that card's own query *before* aggregating, not computed over everything and filtered after.
- **Named gap:** the Commission KPI card reads `sales_commissions` directly (`lib/commission/commission.service.ts`, "never `customer_purchases`") — a table outside this rollout's 8 named resources. That card is **not** scoped by this sprint (§6, §14).

### Reports BI
- Same "no ownership field of its own" framing as Dashboard — every Reports BI function (`lib/reports/reportsBI.service.ts`'s RPCs and the older `lib/reports/reports.service.ts`) reads `customer_purchases`/`products`/`customers`/`product_batches`, never `orders`. Scope is inherited from whichever of those underlying resources a given report's query touches — most directly Customer Purchases, whose `reports_staff_analysis` RPC already joins `salesperson_id` to `staff`, the one Reports BI function with a ready-made staff-scoped join key today.

### Sales Ledger
- The `sales_ledger` view (`20260723_sales_ledger_view.sql`) is built entirely on `customer_purchases` (joined to `customers`/`products`/`sales_commissions` for display columns only) and passes through both `salesperson`/`salesperson_id` unchanged. **Same ownership resolution as Customer Purchases, exactly** — Sales Ledger is not an independent resource for scope purposes, it's a read-shape over the same rows.

### Marketing
- **Own** — for Segments, rows where `marketing_segments.created_by = me`; for Campaigns, rows where `marketing_campaigns.owner_staff_id = me`.
- **Team** — same fields, extended to teammates.
- **All** — every row.
- **Field:** two different columns for two different tables under one named "resource" — `marketing_segments.created_by` and `marketing_campaigns.owner_staff_id` (both real `uuid` FKs to `staff.id`; `marketing_segment_members.added_by` also exists but is a membership-audit field, not this resource's own ownership field). `applyDataScope()`'s existing optional `ownerField` parameter (already built to handle exactly this — resources without one single default mapping) is how this gets called correctly per table — described at business level here, not implemented.

### Activity Log
- **Own** — rows where `activity_logs.staff_id = me` (I only see my own logged actions).
- **Team** — rows where `staff_id` belongs to a teammate.
- **All** — every row.
- **Field:** `activity_logs.staff_id`, a real `uuid` FK to `staff.id`. (Note: this refers to the live `activity_logs` table only, not the separate, drafted-and-never-applied `audit_log` table from the P7 era, which uses a different shape entirely and is out of scope.)
- **Locked per-role scope (Decision 39)** — resolves what was previously an open business question about oversight vs. self-service intent:

| Role | Data Scope |
|---|---|
| Owner | All |
| Manager | Team |
| Sales | Own |
| Marketing | Own |
| Viewer | Own |

  Manager's Team scope is what preserves the oversight purpose an audit trail needs (a Manager sees their team's activity, not just their own) without granting every role blanket visibility into everyone's actions.

---

## 4. Ownership Rules

One consistent hierarchy, applied identically across all 8 resources rather than inventing a bespoke rule per module:

1. **Prefer a real `uuid` FK to `staff.id` when one exists** — Customers (`assigned_staff_id`), Marketing (`created_by`/`owner_staff_id`), Activity Log (`staff_id`), and Customer Purchases/Sales Ledger's `salesperson_id` when populated.
2. **Where a legacy text field coexists with a newer uuid field, the uuid field wins when present; text is a fallback only for historical rows** — Customer Purchases/Sales Ledger's `salesperson` (text) is read only when `salesperson_id` is `NULL`, using the exact matching logic `matchesStaff()` already implements (exact name match, no fuzzy matching, consistent with this codebase's existing convention for this exact problem).
3. **Where no uuid field exists at all, name-matching against `staff.full_name` is the entire mechanism** — Orders' `sales_owner`/`created_by`. This is an accepted limitation carried forward from Orders' own already-locked design, not something this sprint fixes (fixing it would mean adding a column, which is a database change, out of scope for this Business Design).
4. **Resources with no table/ownership field of their own (Dashboard, Reports BI, Sales Ledger conceptually) always inherit the resolved scope of whichever underlying resource's rows they're reading**, applied per-query, before aggregation — never a separate, independently-invented "Dashboard scope."
5. **Legacy free-text fields kept for backward compatibility (`customers.assigned_salesperson`, `products.salesperson`) are never used for scope resolution** — only the fields named in rules 1–3 are authoritative, to avoid two different "who owns this" answers existing for the same row.

---

## 5. Team Rules

Identical across all 8 resources — no resource gets a bespoke definition of "Team":

- **Team = every staff member sharing the signed-in staff member's `team_id`** (Permission Center's own flat-grouping design, Decision 12 — no management hierarchy, confirmed unchanged here).
- A staff member with `team_id = NULL` has no teammates by definition — Team-scoped access for them resolves to the same row set as Own (an existing, already-documented consequence of the flat model, not a new rule invented here).
- Team resolution always goes through the staff roster (`staff.team_id`), never through a resource's own data — e.g., Orders' Team scope is "orders whose `sales_owner` name-matches any staff member currently on my team," not some Orders-specific grouping concept.

---

## 6. Cross-module Consistency

The same `(role, resource)` → scope lookup (`role_data_scopes`) must produce the **same visible row set** no matter which screen asks — a Sales-Own-scoped staff member's own Customer Purchases must look identical whether viewed via Customer Detail's purchase history, Sales Ledger, a Reports BI card, or Dashboard's revenue widget. This is achieved structurally by every one of those screens calling `applyDataScope()` against the same resource key and the same underlying table's ownership field (§4) — not by each screen re-deriving its own filter logic, which is exactly the kind of drift that would silently break this guarantee.

**Two concrete places this document flags as needing care, not silently assumed safe:**
- **Marketing's two different `ownerField` names** (§3) — any screen scoping Marketing data must pass the *correct* explicit override to `applyDataScope()` for the table it's actually querying (`created_by` for Segments, `owner_staff_id` for Campaigns). Forgetting this — e.g., reusing `created_by` against a Campaigns query — would silently apply scope by the wrong field, either over- or under-restricting visibility. A future Development phase must treat this as a specific, named test case (§11), not an incidental detail.
- **Dashboard/Reports BI's Commission gap** (§3, §14) — since Commissions isn't one of the 8 named resources, Dashboard's Commission card and any Reports BI commission-adjacent figure remain **unscoped** after this rollout, while everything else on the same screen becomes scoped. This is an inconsistency this document surfaces rather than silently accepts as fine — a Sales-Own-scoped viewer would see their own revenue correctly restricted right next to a Commission figure still showing company-wide numbers, on the same Dashboard.

---

## 7. Dashboard Behaviour

Each KPI card/widget applies the viewer's resolved Data Scope to **its own underlying query, before aggregating** — never fetch-all-then-filter-client-side (the same "server-side filtering only" principle already locked in `PERMISSION_SPEC.md` §4/§7, reaffirmed here, not redesigned). Concretely: a customer-count card queries Customers already filtered by scope; a revenue card queries Customer Purchases already filtered by scope; the resulting aggregate is computed only over the rows the viewer is allowed to see — there is no "compute the real total, then hide part of the number," since that would still leak the true total through response size, timing, or a careless follow-up query.

**Dashboard Consistency Rule (Decision 40):** each widget must resolve and apply **the Data Scope of its own underlying resource** — a customer-count card uses Customers' resolved scope, a revenue card uses Customer Purchases' resolved scope, and so on. **A single global scope value is never computed once and reused across every widget on the page.** This matters precisely because Dashboard has no resource of its own (§3, §4 rule 4) — without this rule, an implementation could take a shortcut (resolve "the viewer's scope" once, apply it everywhere) that would silently be wrong the moment two widgets' underlying resources have different `role_data_scopes` settings for the same role, which the locked Permission Center design explicitly allows (Data Scope is set per resource, not once per role).

**Explicitly not scoped by this rollout, stated on the dashboard itself once implemented, not hidden:** the Commission KPI card, since `sales_commissions` sits outside this sprint's 8 named resources (§3, §6). A future sprint adding Commissions to Data Scope would close this gap; this document does not attempt to close it by informally extending scope to a resource the Product Owner didn't name.

---

## 8. Report Behaviour

Same principle as Dashboard, applied to Reports BI's RPC-based functions (`reports_revenue_periods`, `reports_revenue_summary`, `reports_product_analysis`, `reports_category_analysis`, `reports_customer_summary`, `reports_top_customers`, `reports_revenue_trend`, `reports_staff_analysis`) and the older ad hoc `lib/reports/reports.service.ts` queries: each must accept the viewer's resolved scope and filter the underlying `customer_purchases`/`products`/`customers` rows accordingly before computing any sum, count, or category breakdown — never compute over the full dataset and then decide what to show. `reports_staff_analysis` is the most directly affected, since it already joins `salesperson_id` to `staff` for its own purposes (§3) — the natural first candidate to carry scope filtering, described here at the business level only (no SQL, no RPC signature change specified).

**Report Consistency Rule (Decision 41):** Data Scope must be applied **during data retrieval** — as part of the query that fetches rows from `customer_purchases`/`products`/`customers`, not as a filter run against an already-fetched, unrestricted result set. **Retrieving unrestricted data and filtering it afterward is never acceptable**, for the same reason already established for Dashboard (§7): an unrestricted fetch leaks the true, unscoped dataset the moment it exists in memory, in a log line, in a slower response time, or in a bug that skips the after-the-fact filter step. This applies identically to every Reports BI RPC and every `reports.service.ts` query — scope is a `WHERE`/join condition on the retrieval itself, not a post-processing step.

Sales Ledger, being a straight view over Customer Purchases (§3), inherits this same behavior automatically once Customer Purchases itself is scoped correctly — it does not need separate report-level logic of its own.

---

## 9. Audit Behaviour

Two distinct concerns, not to be conflated:

1. **Activity Log's own visibility** is governed by §3/§5 like any other resource (with the oversight caveat flagged there and in §14).
2. **Auditing *changes to Data Scope itself*** is already built and requires nothing new from this sprint — Permission Center's own Decision 8/`PERMISSION_DATABASE.md` §16 already logs every `role_data_scopes` change (`entity: "role_data_scope"`) to `activity_logs` whenever a role's Own/Team/All setting changes. This rollout reuses that existing mechanism as-is.

**Explicitly not proposed by this document:** auditing *who viewed which scoped row* (e.g., "Staff X viewed Customer Y's purchase history"). That would be a materially larger, new kind of audit logging (view-level, not change-level) this sprint does not introduce — Data Scope governs which rows a query returns, it does not add a new audit event for the fact that a query happened. If view-level auditing is wanted, that's a separate future decision (§14), not an implicit part of this rollout.

---

## 10. Performance Principles

Reaffirms, does not redesign, the already-locked principles from `PERMISSION_SPEC.md`/`PERMISSION_DATABASE.md`:

- **Server-side filtering only** — `applyDataScope()` already adds its `.eq()`/`.in()` clause directly onto the Supabase query builder before the request is sent; no fetch-all-then-filter pattern is introduced anywhere by this rollout.
- **No new round-trip per query** — `applyDataScope()`'s own resolution (role → scope lookup) is already covered by the Permission Cache built in the original sprint (session-scoped, 60s TTL) for the *permission* side; the *Data Scope* lookup itself (`getResolvedDataScope`) is a small, already-indexed (`role_data_scopes` has a `UNIQUE(role_id, resource)` index) lookup — no new caching mechanism is proposed here, since one wasn't found necessary for the equivalent permission-check hot path either.
- **Index review, not index creation:** `customer_purchases.salesperson_id`, `customers.assigned_staff_id`, `marketing_segments.created_by`, `marketing_campaigns.owner_staff_id`, and `activity_logs.staff_id` are **all already indexed** (added in their respective originating migrations) — no new index is needed for Team-scope's `.in()` filter on any of these. **The one exception, flagged as a real performance risk (§13): `orders.sales_owner`/`created_by` are plain `text` columns with no index at all** — a Team-scoped `.in()` filter naming several teammates' text names would be an unindexed scan. This document does not propose adding one (that would be a database change, out of scope) — it names the risk for whoever plans Orders' rollout phase (§12) to weigh.

---

## 11. UAT Strategy

Extends, does not replace, Permission Center's own already-defined UAT by Role process (`PRODUCTION_READINESS_SPEC.md` §14.1) with resource-specific verification, per resource, per scope value:

- For each of the 8 resources: configure a test role's Data Scope to Own, log in as a staff member with that role, and confirm the resource's list/detail/report/dashboard views show **exactly** the rows that staff member owns — not more (a scope leak), not fewer (an over-restriction hiding legitimate data).
- **Team-scope specifically requires two staff members sharing one `team_id`**, confirming each sees the other's rows under Team but not under Own — a scenario Permission Center's own Team Management screen already supports for setting up.
- **Marketing gets its own explicit Own/Team test per table** (Segments vs. Campaigns), given the two different `ownerField`s (§3, §6) — this is named as its own checklist line, not folded into a generic "Marketing works" check.
- **Orders gets extra scrutiny** given its name-matching-only ownership resolution (§3, §4) — test with two staff members whose `full_name` values are similar-but-distinct, to confirm no false match occurs.
- **No automated test suite exists in this repository** (Playwright has never been configured, a standing, disclosed gap across every prior sprint) — this UAT remains the same manual, human-driven verification process already practiced throughout this project, not a new automated pipeline this document proposes building.

---

## 12. Rollout Strategy

Phased, resource-by-resource — matching the same "no big-bang" principle Permission Center's own Decision 1 already established for deferring this exact rollout in the first place. **Order locked by Decision 42** (no longer a proposal):

1. **Customers**
2. **Orders**
3. **Customer Purchases**
4. **Sales Ledger**
5. **Dashboard**
6. **Reports BI**
7. **Marketing**
8. **Activity Log**

Orders' weaker ownership signal (name-matching only, no index — §3, §4, §10, §13) and Activity Log's now-resolved per-role scope (§3, Decision 39) don't change their position in this locked sequence — Orders is deliberately early despite that risk, so its extra Development-time care and UAT scrutiny (§11) should be planned for at phase 2, not deferred to the end as Revision 1 had proposed.

Each phase still requires **its own per-module Impact Analysis and approval** before touching that module's query layer (the standing project rule this sprint doesn't waive), even though no schema change is anticipated anywhere in this rollout — "no redesign" does not mean "no review."

---

## 13. Risks

| Risk | Likelihood | Impact | Notes |
|---|---|---|---|
| Orders' name-matching-only ownership resolution misclassifies a row (stale/misspelled master-data name, two similarly-named staff) | Medium | A Sales-Own-scoped user sees someone else's order, or misses their own | §3, §4, §11 (extra test scrutiny recommended) |
| Marketing's two different `ownerField` names get confused in a future Development pass | Medium | Segments/Campaigns scoped by the wrong column, silently over- or under-restricting | §3, §6, §11 |
| Dashboard/Reports BI end this rollout only partially scoped (Commission untouched) | Certain (by this sprint's own named scope) | A viewer sees inconsistent scoping on the same screen — some numbers restricted, one not | §3, §6, §7, §14 |
| `orders.sales_owner`/`created_by` have no index | Certain today | Team-scope queries against Orders could be slow as the table grows | §10 |
| Activity Log defaults to "Own" without an explicit Product Owner decision on oversight intent | Medium | Could unintentionally hide activity a Manager-equivalent role actually needs to see | §3, §14 |
| Rolling out to 8 already-live modules is a larger blast radius than any single prior sprint in this project's history | Certain (structural) | A missed edge case affects real, current business data visibility, not a new feature nobody's using yet | §11, §12 (phasing exists specifically to contain this) |

---

## 14. Open Questions

1. **Should Commissions/`sales_commissions` be added to this rollout** (or a named follow-up), given Dashboard's Commission widget and parts of Reports BI sit outside the 8 named resources and will remain unscoped otherwise?
2. **Is Orders' text-only ownership approximation acceptable indefinitely**, or does Orders eventually need a real `sales_owner_id`/`created_by_id` uuid column — a future Database Design decision, not this Business Design's to make.
3. **Should the legacy `customers.assigned_salesperson`/`products.salesperson` text fields ever factor into scope resolution**, or are `assigned_staff_id`/`salesperson_id` permanently authoritative (this document assumes the latter, per §4 rule 5 — confirm)?
4. **Should view-level audit logging** (who viewed which scoped row, distinct from the already-built change-level audit logging, §9) **be added in a future sprint**? Not proposed here.

Resolved this revision: Activity Log's per-role default scope (Decision 39, §3) and the rollout order (Decision 42, §12) — both removed from this list as no longer open.

---

Business Design only. No code written. No SQL written. No database changes. No Permission Center changes. No UI changes. Stopping — waiting for Product Owner Review.
