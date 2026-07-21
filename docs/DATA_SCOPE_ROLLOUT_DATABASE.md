# Data Scope Rollout — Database Design

**Sprint:** v4.1 — Data Scope Rollout
**Module:** Cross-cutting (database-level impact of applying Data Scope to 8 named, already-frozen modules) — not a new product module
**Status:** Draft — Revision 2. Product Owner issued 3 scoped Decisions (43–45) against Revision 1; applied below, nothing else changed. Awaiting Product Owner Database Design approval.
**Phase:** Database design only. No SQL, no migration, no implementation were written for this document. No existing table/column is altered, renamed, or dropped anywhere in this design.
**Based on:** `docs/DATA_SCOPE_ROLLOUT_SPEC.md`, Revision 2 — **approved and LOCKED**. This document defines only the database-level facts and one candidate performance recommendation needed to implement that spec's already-locked Own/Team/All definitions (§3), Ownership Rules (§4), Team Rules (§5), and consistency rules (Decisions 40/41) — it does not redesign, reinterpret, or add to any of them, and does not redesign Permission Center or any frozen module's table.

**Governing constraint, stated up front:** the locked Business Design already committed to a specific ownership-resolution mechanism per resource (§3/§4 of that document) — including, for Orders, **name-matching against `staff.full_name`**, not a `uuid` column, because none exists. This Database Design **does not revisit that commitment** (doing so would be redesigning the already-locked Business Design). Per this task's own requirement ("prefer existing ownership fields... do not change existing schemas unless absolutely required"), every resource below is implemented against fields that **already exist today** — the one index considered (§6) is locked as a Future Optimization (Decision 45), explicitly deferred and explicitly not a blocker to this sprint.

---

## 1. Current Ownership Fields Review

Verified directly against the current schema (not assumed), matching exactly what the locked Business Design's §3/§4 already established:

| Resource | Field(s) | Type | Indexed? | Notes |
|---|---|---|---|---|
| Customers | `customers.assigned_staff_id` | `uuid` FK → `staff.id`, `ON DELETE SET NULL` | ✅ `idx_customers_assigned_staff_id` | Cleanest field of all 8. |
| Orders | `orders.sales_owner`, `orders.created_by` | `text`, nullable, sourced from the `salesperson` master-data picklist | ❌ No index | No `uuid` staff-reference column exists at all — locked in the Business Design, not revisited here. |
| Customer Purchases | `customer_purchases.salesperson_id` (primary), `customer_purchases.salesperson` (fallback) | `uuid` FK → `staff.id`, nullable / `text`, always populated | ✅ `idx_customer_purchases_salesperson_id` | `salesperson_id` is the system of record going forward; `salesperson` covers rows predating the Staff Management module. |
| Sales Ledger | Same as Customer Purchases | — | — | `sales_ledger` is a view over `customer_purchases`; it has no ownership field of its own, it passes both columns through unchanged. |
| Dashboard | None | — | — | Aggregation layer; inherits whichever underlying resource each widget reads (Decision 40). |
| Reports BI | None | — | — | Same as Dashboard; `reports_staff_analysis` already joins `customer_purchases.salesperson_id`/`sales_commissions.salesperson_id` to `staff`, the one existing precedent for this kind of join. |
| Marketing | `marketing_segments.created_by`, `marketing_campaigns.owner_staff_id` | Both `uuid` FK → `staff.id`, `ON DELETE SET NULL` | ✅ Both indexed | Two different column names for two different tables under one named resource — already anticipated by `applyDataScope()`'s optional `ownerField` override. |
| Activity Log | `activity_logs.staff_id` | `uuid` FK → `staff.id`, `ON DELETE SET NULL` | ✅ `idx_activity_logs_staff_id` | |

**Shared dependency across all 8:** `staff.team_id` (`text`, nullable, indexed — `idx_staff_team_id`, added in the Permission Center migration) is what every resource's Team resolution (§3) ultimately depends on, regardless of which of the fields above it uses.

---

## 2. Ownership Resolution Priority

One consistent hierarchy (already stated at the business level in the locked Spec §4, formalized here at the field level):

1. **Customers, Marketing, Activity Log** — a single `uuid` FK column (`assigned_staff_id`, `created_by`/`owner_staff_id`, `staff_id` respectively) compared directly to the signed-in staff member's `id`. No fallback needed.
2. **Customer Purchases / Sales Ledger** — `salesperson_id = staff.id` when `salesperson_id IS NOT NULL`; otherwise fall back to `salesperson = staff.full_name` (exact match, no fuzzy matching — the same convention `matchesStaff()` already implements in `lib/staff.service.ts`, reused here, not reinvented).
3. **Orders** — `sales_owner` compared to `staff.full_name` is the **entire** mechanism; there is no `uuid` path to prefer, since none exists (rule 1 doesn't apply here at all, not "attempted and failed"). **Standardized comparison (Decision 43):** the comparison is **case-insensitive** and both sides are **trimmed of leading/trailing whitespace** before comparing — not a byte-for-byte exact match. This is a deliberate, narrower standard than Customer Purchases' fallback matching (rule 2, still exact via the existing `matchesStaff()` convention) — Decision 43 names Orders specifically, so this document does not extend the same normalization to rule 2's fallback, to avoid silently changing an already-established convention Decision 43 didn't ask it to change (flagged as a resulting inconsistency in §12).
4. **Dashboard, Reports BI** — no resolution of their own; each widget/query applies whichever of rules 1–3 governs the resource it actually reads (Decision 40 — never one scope value computed once and reused).

---

## 3. Team Resolution

Identical business meaning across all 8 resources (locked Spec §5: "every staff member sharing the signed-in staff member's `team_id`"), but **two different mechanical shapes** depending on which ownership rule (§2) a resource uses:

- **`uuid`-keyed resources** (Customers, Marketing, Activity Log, Customer Purchases/Sales Ledger when `salesperson_id` is populated): Team resolves as *"the ownership field's value is in the set of `staff.id` values where `staff.team_id` equals mine."* A small, already-indexed (`staff.team_id`) subquery against the `staff` table.
- **Text-keyed resources** (Orders always; Customer Purchases/Sales Ledger's fallback path): Team resolves as *"the ownership field's text value is in the set of `staff.full_name` values where `staff.team_id` equals mine."* Same underlying `staff.team_id` lookup, projected to `full_name` instead of `id` — mechanically different, but the business meaning ("my teammates' rows") is identical, per the locked Spec's own insistence that Team means the same thing everywhere (§5). **For Orders specifically, this comparison is case-insensitive and trims both sides (Decision 43)** — same standardization as §2 rule 3, applied consistently to Team as well as Own so a teammate's row isn't missed under Team-scope for a reason it wouldn't be missed under Own-scope.
- A staff member with `team_id = NULL` has no teammates under either shape — Team-scoped access for them resolves to the same row set as Own, exactly as the locked Spec already states (§5), not a new behavior introduced here.

---

## 4. Legacy Compatibility

- **Fields never used for scope resolution, regardless of what they contain:** `customers.assigned_salesperson` (legacy free text) and `products.salesperson` (legacy free text) — the locked Business Design (§4 rule 5) already ruled these out; this document does not revisit that, and no query built for this rollout reads either column for ownership purposes.
- **A field still actively used, not fully retired:** `customer_purchases.salesperson` (text) — unlike the two fields above, this one **is** still read, but only as the documented fallback for rows where `salesperson_id IS NULL` (historical rows predating the Staff Management module). This is a deliberate, narrower exception to "legacy fields are never used," not a contradiction of it — the locked Spec draws this exact distinction (§3, §4) and this document preserves it precisely.
- **Backward compatibility guarantee:** no existing row's stored ownership value changes as a result of this rollout — every resolution rule in §2 is a **read-time** interpretation of data that already exists today, exactly as the locked Business Design specifies. Nothing here backfills, corrects, or reformats any existing `sales_owner`, `salesperson`, `created_by`, `owner_staff_id`, `assigned_staff_id`, or `staff_id` value.

---

## 5. Query Principles

Directly implements the locked Spec's Decisions 40 and 41 at the database-query level — these are not new rules, they are this document's restatement of already-locked ones translated into query-construction terms:

- **Data Scope filtering occurs during query construction, never afterward** (Decision 41) — the resolved scope (Own/Team/All, §2/§3) becomes part of the same query that retrieves rows (a `WHERE`/join condition), via the already-built `applyDataScope()` utility. No query for any of the 8 resources may fetch an unfiltered result set and then discard rows client-side or in a later processing step.
- **Each widget/report resolves and applies the Data Scope of its own resource independently** (Decision 40) — a query against Customer Purchases and a query against Customers on the same Dashboard page each call `applyDataScope()` with their own resource key; neither reuses a scope value resolved for the other, even when both happen to be requested by the same signed-in staff member in the same page load.
- **Marketing's two `ownerField`s (§1, §2) must each be passed explicitly** to `applyDataScope()` for the table actually being queried — `created_by` for Segments, `owner_staff_id` for Campaigns — never a default inferred from the resource name alone, since one resource name here maps to two different columns.
- **Sales Ledger and Reports BI/Dashboard never implement their own filtering logic** — they inherit correctness by querying the same underlying tables (`customer_purchases`, `customers`) with the same resolved scope Customer Purchases/Customers themselves use, per §2 rule 4. Duplicating filter logic in a report-specific or dashboard-specific code path is exactly the kind of drift the locked Spec's Cross-module Consistency section (§6) warns against.

---

## 6. Index Review

| Resource | Existing index | Sufficient for Team-scope's `.in()` filter? |
|---|---|---|
| Customers (`assigned_staff_id`) | ✅ `idx_customers_assigned_staff_id` | Yes |
| Customer Purchases (`salesperson_id`) | ✅ `idx_customer_purchases_salesperson_id` | Yes |
| Marketing (`created_by`, `owner_staff_id`) | ✅ Both indexed (Marketing module migration) | Yes |
| Activity Log (`staff_id`) | ✅ `idx_activity_logs_staff_id` | Yes |
| `staff.team_id` (the shared Team-lookup dependency, §3) | ✅ `idx_staff_team_id` | Yes — this is the one index every resource's Team-scope depends on in common, and it already exists. |
| **Orders (`sales_owner`, `created_by`)** | ❌ **No index on either column** | **No** — a Team-scoped `.in()` filter naming several teammates' text names would be an unindexed sequential scan. |

**Future Optimization, not part of this sprint (Decision 45):** an index on `orders.sales_owner` (the column Own/Team scope actually filters on; `created_by` is a secondary candidate if it's ever used for scope, which the locked Business Design does not currently specify) remains a real, named idea, but is explicitly **not** proposed as work for this rollout and **is not a blocker** to shipping Orders' Data Scope enforcement (locked Spec §12, phase 2) without it. Orders' rollout proceeds on the unindexed column as-is; the index, if ever pursued, is a separate, later optimization pass, not a gate this sprint waits on.

---

## 7. Constraint Review

- `role_data_scopes.scope`'s existing `CHECK (scope IN ('own','team','all'))` already covers exactly the three values this rollout needs — no new constraint required anywhere.
- Every `uuid` ownership column used in §2 (`assigned_staff_id`, `salesperson_id`, `created_by`, `owner_staff_id`, `staff_id`) is already nullable with `ON DELETE SET NULL` — meaning a staff member being removed never blocks their historical rows from continuing to exist, they simply lose that specific ownership link (already-existing behavior, not changed here).
- `orders.sales_owner`/`created_by` are nullable `text` columns (confirmed against the applied migration, not the earlier superseded draft that had proposed `NOT NULL`) — a `NULL` value there means "no owner recorded," a real case this rollout's resolution logic must handle (§9), not a constraint gap to close.
- No existing constraint conflicts with, or needs loosening for, any rule in §2/§3 — this section is a confirmation pass, not a proposal.

---

## 8. Performance Considerations

- Every List/Detail/Aggregate query for the 7 resources with an existing index (§6) gains exactly one additional, already-indexed `.eq()`/`.in()` clause — negligible added cost, no new round-trip, no N+1 (`applyDataScope()` is designed as a single additional clause on an existing query builder, per its own original design).
- Team-scope's underlying "who are my teammates" lookup (`staff.team_id`, §3) is a small, already-indexed query regardless of which resource is asking — this cost is paid once per request pattern, not once per resource, if a future Development phase chooses to resolve it once per request and reuse the resulting id/name set across that request's own multiple resource queries (an implementation detail, not decided here, and not in tension with Decision 40, since Decision 40 is about not reusing a *resolved scope value* across resources, not about whether the teammate-lookup step itself can be shared).
- **Orders is the one resource where this rollout could introduce a real, measurable slowdown** — an unindexed `text` `.in()` filter against `sales_owner` scales linearly with table size and teammate-list size, unlike every other resource's indexed lookup. This is the concrete performance justification behind the candidate index in §6, not a hypothetical concern.
- Reports BI's RPC functions, once scope-aware, add one more join/filter condition (staff id or name set) to queries that already join `customer_purchases` to `staff` in at least one case (`reports_staff_analysis`) — extending an existing join pattern, not introducing a new one.

---

## 9. Data Integrity

- **Rows with no resolvable owner (Decision 44, locked)** — an Orders row whose `sales_owner` text doesn't match any current `staff.full_name` even after the Decision 43 normalization (stale master-data value, a staff member since renamed), or a Customer Purchases row with `salesperson_id IS NULL` and a `salesperson` value that doesn't match any `staff.full_name` either: **the Owner role can still access such a row; every other role cannot, regardless of that role's own configured Data Scope for the resource.** This is a role-identity carve-out, not a scope-tier rule — even a role configured to "All" scope for a given resource does not see an unresolved-ownership row under this rule; only the Owner role does. Not a data corruption — the row still exists and remains fully visible to Owner — but a deliberate, narrow exception, since it names a specific role rather than a scope value (see Self Review regarding Permission Center's own "no hardcoded roles" principle).
- **Why Owner specifically, not "All-scoped roles":** an unresolved-ownership row is, by definition, a data-quality gap (a stale name, a typo, a renamed staff member) rather than a legitimate "this row belongs to everyone" case — reserving visibility for the one role that exists specifically to have full administrative oversight, rather than for whichever roles happen to be configured to "All" for that resource today, keeps this fallback from silently depending on a scope configuration that could change independently of this rule's intent.
- **Staff status changes:** because every `uuid` ownership column uses `ON DELETE SET NULL` (§7) and staff are never hard-deleted (only `Active`/`Inactive`, an existing convention), a former or inactive staff member's historically-owned rows keep their ownership value indefinitely — an Inactive staff member's past Customer/Purchase/Marketing/Activity Log rows remain correctly attributed to them, they just can no longer log in to view them under "Own" themselves.
- **Whether Team-membership matching should include Inactive staff** (i.e., does an Inactive teammate's historical data still count under a currently-Active colleague's "Team" view?) is not decided by this document — flagged in §13.

---

## 10. Migration Strategy

**No migration is proposed for 7 of the 8 resources** — Customers, Customer Purchases, Sales Ledger, Marketing, Activity Log, Dashboard, and Reports BI all use fields that already exist, are already indexed, and already have appropriate nullability/constraints (§1, §6, §7). Implementing Data Scope for these resources is purely a query-construction change (§5), with zero database impact.

**Orders is the only resource with even a candidate database change**, and per Decision 45 it is explicitly a **Future Optimization** — not part of this sprint, not a rollout blocker. The index named in §6 is not a new column and not a change to the existing name-matching ownership mechanism the locked Business Design already committed to; if pursued later, it would be a single, purely additive `CREATE INDEX IF NOT EXISTS` — but neither its authorization nor its timing is decided or required by this rollout.

**No seed-data change is needed anywhere** — `role_data_scopes` is already seeded to `'all'` for every role and every one of the original 8 named resources from the Permission Center sprint (`PERMISSION_DATABASE.md` §19), meaning this rollout's cutover, per the locked Business Design's own phasing (§12), changes zero default behavior until a Product Owner or Role Management action explicitly narrows a specific role's scope for a specific resource.

---

## 11. Rollback Strategy

Since no schema change is made anywhere in this design (the one candidate index in §6 remains unauthorized), rollback for this entire rollout lives **entirely at the query-construction layer**, not the database layer: if enforcing Data Scope on a given resource's queries produces an incorrect result (a scope leak or an over-restriction), the fix is to stop calling `applyDataScope()` for that resource's affected queries — reverting a code change, not a migration. This is consistent with the locked Business Design's own phased rollout (§12): each of the 8 phases can be independently reverted without any risk of touching shared schema, since none of them altered any.

If the candidate Orders index (§6) is ever authorized and applied, its own rollback is equally trivial — dropping a purely additive index has no data-loss risk and no dependency from any other object.

---

## 12. Risks

| Risk | Likelihood | Impact | Notes |
|---|---|---|---|
| Orders' unindexed `sales_owner`/`created_by` make Team-scope queries slow as the table grows | Certain today, grows over time | Real user-facing latency on Orders List/Detail once Team-scope is enforced | §6, §8 |
| Orders' name-matching produces a false negative (row becomes invisible) or false positive (wrong owner) on a stale/misspelled master-data value | Medium | A Sales-Own-scoped user misses their own order, or sees someone else's | §2, §9 — inherited from the already-locked Business Design, not introduced here |
| A future Development pass forgets Marketing's two different `ownerField`s and applies the wrong one | Medium | Segments/Campaigns scoped by the wrong column | §5 |
| "No resolvable owner" rows silently disappear from Own/Team views with no signal to an admin that a row is effectively orphaned | Medium | Legitimate business data becomes hard to find for anyone below "All" scope, with no obvious explanation why | §9 |
| Team-membership matching's Active/Inactive staff question (§9) is left undecided and each resource's rollout phase answers it differently | Low today, grows as more phases ship | Inconsistent Team-scope behavior across resources, undermining Cross-module Consistency (locked Spec §6) | §9, §13 |

---

## 13. Open Questions

1. **Should Team-membership matching include Inactive staff as teammates**, or only currently-Active ones (§9)? Needs one answer applied consistently across all 8 resources, not decided per-phase.
2. **Should Reports BI's RPC functions each be extended to accept an explicit scope parameter, or should scope filtering happen in a wrapping layer that calls them** — an implementation-shape question for Development, not a database-design one, but named here since it affects whether any RPC function signature needs to change later.
3. **(Carried from the locked Business Design, still unresolved at the database level too)** Should Commissions/`sales_commissions` ever join this rollout, given Dashboard's Commission widget and parts of Reports BI remain structurally outside every scope resolution defined in this document?

Resolved this revision: the candidate `orders.sales_owner` index's authorization/timing (Decision 45 — locked as a Future Optimization, not a blocker) and the "no resolvable owner" default (Decision 44 — locked as Owner-only access) — both removed from this list as no longer open.

---

Database design only. No code written. No SQL written. No existing schema changed. No business rule modified. Stopping — waiting for Product Owner Review.
