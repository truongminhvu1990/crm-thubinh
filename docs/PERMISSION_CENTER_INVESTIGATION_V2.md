# Permission Center Investigation V2 — Findings Report

**Module:** Permission Center Investigation V2
**Status:** Investigation only. No code, no database, no business rule was changed, added, or redesigned in the course of producing this document.
**Package status at time of writing:** Package 1 APPROVED, Package 2 APPROVED, Business Rules LOCKED (per the originating task) — this document is the requested investigation deliverable; it does not implement anything against those approvals.
**Method:** Direct reading of every relevant spec/database/UI doc and core library file, plus four parallel deep-dive passes over the actual codebase (API routes, module-by-module business-rule verification, Permission Center completeness, Staff module + legacy-system usage). Every claim below is sourced to a file:line; where something could not be confirmed, it is stated as "not found" rather than assumed.

**Headline finding, read this first:** this codebase does not have one permission system in an unfinished state — it has **three, of different vintages, with different amounts of real reach**, and they disagree with each other and with the newly-locked Business Rules in ways that are not visible from the design docs alone (which are all still marked "Draft," "awaiting Product Owner Review," even though their code has shipped):

1. **Legacy hardcoded RBAC** (`types/permission.ts`, `lib/permission.ts`, `components/shared/RouteGuard.tsx`) — fully built, **fully dead**. Zero real call sites beyond its own internals.
2. **Permission Center core** (`roles`/`permissions`/`role_permissions`/`role_data_scopes`/`permission_sensitive_fields`, `lib/permission/permissionCenter.service.ts`) — a complete, working admin cockpit (full UI at `/settings/permissions/**`, full API surface) for editing roles, permission grants, data scopes, sensitive-field pairings, and teams — but its own **permission-key grants** (`customers.manage`, `commission.approve`, etc.) and its **sensitive-field pairings** are **never read by anything that serves real data**. Only its single `settings.manage` key is actually consulted, and only to gate the cockpit itself, the Ops Console, and Staff creation/role-assignment.
3. **Data Scope Rollout (Sprint v4.1)** — a separate, later, already-implemented sprint (docs exist: `docs/DATA_SCOPE_ROLLOUT_SPEC.md`/`_DATABASE.md`/`_UI.md`, none referenced by the originating task or by prior project memory) that genuinely wires Own/Team/All row filtering into 7 real modules (Customers, Orders reads, Customer Purchases, Sales Ledger, Marketing, Activity Log, one Dashboard revenue widget). This is real, live enforcement — but every role is seeded to `'all'` on every resource, so today it enforces nothing narrower than "everyone sees everything," and it cannot express "Marketing = Hidden" at all (no fourth scope tier exists).

None of the three systems implement any of the newly-LOCKED Business Rules in the originating task (Customer Profile shared / Purchase History Owner=All-Manager=Team-Sales=Own-Marketing=Hidden / Order-creation must never leak prior cross-staff history). The mechanism to implement most of them already exists in Data Scope; two specific rules (Marketing = Hidden, and "Customer Profile is never scope-restricted") are **not expressible** by the current schema/framework at all and need a Product Owner-confirmed extension, not just configuration.

---

## A. Current Architecture

Three independent systems, all present in the repository simultaneously:

### A.1 Legacy Permission Framework ("Feature 7")
- `types/permission.ts` — fixed `Permission` string-literal union (10 values: `staff:view`, `staff:manage`, `customers:manage`, `commission:approve`, `settings:manage`, `marketing.manage`, `marketing.automation.manage`, `marketing.broadcast.manage`, `marketing.loyalty.manage`, `marketing.voucher.manage`) and a hardcoded `ROLE_PERMISSIONS: Record<StaffRole, Permission[]>` map.
- `lib/permission.ts` — `hasPermission(role, permission)` (pure lookup into the map above) and a **client-side** `getCurrentStaff()` (browser Supabase client, `auth.getUser()` → match `staff` by `email`).
- `components/shared/RouteGuard.tsx` — a `<RouteGuard permission={...}>` wrapper component that calls the above two functions.
- **Reach: effectively zero.** `hasPermission()` has exactly one call site in the whole repo (`RouteGuard.tsx:23`), and `RouteGuard` itself has zero JSX usages anywhere (`grep '<RouteGuard'` = no matches). `@/types/permission`'s `Permission` type is imported by exactly 2 files, both part of this same dead cluster. This entire framework was built, documented as "framework only, not wired into any page," and has never since been wired into anything.
- The **only living export** from `lib/permission.ts` is `getCurrentStaff()` itself, which has been repurposed as a generic "who's signed in" resolver for the newer Data Scope helpers (17 files, 31 call sites — see A.3) — not for any permission check.

### A.2 Permission Center core (Sprint v4.0.0)
Five new tables (migration `supabase/migrations/20260729_permission_center_module.sql`, matches `docs/PERMISSION_DATABASE.md` Rev 2 exactly):
- `roles` (`id`, `role_key`, `name`, `description`, `is_active`) — seeded with the 5 legacy roles, using `staff.role`'s exact casing (`"Owner"`, `"Manager"`, …) as `role_key`, not a lowercase slug.
- `permissions` (`resource.action`-keyed) — seeded with 10 rows: the 5 legacy colon-style keys renamed to dot notation (`staff.view`, `staff.manage`, `customers.manage`, `commission.approve`, `settings.manage`) plus the 5 already-dot-style Marketing keys.
- `role_permissions` — replayed 1:1 from the old `ROLE_PERMISSIONS` map (e.g. Owner → all 6 base+marketing permissions it had before; Sales → only `customers.manage`; Viewer → only `staff.view`).
- `role_data_scopes` — seeded `scope = 'all'` for **every** (role × 8 named resource) pair.
- `permission_sensitive_fields` — seeded **empty**.
- `staff.team_id` (plain text, no backing table) and `staff.role_id` (nullable FK → `roles.id`, alongside the untouched legacy `staff.role`) added.

Supporting code, all under `lib/permission/`:
- `serverAuth.ts` — `getCurrentStaffFromRequest()` (server-side, cookie-based; resolves by `auth_user_id` first, falls back to `email`), and `requirePermissionCenterAccess()` (401/403 helper gated on the single permission key `settings.manage`).
- `permissionCenter.service.ts` — `resolveRoleForStaff()`, `getGrantedPermissionKeys()`, `resolveStaffPermissions()` (60s-TTL cached, `permissionCache.ts`), `staffHasPermission()`, `getResolvedDataScope()`, `getVisibleSensitiveFields()`, plus write operations (`createRole`, `updateRole`, `toggleRolePermission`, `cloneRolePermissions`, `setDataScope`, `toggleSensitiveFieldPairing`, `renameTeam`, `assignTeam`, `assignStaffRoleAndTeam`) — every write logs to `activity_logs` and invalidates the cache.
- `permissionCenter.repository.ts` — thin CRUD, no logic.
- `permissionCenter.constants.ts` — UI label maps only.
- `permissionCenterApi.ts` — the sole client for all Permission Center writes; nothing in this cluster calls Supabase directly from the browser, everything goes through the gated API routes below.

Full API surface (12 routes, `app/api/permissions/**`) and full UI (8 pages + 5 components under `app/settings/permissions/**` and `components/permission/**`, 1,611 combined lines, reachable via a card on `/settings` directly below "Nhân viên") — **every route and every screen described in `docs/PERMISSION_UI.md` Rev 2 exists and matches the doc**, including the Permission Dashboard landing tab, Role List/Detail (Quyền + Phạm vi dữ liệu tabs), Clone Permission, Permission Matrix, read-only Data Scope Matrix, Sensitive Field Config, Team Management (closed-list only, per Decision 13), and Audit History.

**But its own core deliverable — configurable, per-feature permission grants — has no consumer.** `staffHasPermission()` is called from exactly one place in the entire repo outside its own file: `serverAuth.ts:87`, always with the literal string `"settings.manage"`. Granting or revoking `customers.manage`, `staff.manage`, `commission.approve`, or any `marketing.*.manage` key to a role in the Role Detail / Permission Matrix UI changes real rows in `role_permissions`, but **nothing in the app ever reads those specific keys back**. Similarly, `getVisibleSensitiveFields()` is defined and has zero callers anywhere (confirmed by repo-wide grep) — Role Detail's own "which sensitive fields can this role see" summary is computed client-side from already-fetched data, not by calling this function, and no data-serving code anywhere calls it either.

### A.3 Data Scope Rollout (Sprint v4.1) — the one part that reaches real modules
`lib/permission/dataScope.ts` (351 lines) provides four query-filtering helpers, all genuinely called from outside `lib/permission/`:
- `applyDataScope()` — generic single-uuid-column Own/Team/All filter. Called from `lib/customer.service.ts:85,103,378` (resource `customers`, field `assigned_staff_id`) and `lib/marketing/marketing.repository.ts:58,98,314,336` (resource `marketing`, fields `created_by`/`owner_staff_id`).
- `applyDataScopeByName()` — text-only, case-insensitive name-matching (no uuid column exists). Called from `lib/orders/order.repository.ts:95,112` (resource `orders`, field `sales_owner`).
- `applyDataScopeWithFallback()` — uuid column preferred, text column fallback for historical rows. Called from `lib/purchase.service.ts:47`, `lib/salesLedger/salesLedger.repository.ts:75,126`, and `lib/reports/reports.service.ts:200` (all resource `revenue`, fields `salesperson_id`/`salesperson`).
- `applyActivityLogScope()` — a **fixed, hardcoded** per-role table (Owner=all, Manager=team, Sales/Marketing/Viewer=own) that deliberately bypasses `role_data_scopes` entirely (Decision 39, `docs/DATA_SCOPE_ROLLOUT_SPEC.md` §3). Called from `lib/activityLog.service.ts:79`.
- `resolveMyDataScope()`/`resolveMyActivityLogScope()` — non-filtering resolvers, used only by `components/shared/ScopeIndicator.tsx` to render a "your current scope" badge.

All four filtering helpers implement default-deny (`NEVER_MATCHES`/`NEVER_MATCHES_TEXT` sentinel values) when no role resolves or no `role_data_scopes` row exists — this part of the design is sound. But default-deny only matters once an admin actually sets a scope narrower than `'all'`; today, nothing does (see E).

**A file-level comment in `dataScope.ts:44-46` is worth quoting directly**, since it is the single clearest piece of evidence that this system predates and was disconnected from actual use until very recently: *"this bug was latent since Decision 20 first built this file ('NOT wired into any existing module's queries... exported and otherwise unused today') and only surfaced now that the Data Scope Rollout (Sprint v4.1) actually calls it."* This confirms the Rollout is recent, real, and materially changes the "framework-only" baseline that prior project memory (and this investigation's own originating context) assumed.

### A.4 Authentication / route-gate layer (separate from all three permission systems)
- Root `proxy.ts` (this Next.js version's middleware entry point — see §C) is the **only** thing every request passes through. It checks *only* "is there a valid Supabase Auth session" — no role, no permission, no staff status.
- No `middleware.ts` exists (confirmed) — `proxy.ts` at the repo root is it.
- Orders API routes additionally resolve `getCurrentStaffFromRequest()` for their two GET endpoints only (see D).

---

## B. Permission Matrix (current, as-implemented — not the target state)

Legacy `ROLE_PERMISSIONS` as seeded into `role_permissions` (identical content, just renamed keys) — this is the only permission-key matrix that has ever existed with real content, and it is not consulted by anything except the dead `RouteGuard`:

| Role | Permissions held |
|---|---|
| Owner | `staff.view`, `staff.manage`, `customers.manage`, `commission.approve`, `settings.manage`, `marketing.manage` |
| Manager | `staff.view`, `customers.manage`, `commission.approve`, `marketing.manage` |
| Sales | `customers.manage` |
| Marketing | `customers.manage`, `marketing.manage` |
| Viewer | `staff.view` |

The 4 Marketing sub-permissions (`marketing.automation.manage`, `.broadcast.manage`, `.loyalty.manage`, `.voucher.manage`) exist as rows in `permissions` but were never assigned to any role in the seed (an intentionally-left-open question per `types/permission.ts`'s own comment) and remain unassigned today.

**The only permission key with any real effect anywhere in the app is `settings.manage`**, held only by Owner. It gates: all 12 Permission Center routes, all 8 Ops Console routes, `POST /api/staff` (staff creation), and `PATCH /api/staff/[id]/permission-assignment` (role/team assignment). This is a single all-or-nothing switch, not a matrix in practice — Manager, despite holding `commission.approve` and `customers.manage` on paper, cannot reach Permission Center, Ops Console, or create/reassign staff, and no code anywhere checks `commission.approve` or `customers.manage` for anything.

**Data Scope matrix (the part that is real)** — `role_data_scopes`, all 5 roles × 8 resources, currently 100% `'all'` from the seed migration with no evidence found of any subsequent reconfiguration:

| Role | customers | orders | revenue | sales_ledger | dashboard | reports | marketing | commissions |
|---|---|---|---|---|---|---|---|---|
| Owner | all | all | all | all | all | all | all | all |
| Manager | all | all | all | all | all | all | all | all |
| Sales | all | all | all | all | all | all | all | all |
| Marketing | all | all | all | all | all | all | all | all |
| Viewer | all | all | all | all | all | all | all | all |

(Live values were not queried against a running database in this investigation — this is the seeded default per migration and no admin-UI change was found evidenced elsewhere in the repo. Confirming the *live* table content is a one-query check the Product Owner or a future package should do before relying on this table.)

`role_data_scopes` has no row at all for the two resources the Data Scope Rollout actually added outside Permission Center's original 8 (Activity Log uses a separate hardcoded table instead, per A.3).

---

## C. Authentication Flow

1. Staff signs in via `app/login/page.tsx` → `supabase.auth.signInWithPassword()`. **On success, this redirects unconditionally to `/dashboard` — it never fetches the `staff` row or checks `status` at all.**
2. Every subsequent request (except `/login` and `/api/health`) passes through root `proxy.ts` (`proxy.ts:7-29`), which calls `supabase.auth.getUser()` (re-validates against the Supabase Auth server, not just the cookie — correct, per `P7_AUTHORIZATION_REVIEW.md §1`). Unauthenticated → redirect to `/login`. Authenticated visiting `/login` → redirect to `/dashboard`. **No role, permission, or staff-status check happens here.**
3. "Current Staff" is resolved from the authenticated Supabase Auth user by one of two independent code paths, which can disagree:
   - **Client-side** (`lib/permission.ts:getCurrentStaff()`) — browser Supabase client, matches `staff` by `email` only. Used by 17 files/31 call sites, almost all feeding the Data Scope helpers (A.3), a few for plain attribution (`created_by` on Marketing writes).
   - **Server-side** (`lib/permission/serverAuth.ts:getCurrentStaffFromRequest()`) — cookie-based server client, prefers `staff.auth_user_id` (added by `20260730_staff_auth_user_id.sql` as a Production Auth Hotfix) and falls back to `email` only if unlinked. Used by Orders' two GET routes and everything under `requirePermissionCenterAccess()`.
4. **Session lifecycle**: standard Supabase session cookie refresh (`lib/supabase/proxy.ts:createClient()`), refreshed on every request by `proxy.ts`. No independent session/permission cache exists beyond the 60-second in-process `permissionCache.ts`, which only caches resolved role+permission-keys, not the staff row itself.
5. **Staff Status is never consulted anywhere in this flow.** Rule A (Locked staff should be rejected after auth succeeds) has zero implementing code — `types/staff.ts:5-7`'s own comment says "Locked... nothing in this package sets it yet," and this investigation confirms nothing since has either. A Locked (or even Archived) staff member's Supabase Auth login succeeds and reaches `/dashboard` exactly like an Active one.

---

## D. Authorization Flow (what actually happens after authentication)

There is no single authorization flow — it forks by module, and the fork is the single most important architectural fact in this investigation:

- **Customer, Marketing, Reports/Sales-Ledger, Activity Log**: **no `app/api` route exists at all.** `"use client"` components call service functions (`lib/customer.service.ts`, `lib/marketing/marketing.repository.ts`, `lib/reports/reports.service.ts`, `lib/salesLedger/salesLedger.repository.ts`, `lib/activityLog.service.ts`, `lib/purchase.service.ts`) directly against the **browser** Supabase client. Data Scope filtering (A.3) happens inside these service functions, entirely client-side, before the query is sent — meaning the *filter* is real and server-executed-by-Postgres, but the *decision of which filter to apply* is made in code running in the visitor's own browser, backed by a database that (per `P7_AUTHORIZATION_REVIEW.md`) grants `USING (true)` to any `authenticated` session on every one of these tables. Any authenticated user who bypasses the app's UI/JS (e.g., calls the Supabase REST endpoint directly with their own session token) receives **completely unscoped, unfiltered data** — RLS provides no backstop.
- **Products, Batches, Inventory**: **no `app/api` route and no Data Scope call of any kind** (confirmed: zero `applyDataScope`/`getCurrentStaff` references in `lib/product.service.ts`/`lib/inventory.service.ts`). Fully open to any authenticated staff member, by the original single-tier design that predates Permission Center and was never revisited.
- **Orders**: the only module with a real `app/api` layer with mixed enforcement:
  - `GET /api/orders`, `GET /api/orders/[id]` — resolve the caller server-side (`getCurrentStaffFromRequest`) and apply `applyDataScopeByName(..., "orders", "sales_owner")`. Genuinely scoped reads.
  - `POST /api/orders` (create) — **no session/staff resolution at all**; `created_by` is taken verbatim from the client-supplied request body (`app/api/orders/route.ts:30-36`, comment: *"actor = created_by (Product Owner rule, until Authentication exists)"* — a rule written before real authentication existed and never revisited after it landed).
  - `PUT`/`DELETE /api/orders/[id]`, `items/[id]`, `payments`, `complete`, `lost`, `reassign-owner` — **every one of these** resolves "actor" from the *target row's own stored `created_by`*, not from the caller's session. **Zero authorization check beyond the global login gate on any Orders write endpoint.** Any authenticated user, any role, any configured Data Scope, can add a payment to, complete, mark lost, reassign the owner of, or delete any order in the system.
  - `GET /api/orders/[id]/history` — calls `getOrderDetail(id)` with **no `staff` argument at all** — returns any order's full event timeline to any authenticated user, unscoped, even though the sibling detail route two files away does scope correctly.
- **Staff**: `POST /api/staff` (create) and `PATCH /api/staff/[id]/permission-assignment` (role/team) are gated by `requirePermissionCenterAccess()` → `settings.manage`. Ordinary field edits (`updateStaff()`) and archiving (`archiveStaff()`) go through the plain client-side Supabase path with **no permission check in application code** — enforcement here, if any, would have to come from RLS (not differentiated per §A.4/P7 findings).
- **Permission Center's own screens + Ops Console**: 20 of 32 total `app/api` routes, uniformly gated by `requirePermissionCenterAccess()` → `settings.manage`, no gaps found.

**No API route in the entire repo calls `getVisibleSensitiveFields()`.** Cost Price, Profit, Commission, Company Revenue, and Internal Notes are never redacted server-side for any role, anywhere, confirmed by repo-wide grep.

---

## E. Current Data Scope (E maps directly to the LOCKED Business Rules — this is the section the Product Owner most needs)

### E.1 Mechanism vs. configuration — the critical distinction

The Own/Team/All *mechanism* exists and is wired into 7 modules (§A.3). Whether it enforces anything **today** is a pure configuration question: `role_data_scopes` is seeded 100% `'all'` (§B), so as of this investigation, **every role sees every row of every scoped resource** — the mechanism is live but its dial is turned fully open. This is a materially different — and more promising — starting point than "pure unimplemented framework," but it is not the same as "the locked rules are implemented," for three specific reasons:

1. **No admin-facing reconfiguration to Owner=All/Manager=Team/Sales=Own has been found evidenced anywhere** (no migration, no seed script, no code change touches `role_data_scopes` beyond the original all-`'all'` seed). Someone would need to use the already-built Data Scope tab (`/settings/permissions/roles/[id]`, Phạm vi dữ liệu) to set this per role, per the 8 resources it already covers.
2. **The scope model has no fourth tier.** `DataScope = "own" | "team" | "all"` (`types/permissionCenter.ts:6`) — "Marketing = Hidden entirely" from Purchase History cannot be expressed. The closest available emulation (delete Marketing's `role_data_scopes` row for the `revenue` resource, relying on default-deny) is a workaround, not a real "hidden" concept, and nothing in the schema or UI currently supports or documents this as an intentional pattern — it would need explicit Product Owner sign-off before being relied on as "Marketing = Hidden."
3. **Customer Profile is scoped by the exact same mechanism as Purchase History, which directly conflicts with the locked rule that Profile must never be owner-restricted.** `lib/customer.service.ts:84-85,102-103` applies `applyDataScope(query, staff, "customers")` (owner field `assigned_staff_id`) to `getCustomers()`/`getCustomerById()` — the base profile fetch, not just purchase history. If any role's `customers` data-scope is ever tightened from today's `'all'`, that role would lose access to *other staff's customer profiles entirely*, contradicting "Customer Profile is a shared company asset, everyone with Customer permission may access." **This is a live latent conflict in the current architecture, not a hypothetical** — the same `applyDataScope()` call cannot simultaneously satisfy "Profile = shared/all" and "Purchase History = Own/Team/All by role" unless Profile and Purchase History are scoped by two different resource keys with two different configured values, which per the Data Scope Rollout design they in fact already are (`"customers"` vs `"revenue"`) — so the conflict is avoidable by simply never narrowing `customers`' scope, but nothing today prevents an admin from doing so via the already-shipped Data Scope Matrix UI.

### E.2 Rule-by-rule verification (Owner=View All / Manager=View Team / Sales=Own Orders Only / Marketing=Hidden, on Purchase History)

| Rule | Status | Evidence |
|---|---|---|
| Owner = View All (Purchase History) | Mechanism present, not yet role-differentiated | `applyDataScopeWithFallback(..., "revenue", "salesperson_id", "salesperson")` in `lib/purchase.service.ts:47`; Owner's seeded scope for `revenue` is `'all'`, matching this rule by coincidence of the current all-open seed, not by deliberate configuration. |
| Manager = View Team | Not implemented | Same mechanism, but Manager's `revenue` scope is also seeded `'all'`, not `'team'`. Team resolution itself (shared `staff.team_id`) is implemented and correct in `dataScope.ts` if/when configured. |
| Sales = Own Orders Only | Not implemented | Same mechanism, Sales' `revenue` scope is also seeded `'all'`, not `'own'`. |
| Marketing = Hidden | Not implemented and not expressible today | No "hidden" tier exists (§E.1). No hardcoded `role_key === "Marketing"` check exists anywhere in customer/purchase code (confirmed by grep). |
| Customer may always be selected when creating an Order, regardless of Purchase History permission | Currently true, but incidentally, not by design | The order-creation customer picker (`app/orders/new/page.tsx:64-68`) only reads `full_name`/`phone` from search results — it never touches `customer_purchases`/Purchase History at all, so nothing currently blocks customer selection. If Purchase History scoping is later added to this exact picker's query, this rule would need explicit protection — nothing today guards it. |
| Order creation must never expose previous Orders/Revenue/Payment/Selling Price/Commission/history-by-another-Sales | Not violated today, but by absence of the feature, not by a guard | Confirmed: no code path in the create-order flow fetches a selected customer's prior orders, revenue, payments, or commission (`lib/orders/order.service.ts`, `app/orders/new/page.tsx` — neither references `customer_purchases`, `sales_commissions`, or a "previous orders" query). There is no explicit code-level prohibition preventing a future change from violating this — it currently holds only because nobody built the feature that would violate it. |
| Revenue / Commission / Payment "Protected" generally | Not implemented | These map to the Sensitive Fields mechanism (`cost_price`, `profit`, `commission`, `company_revenue` in `permission_sensitive_fields`), which is seeded empty and has zero callers anywhere (§A.2). Every Orders/Reports/Dashboard view renders these unconditionally to any authenticated staff member today. |

### E.3 Products & most of Reports/BI Center

- **Products/Batches/Inventory**: zero Data Scope or Sensitive Field enforcement of any kind — Cost Price and Selling Price render unconditionally everywhere (`app/products/[id]/page.tsx:55-57,72-73`).
- **Reports BI Center** (`lib/reports/reportsBI.service.ts`, 9 RPC-backed functions): **zero** Data Scope calls found in any of them — company-wide aggregates regardless of viewer, confirmed for `getRevenuePeriods`, `getRevenueSummary`, `getStaffAnalysis`, `getKpiDashboard`, etc.
- **Reports (legacy, `lib/reports/reports.service.ts`)**: one function (`getPurchaseReportData`, feeding a single Dashboard revenue widget) is scoped via `applyDataScopeWithFallback`; `getCustomerReportData`, `getProductReportData`, `getBatchStaticReportData`, `getRevenueByBatch` are not.
- **Dashboard's Commission KPI card** reads `sales_commissions` directly and was explicitly named as staying unscoped by the Data Scope Rollout's own design (`docs/DATA_SCOPE_ROLLOUT_SPEC.md §3/§6/§7/§14`, "Commissions" dropped from that sprint's 8 named resources) — a **documented, accepted inconsistency**: a Sales-Own-scoped viewer would (once Data Scope is actually configured narrower than `'all'`) see their own revenue correctly restricted right next to a Commission figure still showing company-wide numbers, on the same screen.

---

## F. Weaknesses

Ranked roughly by severity/blast radius, not by section order:

1. **Every Orders write endpoint has zero authorization beyond "is logged in."** Any authenticated staff member — any role, any Data Scope configuration — can add a payment, complete, mark lost, reassign the owner of, or delete any order, and can read any order's history via a route that doesn't even receive the caller's identity. This is a **critical** gap regardless of what Permission Center eventually does, because it exists entirely outside any permission framework's ability to fix by configuration alone — the code itself never asks who's calling on writes.
2. **Customer Profile and Purchase History share one Data Scope mechanism (`applyDataScope`/resource key) that cannot simultaneously satisfy both locked rules** (Profile = never restricted, Purchase History = role-tiered) **without careful, ongoing configuration discipline that nothing enforces.** An admin using the already-shipped Data Scope Matrix could accidentally narrow `customers` scope while intending to narrow only `revenue`/Purchase History, silently breaking "Profile is a shared asset."
3. **"Hidden" is not an expressible Data Scope value.** The Marketing-role Purchase History rule cannot be configured through the existing admin UI at all — this needs either a 4th scope tier, a dedicated boolean, or a different mechanism (e.g., a permission key actually being checked) before it can be locked in as intended.
4. **Sensitive Fields (Cost Price, Profit, Commission, Company Revenue, Internal Notes) are 100% unenforced everywhere** — the schema, the admin UI to configure pairings, and the resolver function (`getVisibleSensitiveFields()`) all exist, but zero data-serving code anywhere calls the resolver. This is the most complete-looking piece of dead machinery in the whole investigation — it looks finished but changes nothing.
5. **Permission Center's own core value proposition — configurable, per-feature RBAC — has no consumer.** Editing role/permission grants in the shipped UI has zero observable effect on the app beyond the one hardcoded `settings.manage` check. A Product Owner or admin using the Permission Center UI today would reasonably believe they are controlling feature access; they are not, for anything except Permission Center/Ops Console/Staff-creation access itself.
6. **Sidebar Menu Visibility is 100% unenforced and always was** (`components/Sidebar.tsx:50-79`) — every entry is a static `enabled: true`/`false` feature-readiness flag, never permission-derived, confirmed unchanged from the original Feature 7 design. No client-side *or* server-side gating exists for any menu entry.
7. **Client-side-only enforcement for Customers/Marketing/Reports/Activity Log, backed by permissive RLS.** Data Scope filtering for these modules happens in JS running in the browser before the query is sent; the underlying tables' RLS grants unconditional access to any `authenticated` session (per `P7_AUTHORIZATION_REVIEW.md`). Any authenticated user calling the Supabase REST API directly (bypassing the app's own code) receives fully unscoped data. This is a pre-existing, whole-schema architectural choice (documented and accepted in `PERMISSION_DATABASE.md §18` as "access control is uniformly an application-layer concern"), not unique to this investigation, but it means Data Scope's real-world guarantee is exactly as strong as "nobody but the app's own JS ever queries this database" — a client-inspectable assumption, not a server-enforced one.
8. **Rule A (Locked staff) has zero implementing code.** Login never checks `staff.status`; a Locked (or Archived) staff member's Auth session succeeds and reaches `/dashboard` exactly as an Active one would.
9. **Rule B (Archived staff excluded from new assignment) is only accidentally, partially satisfied** by a pre-existing generic "Active only" filter (`lib/hooks/useStaffOptions.ts:18`, `lib/staff.service.ts:315`) that predates the 4-state status widening and was never purpose-built for this rule — it happens not to conflict, but nothing guarantees it stays that way as the status model evolves.
10. **`created_by`/`sales_owner` on Orders is entirely client-supplied, not session-derived**, on the one write path (`POST /api/orders`) that sets it. Every Data-Scope-by-name filter on Orders (§A.3) trusts a field the calling client chose to send at creation time — a determined caller can misattribute an order to any staff member's name, independently undermining whatever Own/Team scoping is later configured.
11. **Orders' ownership signal is the structurally weakest of all 8 resources** — plain-text name-matching against `staff.full_name`, no uuid column, no index (`docs/DATA_SCOPE_ROLLOUT_SPEC.md §3/§4/§10/§13`, explicitly self-flagged in that doc as a real risk, not found by this investigation independently but confirmed present).
12. **Design docs are systematically stale relative to shipped code.** `PERMISSION_SPEC.md`, `PERMISSION_DATABASE.md`, `PERMISSION_UI.md`, and `DATA_SCOPE_ROLLOUT_SPEC.md`/`_DATABASE.md`/`_UI.md` are all still marked "Draft," "awaiting Product Owner Review" in their own status lines, while their described tables, services, APIs, and UI screens are fully built and, in Data Scope's case, live in 7 modules. Anyone reading only the docs (as this investigation initially did) would materially underestimate how much is already built — this is itself a process risk, not just a documentation nit.

---

## G. Required Refactoring (to actually implement the LOCKED Business Rules — described, not designed in detail; this is investigation, not a build plan)

1. **Fix Orders write-path authorization first, independent of Permission Center** — this is a standalone security gap, not something narrowing Data Scope config would fix, since the vulnerable routes never check the caller's identity for writes at all.
2. **Separate Customer Profile from Purchase History at the Data Scope key level, explicitly and permanently** — confirm (Product Owner decision, not a code guess) that `customers`-resource scope must always remain `'all'` for every role, or introduce a distinct mechanism so Profile access is structurally incapable of being scoped by the same lever as Purchase History.
3. **Add a fourth Data Scope tier (or an equivalent mechanism) capable of expressing "Hidden"** for the Marketing-role Purchase History rule — a genuine schema/framework question (new `DataScope` value + `CHECK` constraint change + UI change on an already-LOCKED Permission Center design), not a configuration change, so it needs its own Database Design-style review.
4. **Wire `getVisibleSensitiveFields()` into at least Products (Cost Price/Selling Price), Reports/Dashboard (Profit/Commission/Company Revenue), and Customer Notes (Internal Notes)** — currently zero consumers; this is the biggest single piece of "looks done, does nothing" work in the investigation.
5. **Decide what "actor" means now that real authentication exists** — Finding 2 from `P7_AUTHORIZATION_REVIEW.md` (client-supplied `created_by`) was flagged in that review and never resolved; it directly undermines any future Own/Team scoping on Orders if left as-is.
6. **Reconfigure `role_data_scopes` away from the all-`'all'` seed** to match Owner=All/Manager=Team/Sales=Own once the "Hidden" question (point 3) is resolved — this can be done through the already-shipped Data Scope Matrix UI, no new code needed, but should happen only after points 2 and 3 are settled to avoid the Customer Profile conflict.
7. **Decide whether Menu Visibility (Sidebar) enforcement is still wanted** — `PERMISSION_SPEC.md §6` calls for it, nothing has been built since the original framework-only sprint; this is a separate, not-yet-scoped piece of work.
8. **Decide whether the legacy `hasPermission()`/`ROLE_PERMISSIONS`/`RouteGuard`/`types/permission.ts` cluster should be deleted** now that it's confirmed 100% dead — not required for any Business Rule, but a clear dead-code removal candidate once the Product Owner confirms nothing else is planned to depend on it.
9. **Decide whether real per-feature permission-key enforcement (the Permission Center's original stated purpose) is still wanted at all**, given that in practice only Data Scope and the single `settings.manage` key have ever been wired to anything — if the answer is "Data Scope is what we actually rely on," the unused permission-grants and Sensitive-Fields parts of the UI/API should either get real consumers or be explicitly descoped rather than left as decorative surface area.

---

## H. Migration Plan (sequencing considerations only — no SQL, no schema proposed here)

This section names dependencies and ordering risk; it does not specify implementation.

1. **Orders write-path auth fix** has no dependency on anything else in this document and carries the highest current risk — it can and arguably should be sequenced independently of any Permission Center/Data Scope decision.
2. **The "Hidden" tier decision (G.3)** blocks correctly implementing the Marketing rule and should be resolved (as a scoped mini Business-Design → Database-Design pair, matching this project's established workflow) before any `role_data_scopes` reconfiguration for Purchase History, since seeding Marketing to `'own'` today would be a stand-in, not the locked rule, and could be mistaken for "done."
3. **The Customer Profile / Purchase History separation (G.2)** should be confirmed before touching `customers`' scope rows at all — sequencing this after any scope reconfiguration risks a live regression on a currently-LOCKED, already-shipped module (Customer).
4. **Sensitive Fields wiring (G.4)** touches Products, Reports, Dashboard, and Customer Notes — four already-LOCKED modules — each requiring its own Impact Analysis per Project Rules V1.1, sequenced independently of Data Scope work since the two mechanisms are orthogonal (rows vs. columns) per `DATA_SCOPE_ROLLOUT_SPEC.md §2`'s own explicit scope boundary.
5. **`role_data_scopes` reconfiguration (G.6)** is the lowest-risk, no-code step of the four core items, but should be sequenced *last* among them (after G.2/G.3), since it's also the easiest one to accidentally do first and declare victory prematurely.
6. **Dead-code removal (G.8)** and **Menu Visibility (G.7)** are independent of the above and can be sequenced whenever convenient — removing the legacy cluster carries no functional risk since it's confirmed to have zero live callers.

---

## I. Implementation Risk

| Item | Risk | Why |
|---|---|---|
| Orders write-path auth fix | **High impact if delayed, low implementation risk** | The gap is severe (any authenticated user can mutate any order) but the fix (resolve actor server-side, check permission/scope before write) is a well-understood, contained pattern already proven on Orders' own GET routes. |
| Hidden tier for Data Scope | **Medium-high** | Touches an already-LOCKED Permission Center schema/UI (`DataScope` union, `CHECK` constraint, UI control) — this is a genuine Database Design-level change, not configuration, and needs the same rigor as the original Permission Center database lock. |
| Customer Profile / Purchase History separation | **Medium** | Currently latent, not live — no immediate user-facing break — but any well-intentioned admin narrowing `customers` scope via the already-shipped Data Scope Matrix could trigger it accidentally, with no code-level guard today. |
| Sensitive Fields wiring | **Medium, broad surface area** | Touches 4 already-LOCKED modules (Products, Reports, Dashboard, Customer) each needing its own Impact Analysis; the mechanism itself (`getVisibleSensitiveFields()`) is already built and tested in isolation, so the risk is integration breadth, not the underlying design. |
| `role_data_scopes` reconfiguration | **Low technical risk, meaningful business risk if sequenced wrong** | No code change needed (admin UI already exists), but narrowing scope for real, live roles changes what real staff can see in production — needs real UAT per role per resource, exactly as `DATA_SCOPE_ROLLOUT_SPEC.md §11` already prescribes. |
| Legacy dead-code removal | **Low** | Zero live callers confirmed; safe once Product Owner explicitly confirms nothing future depends on `hasPermission()`/`ROLE_PERMISSIONS`/`RouteGuard`. |
| Client-side-enforced Data Scope (Customers/Marketing/Reports/Activity Log) bypassable via direct Supabase REST calls | **Structural, whole-schema, not fixable by this investigation's scope** | This is the same "application-layer only, permissive RLS" architecture already documented and accepted for the entire schema (`PERMISSION_DATABASE.md §18`) — closing it would be a Postgres-level RBAC redesign well beyond Permission Center's own charter, flagged here for awareness, not as an actionable item of this investigation. |

---

## J. Recommended Package Breakdown (for Product Owner sequencing — presented as options, not a decision)

Based on the dependency/risk analysis above, a plausible package split (final sequencing and scope remain the Product Owner's decision, per standing Project Rules):

- **Package A — Orders Write-Path Authorization Fix.** Standalone, highest current risk, no dependency on the rest.
- **Package B — Data Scope "Hidden" Tier + Marketing Purchase History Enforcement.** A scoped Business/Database Design pair against the already-LOCKED Permission Center schema.
- **Package C — Customer Profile / Purchase History Scope Separation.** Confirms (or structurally guarantees) that Customer Profile access can never be narrowed by the same lever as Purchase History.
- **Package D — Sensitive Fields Enforcement Rollout.** Wires `getVisibleSensitiveFields()` into Products, Reports/Dashboard, and Customer Notes — four separate Impact Analyses, could itself be split further per-module.
- **Package E — Data Scope Configuration (Owner=All/Manager=Team/Sales=Own).** No-code, admin-UI-only reconfiguration of `role_data_scopes`, sequenced after B and C.
- **Package F — Legacy System Retirement.** Delete the confirmed-dead `hasPermission()`/`ROLE_PERMISSIONS`/`RouteGuard`/`types/permission.ts` cluster.
- **Package G — Menu Visibility (Sidebar) Enforcement.** Only if still wanted — currently entirely unaddressed since the original framework-only sprint.
- **Not packaged, flagged only:** the whole-schema "application-layer-only, permissive RLS" architecture (I's last row) — a decision this large is beyond a Permission Center package and would need its own dedicated investigation if the Product Owner ever wants to revisit it.

---

Investigation only. No code written. No database changed. No business rule redesigned. No implementation performed. Stopping — waiting for Product Owner Review.
