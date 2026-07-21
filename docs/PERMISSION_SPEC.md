# Enterprise Permission Center — Business Design Spec (Draft, Revision 2)

**Sprint:** v4.0.0 — **Enterprise Permission Center only** (Product Owner Decision 1, this revision). `docs/PROJECT_MANIFEST.md`'s locked Sprint Roadmap still has no Permission Center entry; per precedent (Jade Intelligence, Market Intelligence), this mismatch is flagged, not reopened as a blocking question — the Product Owner has now named and scoped the sprint directly.
**Module:** Permission Center (new)
**Status:** Draft — Revision 2. Business Design Review **approved**, with 8 scoped Product Owner Decisions applied below (see "Product Owner Decisions Applied"). Per Project Rules V1.1's Specification rule, this document stays Draft/editable-in-place until explicitly marked LOCKED — that has not happened yet, so Revision 2 edits Revision 1 in place rather than forking a new file.
**Phase:** Business design only. No code, no SQL, no migrations, no UI were written for this document.

---

## Product Owner Decisions Applied (Revision 2)

1. **Sprint scope** — Sprint v4.0.0 builds the Permission Center module itself (Role Management, configurable Permissions, the Data Scope model, Sensitive Field designation, Audit Trail). It does **not** include retrofitting Data Scope/Field Visibility enforcement into existing modules' queries (Customer, Orders, Reports, Dashboard, Marketing, Commission, Inventory, Sales Ledger, Data Verification) — each of those remains a separate future sprint with its own Impact Analysis, per Project Rules V1.1's Impact rule. This resolves former Open Questions #1 and #2.
2. **Role model** — roles are fully dynamic/DB-backed. `Owner` / `Manager` / `Sales` (and the framework's other current values, `Marketing` / `Viewer`) are no longer a fixed TypeScript union; they become ordinary data rows a Role Management screen can create, rename, or remove without a code change. Resolves former Open Question #3.
3. **Permission naming standard** — `resource.action`, dot-separated, e.g. `customers.view`, `customers.create`, `orders.view`, `reports.view`. The `resource` segment may itself be hierarchical (`marketing.broadcast.manage` = resource `marketing.broadcast`, action `manage`) — the **last** segment is always the action. Resolves former Open Question #5 (per-action granularity, not a single view/no-view flag).
4. **Data Scope** — exactly three values: **Own Data**, **Team Data**, **All Data**. No other scope tier is in scope for v4.0.0.
5. **Team Data** — approved as a scope value. The relationship needed to compute it (`staff.manager_id` vs. `staff.team_id` vs. something else — no such field exists in `staff` today) is explicitly deferred to `PERMISSION_DATABASE.md`; Database Design is authorized to introduce it. Resolves former Open Question #7.
6. **Sensitive Fields** — exactly five, no more: **Cost Price, Profit, Commission, Company Revenue, Internal Notes**. "Internal Notes" maps to the existing `Customer.notes` field (`types/customer.ts:14`) — the only field in the schema matching that description; there is no separate "VIP Care notes" field today. Resolves former Open Question #8.
7. **Frozen business rules** — no existing business rule (Orders flow, Inventory status logic, Reports aggregation, Commission calculation, etc.) changes as part of this sprint. Only permission *enforcement* is added on top; nothing about *what* the app computes changes, only *who* may see/do it once enforcement is later wired in module-by-module.
8. **Audit Trail** — every Role, Permission, and Data Scope change must be recorded via the existing `activity_logs` / `logActivity()` (§8) — confirms and slightly sharpens the original requirement (Role Created/Updated, Permission Changed, Data Scope Changed) into an unconditional "every change," not just those four event types.

**Note on the originating brief:** the brief also instructed "no breaking changes," "reuse the existing Permission Framework/Activity Log/Staff module," and "do not stop until fully implemented." This document takes the first three as genuine scope constraints (see §2 Current State and Explicitly Out of Scope) and does not honor the fourth — it stops here for Product Owner Review per the standing Definition of Done, same as every prior module.

---

## 1. Business Goal

### The problem

Today's permission system (`types/permission.ts`, `lib/permission.ts`, `components/shared/RouteGuard.tsx` — built under Feature 7 in an earlier sprint) is explicitly a **framework-only prototype**, not an enforcement system:

- `StaffRole` (`types/staff.ts`) is a **fixed TypeScript union** — `"Owner" | "Manager" | "Sales" | "Marketing" | "Viewer"` — not data. Adding or renaming a role requires a code change and redeploy.
- `Permission` is likewise a **fixed union of ~9 string literals**, and `ROLE_PERMISSIONS` is a **hardcoded `Record<StaffRole, Permission[]>`** map in `lib/permission.ts`. This is exactly the "hardcoded role mapping" the brief says to eliminate.
- `RouteGuard` exists but **is not wired into a single page or query anywhere in the app** (confirmed by its own doc comment: "Not wired into any page in this sprint"). Every page, menu entry, and Supabase query in the app is fully open today regardless of role.
- There is no Data Scope concept (Own/Team/All) anywhere — no query in the codebase filters by staff ownership.
- There is no Field Visibility concept — Cost Price, Profit, Commission, and Company Revenue figures render unconditionally wherever the UI already shows them (Product forms, Reports, Commission pages, Dashboard).
- The Sidebar (`components/Sidebar.tsx`) gates entries with a single static `enabled: boolean` per link (feature-readiness only, e.g. "Sắp có"), not a permission check.

So the brief's objective — Feature Permissions, Data Scope, Menu Visibility, Field Visibility, Report/Dashboard filtering, Audit Trail, all server-enforced, all configurable, no hardcoded roles — is not an extension of a working system. It is a **replacement of the role/permission data model** (enum → configurable, DB-backed roles and permissions) plus **net-new server-side enforcement** threaded through every existing module's read queries. That is a substantially larger and more cross-cutting change than any prior sprint (Orders, Inventory, Reports, Jade/Market Intelligence) — Decision 1 resolves the phasing question this raised by scoping v4.0.0 to the framework itself, deferring per-module rollout to future sprints.

### Connection to other modules

| Module | Relationship to Permission Center |
|---|---|
| **Staff** (existing) | Source of `staff.role`. Decision 2 replaces `StaffRole`'s fixed union with DB-backed, dynamic role data. No existing Staff field, form, or write path changes without a separate approval. |
| **Activity Log** (existing, `activity_logs` table / `activityLog.service.ts`) | Reused as-is for the Audit Trail requirement (Decision 8: every Role/Permission/Data Scope change) — the table and `logActivity()` already support arbitrary `action`/`entity`/`entity_id` values, no schema change appears necessary for logging alone (see §8). |
| **Customer, Orders, Reports, Dashboard, Marketing, Commission, Inventory, Sales Ledger, Data Verification** (all LOCKED or IN PROGRESS) | Every one of these is named in the brief as eventually needing server-side Data Scope enforcement and/or Field Visibility. Per Decision 1, none of that enforcement is implemented in v4.0.0 — this spec inventories the requirement so the framework can express it, but each module's actual enforcement remains its own future Impact Analysis and approval (see Explicitly Out of Scope). |
| **Orders** (BLOCKED) | Named in the brief's Feature Permissions/Data Scope examples. Orders is currently blocked project-wide for unrelated reasons ([[orders-spec-revision-history]]) — this spec defines the Orders permission requirements on paper only; no Orders code exists yet to enforce them against. |

---

## 2. Current State (what already exists and can be reused)

Per the brief's own "Reuse the existing X" instructions:

- **Permission Framework:** `Permission` type + `ROLE_PERMISSIONS` map (`types/permission.ts`) + `hasPermission()` (`lib/permission.ts`) + `RouteGuard` (`components/shared/RouteGuard.tsx`) + `getCurrentStaff()`. The *shape* (role → permission list, a guard component, a way to resolve the current staff member) is reusable. The *hardcoded-ness* of the role and permission sets is exactly what must change.
- **Activity Log:** `activity_logs` table, `logActivity()`, `getActivityLogsByStaff()`, `getActivityLogsByEntity()` (`lib/activityLog.service.ts`) — generic enough to log Role Created/Updated/Permission Changed/Data Scope Changed events without schema changes, using `entity: "role"` or `"permission"` and `entity_id` = the affected role/permission id.
- **Staff module:** `staff` table, `types/staff.ts`, existing Staff pages under `app/settings/staff/` and `components/staff/`. `Staff.role` is the join point for the dynamic role model Decision 2 locks in.

Nothing above requires a new table just to satisfy "reuse" — but Feature Permissions/Data Scope/Field Visibility as configurable, DB-backed concepts do not exist in any form today and need new schema. A candidate `roles` / `permissions` / `role_permissions` / `data_scope_rules` shape is proposed in Remaining Open Questions #3, not locked here — that belongs in `PERMISSION_DATABASE.md` after this document is approved.

---

## 3. Feature Permissions

Business need: for each feature area named in the brief (Customers, Products, Orders, Purchases, Reports, Sales Ledger, Dashboard, Marketing, Automation, Broadcast, Voucher, Loyalty, Staff, Inventory, and future modules), a role can be granted or denied access, and this must be checked server-side, not just used to hide UI.

This generalizes today's `Permission` string-literal set into data: a permission is identified by a feature key rather than a compile-time literal, and which permissions exist plus which roles hold them must both be editable without a code change (brief: "No hardcoded role mapping. Support configurable roles. Support configurable permissions.").

**Naming standard (Decision 3, LOCKED):** `resource.action`, dot-separated — e.g. `customers.view`, `customers.create`, `orders.view`, `reports.view`, `marketing.broadcast.manage`. The resource segment may be hierarchical; the final segment is always the action. The exact action taxonomy per resource (which of view/create/edit/delete/manage/approve applies to which feature) is an enumeration task, not a business decision — it belongs in `PERMISSION_DATABASE.md`.

**Note for Database Design:** today's hardcoded `types/permission.ts` mixes colon-style keys (`staff:view`, `staff:manage`, `customers:manage`, `commission:approve`, `settings:manage`) with dot-style keys already following this standard (`marketing.manage`, `marketing.automation.manage`, `marketing.broadcast.manage`, `marketing.loyalty.manage`, `marketing.voucher.manage`). Migrating the colon-style keys to dot notation touches other already-LOCKED modules' code (Marketing, Commission) — flagged as a remaining item needing sign-off before Development, not assumed here (see Remaining Open Questions).

---

## 4. Data Scope

Business need: for the named entities (Customers, Orders, Revenue, Sales Ledger, Dashboard, Reports, Marketing, Commissions), a role's visibility is one of **Own Data / Team Data / All Data** (Decision 4, LOCKED — exactly these three, no other tier), enforced server-side on every query, not fetched-all-then-filtered client-side (brief: "Server-side filtering only. No fetch-all."). Per Decision 1, wiring this enforcement into each named module's actual queries is out of scope for v4.0.0 — this section defines the business rule the framework must be capable of expressing, not a retrofit of existing query code.

Two business concepts this needs that do not fully exist in the schema today:
- **"Own"** requires an ownership field per entity. Customer already has one (`assigned_staff_id`). Orders, Purchases, and other named entities' ownership fields still need to be confirmed or added per entity — carried forward as a remaining item for Database Design (former Open Question #6); any genuinely new field still requires its own explicit approval per Project Rules V1.1's Field rule.
- **"Team"** requires a team/reporting-structure concept. No `team_id`, `manager_id`, or `department` field exists anywhere in `types/staff.ts` or the `staff` table today (confirmed by search). **Decision 5 (LOCKED):** Team Data is approved as a scope value; Database Design is explicitly authorized to introduce whatever relationship it needs to compute it.

---

## 5. Field Visibility

Business need: hide sensitive fields from roles that shouldn't see them, server-side (so the value is never sent to the client for a role that shouldn't see it, not just CSS-hidden).

**Sensitive Fields (Decision 6, LOCKED) — exactly five, no more:** Cost Price, Profit, Commission, Company Revenue, Internal Notes. "Internal Notes" maps to the existing `Customer.notes` field (`types/customer.ts:14`) — the only field in the schema matching that description; there is no separate "VIP Care notes" field today, so no further identification question remains.

This is still the requirement with the widest existing-code blast radius: Cost Price/Profit appear on Product forms and Batch/Inventory views, Commission throughout the Commission module and Dashboard's `CommissionSummaryCard`, Company Revenue throughout Reports/Dashboard/Sales Ledger, and Internal Notes on Customer Detail. Every one of these lives inside a currently-LOCKED module — per Decision 1, actually enforcing field-level hiding inside those modules is a future per-module sprint, not part of v4.0.0. This sprint defines which fields are sensitive and gives the framework a way to mark them; it does not yet touch the modules that render them.

---

## 6. Menu Visibility

Business need: Sidebar entries hide automatically when the signed-in staff member lacks the corresponding Feature Permission, enforced so that a denied route also rejects server-side (brief: "No client-side only checks"), not merely a Sidebar that hides a link while the page underneath still renders/returns data if navigated to directly.

`components/Sidebar.tsx`'s current `enabled: boolean` per link is a static, permission-unaware flag ("Sắp có" = not built yet) — this becomes a second, orthogonal condition (permission-derived, per signed-in staff) layered on top of it, not a replacement of it.

---

## 7. Dashboard & Report Filtering

Business need: Dashboard KPIs/charts/revenue/customer counts/sales counts, and Reports (BI, Sales Ledger, Marketing, Customer Reports), automatically narrow to the viewer's Data Scope — same server-side-only constraint as §4, applied to every aggregate query in `lib/reports/*`, dashboard card components, and the Sales Ledger view.

No new business rule is proposed here beyond "apply whatever Data Scope (§4) resolves to, to every aggregate query in these modules" — per Decision 1, actually doing so is a future per-module sprint (each with its own Impact Analysis), not part of v4.0.0. This section stays as the target-state business rule these future sprints implement against.

---

## 8. Audit Trail

Business need: log every Role, Permission, and Data Scope change (Decision 8, LOCKED — broadened from the original four named event types — Role Created, Role Updated, Permission Changed, Data Scope Changed — to an unconditional "every change"). Reuses `logActivity()`/`activity_logs` as-is (§2) — no new table appears necessary for this specific requirement, assuming the existing `entity`/`entity_id`/`action` free-text columns are sufficient (they already serve this purpose for every other module's activity logging).

---

## Explicitly Out of Scope (this document, v4.0.0)

- Any database migration, table, or column (new or altered) — schema requires an approved `PERMISSION_DATABASE.md` first, per Project Rules V1.1's Database rules.
- Any code change to Staff, Customer, Orders, Reports, Dashboard, Marketing, Commission, Inventory, Sales Ledger, or Data Verification's own query layer — retrofitting Data Scope/Field Visibility enforcement into these LOCKED/IN PROGRESS modules is explicitly excluded from v4.0.0 (Decision 1) and requires its own future Impact Analysis and approval per module.
- Any modification to existing business rules (Orders flow, Inventory status, Reports aggregation, Commission calculation, etc.) — Decision 7 confirms this sprint only adds permission enforcement capability, it does not change what any module computes.
- Any UI (new screens, Role Management screens, permission matrices) — belongs in a future `PERMISSION_UI.md`, same sequence as every prior module.
- Deciding the exact schema shape, per-entity ownership fields, or legacy permission-key migration — carried into Remaining Open Questions below, to be settled in `PERMISSION_DATABASE.md`.

---

## Remaining Open Questions

1. **Per-entity ownership fields for "Own Data":** Customer has `assigned_staff_id` today. What is the ownership field for Orders (not yet built), Purchases (`customer_purchases`), and any other Data-Scope-gated entity? Needs to be confirmed per entity in Database Design; any genuinely new field still requires its own explicit approval per Project Rules V1.1's Field rule.
2. **Legacy permission-key migration:** `types/permission.ts` today mixes colon-style keys (`staff:view`, `staff:manage`, `customers:manage`, `commission:approve`, `settings:manage`) with dot-style keys that already match Decision 3's standard (`marketing.manage` and its four siblings). Renaming the colon-style keys touches other already-LOCKED modules' code (Marketing, Commission). Confirm this rename is in scope for Database Design/Development before it's executed.
3. **Schema shape:** a `roles` / `permissions` / `role_permissions` / `data_scope_rules` shape (Role Management, Feature Permission Matrix, Data Scope Engine per the original brief's package names) is proposed as the starting point — not locked here, to be finalized in `PERMISSION_DATABASE.md`.

Former Open Questions #1 (sprint identity), #2 (phasing), #3 (role model), #5 (permission granularity), #7 (Team definition), #8 (Sensitive Notes identity), and #9 (rollout backward-compatibility) are resolved — see "Product Owner Decisions Applied" above.

---

Business Design only. No code written. No database changes. No UI changes. Stopping — waiting for Product Owner Review.
