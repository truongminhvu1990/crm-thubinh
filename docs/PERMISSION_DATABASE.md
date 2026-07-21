# Enterprise Permission Center — Database Design (Revision 2)

**Sprint:** v4.0.0 — Enterprise Permission Center only
**Module:** Permission Center (new)
**Status:** Draft — Revision 2. Product Owner issued 4 scoped Decisions (9–12) against Revision 1 before Database Lock; applied below, nothing else changed. Still awaiting Database Lock.
**Phase:** Database design only. No SQL, no migration, no repository, no service, no UI were written for this document.
**Based on:** `docs/PERMISSION_SPEC.md`, Revision 2 — **approved and LOCKED**. This document does not redesign, reinterpret, or add business logic; every table and rule below traces back to an already-approved decision or section of that spec, cited inline as (Spec §N) or (Decision N).

---

## Product Owner Decisions Applied (Revision 2)

9. **`manager_id` → `team_id`** — the Team relationship (Decision 5) is no longer a self-referencing hierarchy column. `staff.manager_id` is replaced by `staff.team_id`, a flat grouping value.
10. **`staff.role` is kept, unchanged, CHECK constraint intact.** Revision 1's plan to drop its `CHECK` is withdrawn. A new nullable `staff.role_id` FK → `roles.id` is added alongside it. Until a future migration backfills `role_id` for every staff row, resolution falls back to the legacy `staff.role` text value.
11. **Sensitive Fields no longer reuse `master_data`.** The `sensitive_field` category addition (Revision 1 §1/§4/§8) is removed. A dedicated table, `permission_sensitive_fields` (`permission_key`, `field_key`), replaces it.
12. **Team Scope is redefined**: all staff sharing the same `team_id` — explicitly **not** a management hierarchy. Revision 1's "direct reports via `manager_id`" definition (§13) is removed.

---

## 1. Database Architecture

Permission Center introduces **five new tables** — `roles`, `permissions`, `role_permissions`, `role_data_scopes`, `permission_sensitive_fields` (Decision 11) — plus two small, minimal, purely additive touches to existing schema:

- Two new nullable columns on `staff`: `team_id` (flat Team grouping, Decision 9/12) and `role_id` (FK → `roles.id`, Decision 10).
- `master_data` is **not** touched in this revision (Decision 11 removed that plan) — `staff.role`'s existing `CHECK` constraint is also **not** touched (Decision 10 withdrew that plan). This revision touches existing schema even less than Revision 1 did.

No table anywhere in this design stores resolved/cached permission results — same "compute at read time from source tables" discipline already established for Reports/Dashboard in `ORDERS_DATABASE.md` §1, §8. Architectural choices follow conventions already proven in this codebase rather than introducing new ones:

- **Every new table gets a system-generated `uuid` Primary Key**, same as `staff.id`, `roles`... (see below), matching `customers.id`/`products.id`/`orders.id`.
- **Junction/rule tables** (`role_permissions`, `role_data_scopes`, `permission_sensitive_fields`) follow the same `uuid` PK + `UNIQUE` composite-key shape already used by `marketing_segment_members` — not a composite PK, for consistency with every other table in this schema.
- **`roles` and `permissions` are genuinely new, dynamic, admin-editable data** (Decisions 2 and 3) — their cardinality and content are meant to grow/change through a future Role Management UI.
- **Sensitive Fields get their own dedicated table** (Decision 11) rather than reusing `master_data` — a direct, explicit `permission_key`↔`field_key` pairing table instead of a closed picklist plus implicit naming-convention wiring.
- **No differentiated Postgres-level role/permission enforcement.** Consistent with every existing table in this schema (`docs/P7_AUTHORIZATION_REVIEW.md`, `20260718_rls_authenticated_role.sql`), RLS here stays the existing "any authenticated staff, full access" shape — actual role/permission/data-scope enforcement is an **application-layer** concern (Permission Resolution Model, §10), resolved in Next.js server code, not Postgres RLS policies. This document does not change that architecture; it only prepares the data the application layer needs to resolve.

---

## 2. Tables

| Table | Role | New? |
|---|---|---|
| `roles` | One row per dynamic role (replaces the fixed `StaffRole` union — Decision 2). | New |
| `permissions` | One row per grantable permission, `resource.action` keyed (Decision 3). | New |
| `role_permissions` | Junction: which permissions a role holds. | New |
| `role_data_scopes` | Per role, per resource: Own / Team / All (Decision 4). | New |
| `permission_sensitive_fields` | Which permission gates which sensitive field (Decision 11). | New |
| `staff` | Existing — gains two nullable columns, `team_id` (Decision 9/12) and `role_id` (Decision 10). | Existing, minimally altered |
| `activity_logs` | Existing — reused as-is for Audit Trail (Decision 8). No change. | Existing, untouched |

---

## 3. Purpose of Each Table

### `roles`
Replaces the fixed `"Owner" | "Manager" | "Sales" | "Marketing" | "Viewer"` TypeScript union with data (Decision 2). A Role Management screen (future `PERMISSION_UI.md`) creates/renames/disables rows here without a code change or redeploy.

### `permissions`
Replaces the fixed `Permission` string-literal union (`types/permission.ts`) with data, one row per `resource.action` key (Decision 3). Existing colon-style keys (`staff:view`, `commission:approve`, ...) and dot-style keys (`marketing.manage`, ...) both become ordinary rows here — see §19 Migration Strategy for the seed mapping.

### `role_permissions`
Which permissions a role currently holds — the configurable replacement for the hardcoded `ROLE_PERMISSIONS: Record<StaffRole, Permission[]>` map in `lib/permission.ts`.

### `role_data_scopes`
Per role, per named resource (Customers, Orders, Revenue, Sales Ledger, Dashboard, Reports, Marketing, Commissions — Spec §4), which of Own/Team/All applies. A role with no row for a given resource has no defined scope for it — the application layer's default-deny behavior for that case is a Development-phase decision, not a schema one.

### `permission_sensitive_fields`
Which of the 5 Decision-6-locked sensitive fields (Cost Price, Profit, Commission, Company Revenue, Internal Notes) a given permission grants visibility into (Decision 11). Replaces Revision 1's `master_data`-category approach with an explicit, queryable pairing table.

---

## 4. Columns

### `roles`

| Column | Purpose | Type | Required | Notes |
|---|---|---|---|---|
| `id` | Primary Key | `uuid` | Required | `gen_random_uuid()`, same as every other table |
| `role_key` | Stable slug used as the plain-reference value stored on `staff.role` (see §19) | `text`, unique | Required | Lowercase, e.g. `owner`, `manager`, `sales` — same slug convention as `master_data.value` |
| `name` | Display name shown in Role Management UI | `text` | Required | e.g. "Owner" |
| `description` | Free-text explanation of the role | `text` | Optional | |
| `is_active` | Soft-disable — same pattern as `master_data.is_active` / `commission_rules.is_active` | `boolean`, default `true` | Required | A disabled role must not break display for staff still referencing it (same rule `ORDERS_DATABASE.md` §8 already established for disabled `master_data` values) |
| `created_at` / `updated_at` | Audit timestamps | `timestamptz` | Required (system-set) | |

### `permissions`

| Column | Purpose | Type | Required | Notes |
|---|---|---|---|---|
| `id` | Primary Key | `uuid` | Required | |
| `permission_key` | Full canonical key, e.g. `customers.view`, `marketing.broadcast.manage` | `text`, unique | Required | Decision 3 format |
| `resource` | Everything before the final dot (e.g. `customers`, `marketing.broadcast`) | `text` | Required | Stored separately from `permission_key` so "all permissions for resource X" doesn't need string-splitting at query time |
| `action` | The final dot segment (e.g. `view`, `manage`) | `text` | Required | |
| `description` | Free-text explanation | `text` | Optional | |
| `is_active` | Soft-disable, same pattern as `roles.is_active` | `boolean`, default `true` | Required | |
| `created_at` / `updated_at` | Audit timestamps | `timestamptz` | Required (system-set) | |

### `role_permissions`

| Column | Purpose | Type | Required | Notes |
|---|---|---|---|---|
| `id` | Primary Key | `uuid` | Required | |
| `role_id` | Which role | `uuid` → `roles.id` | Required | |
| `permission_id` | Which permission | `uuid` → `permissions.id` | Required | |
| `created_at` | Audit — when the grant was made | `timestamptz` | Required (system-set) | |

### `role_data_scopes`

| Column | Purpose | Type | Required | Notes |
|---|---|---|---|---|
| `id` | Primary Key | `uuid` | Required | |
| `role_id` | Which role | `uuid` → `roles.id` | Required | |
| `resource` | Which named resource this scope applies to (e.g. `customers`, `commissions`, `reports`) | `text` | Required | Plain text, not a FK to `permissions.resource` — a role can have a Data Scope for a resource area without that exact string existing as a `permissions` row too; the two vocabularies are related in practice but not schema-coupled |
| `scope` | Own / Team / All | `text`, `CHECK IN ('own','team','all')` | Required | Decision 4 — exactly these three values |
| `created_at` / `updated_at` | Audit timestamps | `timestamptz` | Required (system-set) | |

### `permission_sensitive_fields` *(new, Decision 11)*

| Column | Purpose | Type | Required | Notes |
|---|---|---|---|---|
| `id` | Primary Key | `uuid` | Required | |
| `permission_key` | Which permission grants visibility | `text` → `permissions.permission_key` | Required | FK on `permissions`' unique text column (§7), not `permissions.id` — named `permission_key` per Decision 11's literal field naming |
| `field_key` | Which sensitive field this permission unlocks | `text`, `CHECK IN ('cost_price','profit','commission','company_revenue','internal_notes')` | Required | Decision 6's exact 5-value list, enforced at the database level (stronger than Revision 1's `master_data`-picklist approach) |
| `created_at` | Audit timestamp | `timestamptz` | Required (system-set) | |

### `staff` (existing table, two additions)

| Column | Purpose | Type | Required | Notes |
|---|---|---|---|---|
| `team_id` *(new, Decision 9)* | Flat team grouping — "my team" = every staff row sharing this value (Decision 12) | `text`, nullable | Optional | Plain grouping value, not a Foreign Key — no `teams` table was authorized, so this stays an ungoverned flat identifier, same "plain value, app-validated" shape already used for `products.source`/`salesperson` rather than a formal relationship. Replaces Revision 1's `manager_id` self-reference entirely — no hierarchy. |
| `role_id` *(new, Decision 10)* | Forward-looking pointer to the dynamic role model, alongside the untouched legacy `role` column | `uuid` → `roles.id`, nullable | Optional | `ON DELETE SET NULL`. `staff.role` (existing `text`, `CHECK`-constrained) is explicitly **kept as-is** — Decision 10 withdraws Revision 1's plan to alter it. Resolution order: use `role_id` if set, else fall back to legacy `role` text, until a future migration backfills every staff row and this fallback is retired (§20). |

---

## 5. Primary Keys

Every new table gets its own system-generated `uuid` Primary Key, same generation pattern as every existing table (`customers.id`, `staff.id`, `activity_logs.id`):

- `roles` — `id`
- `permissions` — `id`
- `role_permissions` — `id`
- `role_data_scopes` — `id`
- `permission_sensitive_fields` — `id`

No table uses a composite Primary Key — uniqueness for the two junction/rule tables is expressed as a separate `UNIQUE` constraint (§7), matching the `orders`/`order_items` precedent (`ORDERS_DATABASE.md` §6: business-facing uniqueness kept separate from the internal identifier).

---

## 6. Foreign Keys

| From | To | Business Meaning | On Delete |
|---|---|---|---|
| `role_permissions.role_id` | `roles.id` | Which role holds this permission | `CASCADE` — a grant row has no independent meaning once its role is gone |
| `role_permissions.permission_id` | `permissions.id` | Which permission is held | `CASCADE` — same reasoning |
| `role_data_scopes.role_id` | `roles.id` | Which role this scope rule belongs to | `CASCADE` — same reasoning |
| `permission_sensitive_fields.permission_key` | `permissions.permission_key` | Which permission grants visibility into a sensitive field | `CASCADE` — a pairing row has no independent meaning once its permission is gone |
| `staff.role_id` | `roles.id` | Forward-looking dynamic-role pointer (Decision 10) | `SET NULL` — same convention as every other `*_id` column added to `staff`/`customers` (`20260722_staff_management_module.sql`) |

**`staff.team_id` is a plain grouping value, not a Foreign Key** — no `teams` table exists or was authorized (Decision 9/12 only asked for the grouping column itself); staff rows are "on the same team" purely by matching `team_id` values, same plain-value convention used for `products.source`/`salesperson`.

**`staff.role` is untouched** (Decision 10) — still `text`, still `CHECK`-constrained to the legacy 5-value list, still no Foreign Key. It remains the fallback read path until `role_id` is backfilled (§19, §20).

**A `roles` row that is still referenced by any `staff.role_id` must not be hard-deletable** — same "disabled, not deleted" business constraint already established for `master_data` (`ORDERS_DATABASE.md` §8, §13: "a disabled Master Data item must not affect historical display... must never be deleted"), now enforced structurally in one respect: `role_id`'s `SET NULL` on delete means a hard-deleted role at least can't leave a dangling reference — but disabling (`is_active = false`) rather than deleting remains the expected operational path, same as every other soft-disable field in this schema.

---

## 7. Unique Constraints

| Table | Constraint | Business Meaning |
|---|---|---|
| `roles` | `UNIQUE (role_key)` | No two roles can share the same slug — the value `staff.role` resolves against. |
| `permissions` | `UNIQUE (permission_key)` | No two permissions can share the same canonical key. |
| `role_permissions` | `UNIQUE (role_id, permission_id)` | A role can hold a given permission at most once — no duplicate grants. |
| `role_data_scopes` | `UNIQUE (role_id, resource)` | A role has at most one Data Scope rule per resource — never two conflicting scopes for the same resource. |
| `permission_sensitive_fields` | `UNIQUE (permission_key, field_key)` | The same permission can't be paired with the same sensitive field twice. |

---

## 8. Check Constraints

| Table | Constraint | Business Meaning |
|---|---|---|
| `role_data_scopes.scope` | `CHECK (scope IN ('own', 'team', 'all'))` | Decision 4 — exactly these three values, no other tier. |
| `permission_sensitive_fields.field_key` | `CHECK (field_key IN ('cost_price', 'profit', 'commission', 'company_revenue', 'internal_notes'))` | Decision 6's exact 5-field list, enforced at the database level (Decision 11's dedicated-table approach makes this a real `CHECK` instead of Revision 1's `master_data`-category convention). |
| `permissions.permission_key = resource || '.' || action` | Not database-enforced (would need a generated column or trigger, introducing new machinery this schema doesn't otherwise use) — an **application-layer invariant**: every write path that creates a `permissions` row must derive `permission_key` from `resource`+`action`, never let them drift independently. Flagged the same way `ORDERS_DATABASE.md` §8 flags "Payment Status must always be system-derived... never directly settable" as an application-enforced rule. |

No other `CHECK` constraints are introduced — Decision 7 ("do not modify any frozen business rule") means no new validation logic beyond what the Decisions themselves specify.

---

## 9. Relationship Diagram (text)

```
staff (existing)
   │  team_id: text (new, Decision 9) — flat grouping, no FK, no teams table
   │  role_id: uuid → roles.id (new, Decision 10, nullable, SET NULL)
   │  role:    text, CHECK-constrained (existing, untouched — legacy fallback)
   ▼
 roles ─────────────┐
   │ 1               │ 1
   │ many             │ many
   ▼                 ▼
role_data_scopes   role_permissions ────────▶ permissions ◀──── permission_sensitive_fields
   │                    │ many         many        │ 1                │ many
   │ resource: text     │                           └───────────────────┘
   │ scope: own/team/all│                             permission_key (FK, CASCADE)
                        │                             field_key (CHECK: 5 values)
activity_logs (existing) ◀── written to by every Role/Permission/
                              Data Scope change (Decision 8, §16)
                              entity ∈ {'role','permission',
                              'role_permission','role_data_scope'}
```

- **One Role → many `role_permissions` → many Permissions** (many-to-many, via the junction).
- **One Role → many `role_data_scopes`, at most one per resource** (enforced by `UNIQUE (role_id, resource)`, §7).
- **One Permission → many `permission_sensitive_fields` rows**, each pairing it with one of the 5 fixed `field_key` values (§7 `UNIQUE (permission_key, field_key)` stops duplicates).
- **`staff.role_id`** is a real Foreign Key to `roles.id`, nullable, alongside the untouched legacy `staff.role` text column (§6, §20 — fallback resolution order).
- **`staff.team_id`** is a plain grouping value with no Foreign Key and no backing `teams` table — "same team" is pure value equality (Decision 12).
- **`master_data` is entirely untouched by this design** (Decision 11 removed that plan) — no relationship to Permission Center at all.
- **`activity_logs`** has no new column and no new Foreign Key — it already accepts arbitrary `entity`/`entity_id` text (§16).

---

## 10. Permission Resolution Model

The runtime algorithm every future enforcement point (RouteGuard, an API route, a service function) will use to answer "can this signed-in staff member do X":

1. Resolve the signed-in staff row (`getCurrentStaff()`, existing, unchanged).
2. Resolve the role: if `staff.role_id` is set, use it directly; otherwise fall back to matching legacy `staff.role` (text) against `roles.role_key` (Decision 10). Either path lands on one `roles` row, filtered to `is_active = true`. No match ⇒ no permissions (same "null role ⇒ false" behavior `hasPermission()` already implements today).
3. Join `roles.id → role_permissions.role_id → permissions.id` to get the full set of `permission_key` values the role currently holds (`permissions.is_active = true` only).
4. A specific check (e.g. "can view Customers") is membership of the requested `permission_key` in that set — the direct, data-backed replacement for today's `ROLE_PERMISSIONS[role].includes(permission)`.

This is a 3-table join per check. §17 Performance Strategy addresses not re-running it on every single UI decision.

---

## 11. Role Model

`roles` is the single source of truth for what a role *is* (Decision 2) — `role_key` (stable identifier), `name` (display), `is_active` (soft-disable). Nothing about *what a role can do* lives on this table itself; that's entirely expressed by which `role_permissions`/`role_data_scopes` rows reference it. This separation (identity vs. grants, in different tables) is what makes roles genuinely configurable — renaming a role's `name` or disabling it never requires touching its grants, and vice versa.

The join point to `staff` is now two columns, resolved in fallback order (Decision 10): prefer `staff.role_id` (a real FK to `roles.id`) when set; otherwise fall back to the legacy `staff.role` text value matched against `roles.role_key`. `staff.role` itself is unchanged — still `text`, still `CHECK`-constrained to the 5 legacy values — so this is purely additive, not a replacement, until a future migration backfills `role_id` everywhere and the fallback is retired.

---

## 12. Permission Model

`permissions` is the single source of truth for what actions *exist* (Decision 3) — `resource.action`-keyed, with `resource`/`action` also stored as separate columns for filtering (e.g., "show every permission for the `customers` resource" in a future Role Management matrix UI). A permission's existence is independent of any role holding it — creating a new `permissions` row (e.g., seeding `customers.delete` later) doesn't grant it to anyone until a `role_permissions` row is also created.

Sensitive Fields (Decision 6, §14 below) are **not** a separate mechanism — a field-level gate (e.g., "can this role see Cost Price") is expressed as an ordinary permission (e.g. a `products.view_cost_price`-shaped `permission_key`, exact naming left to Development seed data), resolved through the exact same §10 algorithm as any other permission check. This reuses the framework instead of building a second one, per the brief's own "reuse the existing Permission Framework" instruction (Spec §2).

---

## 13. Data Scope Model

`role_data_scopes` answers "how much of resource X can this role see," independent of whether they can see the resource *at all* (that's §10/§12 — a role needs the relevant `permissions.view`-type grant before Data Scope is even consulted). For a given `(role, resource)`:

- **Own** — filter to rows where the resource's ownership field equals the signed-in staff member's `id`. Every currently-existing named entity already has one, so no new ownership field is needed for anything that exists today:
  - Customers → `customers.assigned_staff_id` (existing)
  - Purchases/Revenue → `customer_purchases.salesperson_id` (existing)
  - Commissions → `sales_commissions.salesperson_id` (existing)
  - Marketing (Segments) → `marketing_segments.created_by` (existing)
  - Marketing (Campaigns) → `marketing_campaigns.owner_staff_id` (existing)
  - Orders → not yet built; its ownership field is Orders' own future database design's responsibility, not this document's (Orders is BLOCKED — [[orders-spec-revision-history]]).
  - Dashboard / Reports / Sales Ledger → these are aggregate *views* over the entities above, not independent tables with their own ownership field — their Own-scope filter is inherited from whichever underlying entity (Purchases, Commissions, ...) each specific card/query reads from.
- **Team** — filter to rows owned by any staff member sharing the signed-in staff member's `team_id` (Decision 12) — a flat group-equality check, **not** a management hierarchy. If the signed-in staff member's `team_id` is `NULL`, they have no teammates by definition (equality against `NULL` matches nothing) — Own-only is the effective floor for an ungrouped staff member, a natural consequence of the flat model rather than a separately invented rule.
- **All** — no filter.

None of this filtering logic is implemented by this document (Decision 1 excludes retrofitting other modules' queries into v4.0.0) — it's the target-state rule any future per-module enforcement sprint implements against, exactly as `PERMISSION_SPEC.md` §4/§7 already framed it.

---

## 14. Field Visibility Model

A sensitive field is hidden by gating it behind an ordinary `permissions` row (§12), checked through the same §10 resolution algorithm before a service function includes that field/derived value in its response. `permission_sensitive_fields` (Decision 11) is the explicit registry mapping which `permission_key` unlocks which `field_key` — a direct pairing table, not an inference from naming convention, and not a `master_data` picklist (Revision 1's approach, withdrawn). "Which fields is this role allowed to see" is then: resolve the role's granted permissions (§10) → join against `permission_sensitive_fields.permission_key` → the resulting `field_key` set.

Two of the five (Profit, Company Revenue) are derived values with no backing column (§4) — for those, "hiding the field" means the aggregation function itself omits/zeroes the computation for a caller lacking the permission, not a column-level mask, since there is no column to mask.

---

## 15. Menu Visibility Model

No new table. `components/Sidebar.tsx`'s existing per-link config (today just `enabled: boolean`) gains a second, code-level property identifying the `permission_key` each link requires — resolved through the exact same §10 algorithm as any other check, at render time (hide) and, per Spec §6's "no client-side only checks" requirement, again server-side by whatever route the link points to. This is a code-layer mapping (link → `permission_key` string), not a database table, since Sidebar's link list is already static, code-defined data today (Spec §6) — Decision 1 doesn't ask for a dynamic, database-driven navigation tree, only permission-aware gating of the existing one.

---

## 16. Audit Integration

No new table — `activity_logs` (existing, untouched schema) is reused exactly as `ORDERS_DATABASE.md` and every other module's activity logging already does. Decision 8 broadens the requirement to *every* Role/Permission/Data Scope change:

| Change | `entity` | `entity_id` |
|---|---|---|
| Role created/updated/disabled | `role` | `roles.id` |
| Permission created/updated/disabled | `permission` | `permissions.id` |
| Permission granted/revoked from a role | `role_permission` | `role_permissions.id` |
| Data Scope set/changed for a role | `role_data_scope` | `role_data_scopes.id` |

`activity_logs.action` free-text carries the specific verb (e.g. `"role_created"`, `"permission_granted"`), matching the existing convention — no schema change needed for logging.

---

## 17. Performance Strategy

(No SQL — the access patterns this data model must serve quickly.)

| Access pattern | Why it needs to be fast | Index target |
|---|---|---|
| Resolve a role's full permission set (§10, step 3) | Runs on every permission check, potentially every page/route | `role_permissions` — `role_id` |
| Resolve which roles hold a given permission (Role Management "who can do X" view) | Admin UI, less frequent but still real | `role_permissions` — `permission_id` |
| Look up a role by its `role_key` (§10, step 2) | Every request that resolves the signed-in staff member's permissions | `roles` — `role_key` (already unique, §7) |
| Look up a permission by its `permission_key` | Every individual `hasPermission()`-style check | `permissions` — `permission_key` (already unique, §7) |
| Resolve a role's Data Scope for one resource | Every Data-Scope-gated query, once module enforcement rolls out | `role_data_scopes` — `(role_id, resource)` (already unique, §7 — the unique index itself serves this lookup) |
| Resolve every staff member on the same team (Team scope) | Any Team-scoped query | `staff` — `team_id` |
| Resolve a permission's sensitive-field grants (§14) | Any Field-Visibility check | `permission_sensitive_fields` — `permission_key` |

**Caching recommendation (design-level, not schema):** because §10's resolution is a join run on every check, Development should resolve a signed-in staff member's full permission set + Data Scopes **once** per session/request context (e.g., alongside `getCurrentStaff()`) and reuse it, rather than re-querying per individual `hasPermission()`-style call — the same shape of optimization already implicit in how `RouteGuard` calls `getCurrentStaff()` once today. This is a recommendation for the Development phase, not a schema element.

---

## 18. RLS Strategy

Same "Allow full access to anon + authenticated" shape already locked for every table in this schema (`20260718_rls_authenticated_role.sql`, `ORDERS_DATABASE.md` and every module since) — applied identically to `roles`, `permissions`, `role_permissions`, `role_data_scopes`, `permission_sensitive_fields`. This is a deliberate continuity choice, not an oversight: this codebase has never used Postgres-level, per-role RLS differentiation anywhere, even for existing sensitive data (Cost Price, Commission amounts) — access control is uniformly an **application-layer** concern (RouteGuard, service-layer checks), and Permission Center's own tables are no exception. Building real Postgres-level RBAC here would be a new architectural pattern this sprint wasn't asked to introduce (Decision 1 scopes this sprint to the Permission Center's data model, not a Postgres security redesign).

**Residual risk, same category `ORDERS_DATABASE.md` §13 already flags for its own application-enforced rules:** because RLS stays permissive, nothing at the database level stops a bug or a bypassed check from writing/reading `roles`/`permissions`/`role_permissions`/`role_data_scopes`/`permission_sensitive_fields` outside the intended Permission Resolution Model. This is an accepted, pre-existing trade-off across the whole schema, not new to Permission Center — worth naming here because this module's entire purpose is access control, so the gap is more noticeable than usual.

---

## 19. Migration Strategy

(No SQL — the sequence and seed-data intent a future migration must implement.)

1. **Create the five new tables** (`roles`, `permissions`, `role_permissions`, `role_data_scopes`, `permission_sensitive_fields`) — purely additive.
2. **Add `staff.team_id`** (Decision 9) and **`staff.role_id`** (Decision 10) — both nullable, no backfill required, default to `NULL` for every existing staff row (meaning "not grouped into a team yet" / "not migrated to a dynamic role yet").
3. **Seed `roles`** with the 5 current `StaffRole` values (`owner`, `manager`, `sales`, `marketing`, `viewer` as `role_key`, matching display names) — this table exists and is populated from day one, but no `staff.role_id` is backfilled yet (step 6).
4. **Seed `permissions`** from today's `types/permission.ts` literals, renamed to Decision 3's dot standard: `staff:view`→`staff.view`, `staff:manage`→`staff.manage`, `customers:manage`→`customers.manage`, `commission:approve`→`commission.approve`, `settings:manage`→`settings.manage`, plus the 5 already-dot-style Marketing keys carried over unchanged. **1:1 rename, not a re-scoping** — same reasoning as Revision 1.
5. **Seed `role_permissions`** by replaying today's hardcoded `ROLE_PERMISSIONS` map exactly, using the renamed keys from step 4 — so cutover changes zero observable behavior.
6. **Seed `role_data_scopes`** — every existing role gets `scope = 'all'` for every named resource, matching today's fully-open behavior (Spec §1) — no narrower default is authorized by Decision 1.
7. **Seed `permission_sensitive_fields`** — which existing/renamed permission(s) unlock which of the 5 `field_key` values is a genuine content decision (e.g., does `products.manage` unlock `cost_price` and `profit`? does `commission.approve` unlock `commission`?) not specified by Decisions 9–12 — left for Development-phase seed data, same class of deferral as the action-taxonomy question in step 4.
8. **`staff.role`'s `CHECK` constraint and existing values are left completely untouched** (Decision 10 withdraws Revision 1's step 8) — `role_id` is added purely alongside it, backfilled in a later, separate migration once Role Management exists to manage the mapping; only then does application code stop falling back to legacy `role` (§20).

No step above deletes or destructively alters any existing row's data. This revision touches existing schema strictly less than Revision 1 did — no `CHECK` constraint anywhere is altered, and `master_data` is untouched.

---

## 20. Backward Compatibility

- **Zero behavior change on cutover.** Steps 4–7 above are specifically sequenced so that, immediately after migration, every existing role continues to have exactly the permissions and (permissive, `all`-scope) access it has today — nothing regresses, nothing tightens, until Development explicitly starts reading from the new tables and a later sprint starts enforcing Data Scope module-by-module (Decision 1).
- **`lib/permission.ts`'s `hasPermission()`/`ROLE_PERMISSIONS` and `types/permission.ts`'s `Permission` union are not touched by this document** — they keep working exactly as today until a Development-phase task explicitly migrates them to read from `roles`/`permissions`/`role_permissions` instead. This document only prepares the schema; wiring application code to it is out of scope here (per the task's own "do not write repository/service" instruction).
- **No other module's query, page, or write path changes.** Per Decision 1, Customer/Orders/Reports/Dashboard/Marketing/Commission/Inventory/Sales Ledger/Data Verification are entirely unaffected by this migration.
- **`staff.role`'s stored values and `CHECK` constraint are completely unchanged** (Decision 10) — the legacy column keeps working exactly as it does today, permanently, until a future migration backfills `role_id` for every staff row and a separate future decision retires the fallback. This is a stronger backward-compatibility guarantee than Revision 1's plan.

---

## Self Review (Revision 2)

- **Revision 1's two flagged items are both resolved by this revision, not carried forward:** Decision 10 withdraws the `staff.role` `CHECK`-drop entirely (kept fully untouched; `role_id` added alongside instead), and Decision 12 replaces the single-level "direct reports" judgment call with an explicit, unambiguous flat-grouping rule. Neither is a residual open question anymore.
- **`staff.team_id` and `staff.role_id` are still two genuinely new Staff columns** — narrower in risk than Revision 1's approach (no constraint altered, no rename, purely additive nullable columns), but still a touch to the Staff table the locked `PERMISSION_SPEC.md`'s Explicitly Out of Scope line named. Decisions 9 and 10 read as direct, explicit authorization for exactly these two columns.
- **`staff.team_id` has no backing `teams` table**, so nothing stops two unrelated staff members from colliding on the same free-text value by typo, and nothing enumerates "which teams exist" for a future admin UI. Decisions 9/12 asked only for the grouping column and the equality rule, not a `teams` table — not added, to honor "do not change anything else," but noted as a real gap if a Team Management screen is ever wanted.
- **Which permissions unlock which sensitive fields (`permission_sensitive_fields` content) is not decided here** — Decision 11 fixed the table shape, not its rows; left for Development-phase seed data (§19 step 7), same deferral category as the permission-taxonomy question already carried from Revision 1.
- **No new business rule was introduced.** Every change traces directly to Decisions 9–12; nothing else in the Revision 1 design (roles/permissions/role_permissions/role_data_scopes shape, resolution algorithm, RLS approach, migration sequencing) was altered, per the explicit "do not change anything else" instruction.

---

## Ready For Database Lock

**Yes.** Both items Revision 1 flagged for confirmation are now resolved by Decisions 9–12: `staff.role` is fully preserved (no constraint change), and Team Scope has an explicit, unambiguous definition (shared `team_id`, no hierarchy). No open item remains blocking Lock.
