# Enterprise Permission Center — UI Design Spec

**Sprint:** v4.0.0 — Enterprise Permission Center only
**Module:** Permission Center (new)
**Status:** Draft — Revision 2. Product Owner issued 4 scoped Decisions (13–16) against Revision 1; applied below, nothing else changed. Awaiting Product Owner Review.
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level business description only.
**Based on:** `docs/PERMISSION_SPEC.md` (Revision 2, **LOCKED**) and `docs/PERMISSION_DATABASE.md` (Revision 2, **LOCKED**). This document does not redesign, reinterpret, or add business logic, and does not add, rename, or restructure any table/column from the locked Database Design. Every screen, field, and control below maps to a table/column already defined there, cited inline as (DB §N) or (Spec §N). Where this document reuses an existing screen pattern (settings card-link, list+detail, filter bar, activity feed, modal), it points at the equivalent already-shipped screen in this codebase rather than inventing a new one.

## Design Principles

1. **Extends Settings, doesn't replace it.** Permission Center lives under `/settings`, as a sibling to the existing "Nhân viên" (Staff) card — same card-link pattern, same List→Detail structure already proven by `app/settings/staff/`.
2. **One source of truth per fact, no duplicate editors.** `permission_sensitive_fields` (DB §4) is edited in exactly one place (§6); Role Detail's own display of "what this role can see" is read-only and derived, not a second editable copy of the same data.
3. **Nothing invents new schema.** Every dropdown option, table column, and toggle below reads from or writes to a table/column already locked in `PERMISSION_DATABASE.md` — no field, table, or business rule is introduced here.
4. **The legacy/dynamic role fallback (DB §10, §11, §20) is visible, not hidden.** A staff member with `role_id = NULL` still functions today (via legacy `staff.role`) — the UI surfaces this as a visible migration state, not silently.
5. **Consistency over novelty.** Reuses `Card`, `Button`, `Input`/`SearchInput`, `Badge`, `Modal`, `AlertDialog`, `StatCard`, `Avatar`, `InfoItem`, and the existing table-card layout already used by Staff/Customer/Product — no new UI primitive is introduced anywhere in this design (unlike Inventory's Drawer, which this design deliberately avoids needing).

---

## Product Owner Decisions Applied (Revision 2)

13. **Team assignment is closed-list only.** The Team field on Staff Detail/`StaffModal` (§8) no longer accepts typed free text — staff must pick from the existing Team list. New teams can only be introduced via Team Management's (§7) "Create Team" action; "Rename Team" and "Assign Team" (§7, §8) continue to operate on that same closed list.
14. **"Clone Permission" added to Role Detail** (§3) — a new action that copies one role's `role_permissions` grants onto another role (new or existing).
15. **"Data Scope Matrix" added** — a new, read-only, cross-role Data Scope view (§5), directly resolving Revision 1's Open Question #1.
16. **"Permission Dashboard" added** (§18, new) — a KPI overview: Total Roles, Total Permissions, Assigned Users, Total Teams, Permission Changes (30 days). Becomes the landing view when entering Phân quyền.

---

## 1. Navigation

**Entry point:** a new card-link on `/settings` (Settings landing page), directly below the existing "Nhân viên" card, same visual treatment (icon chip + title + subtitle + chevron, `ShieldCheck` icon — already imported in `Sidebar.tsx` for the unrelated "Xác minh dữ liệu" entry, reused here since it's the closest existing icon match for access-control):

```
Cài đặt (/settings)
├── Nhân viên (existing, unchanged)
└── Phân quyền  (new)
     ├── Permission Dashboard   /settings/permissions            (default landing tab)
     ├── Role List              /settings/permissions/roles
     │    └── Role Detail       /settings/permissions/roles/[id]
     │         ├── tab: Quyền (this role's grants)
     │         └── tab: Phạm vi dữ liệu (Data Scope)
     ├── Permission Matrix      /settings/permissions/matrix
     ├── Data Scope Matrix      /settings/permissions/data-scope-matrix   (read-only)
     ├── Sensitive Field Config /settings/permissions/sensitive-fields
     ├── Team Management        /settings/permissions/teams
     └── Audit History          /settings/permissions/audit
```

- No new Sidebar entry — Permission Center is reached exclusively through Settings, same as Staff Management today (Staff has no direct Sidebar entry either).
- Within `/settings/permissions`, a secondary in-page tab strip (same pattern as Inventory List/Batch View's in-page toggle, `INVENTORY_UI.md` §2, and matching Marketing's existing "Dashboard first" tab convention, `Sidebar.tsx`'s Marketing group) switches between **Tổng quan** (Permission Dashboard, §18 — default), **Vai trò** (Role List), **Ma trận quyền** (Permission Matrix), **Ma trận phạm vi** (Data Scope Matrix, §5), **Trường nhạy cảm** (Sensitive Fields), **Nhóm** (Teams), and **Lịch sử** (Audit History) — seven sibling views at the same level, not a drill-down hierarchy. Role List's route moves from `/settings/permissions` to `/settings/permissions/roles` to make room for the Dashboard as the section's landing page — the only route change in this revision, made necessary by Decision 16.
- **User Role Assignment (§8) has no dedicated route** — it extends the existing Staff Detail/Edit screens (`app/settings/staff/[id]`, `StaffModal`) in place, so assigning a role/team to a staff member happens where staff are already managed, not a duplicate screen.
- Breadcrumb: Settings → Phân quyền → [current tab] → Role Detail (when applicable) — same shallow depth as Staff (Settings → Nhân viên → Staff Detail).
- **User Role Assignment (§8)'s Team field is now closed-list only** (Decision 13) — no free-text entry anywhere in Permission Center; every place a team is chosen (Team Management's Assign action, §7; Staff Detail's Team field, §8) selects from the same list of teams already known to exist.

---

## 2. Role List

Route: `/settings/permissions/roles` (moved off the bare `/settings/permissions` root to make room for the Permission Dashboard, §18, Decision 16). Same table-card layout as `StaffTable.tsx`.

**Columns:** Name (`roles.name`), Key (`roles.role_key`, shown as monospace secondary text under Name — mirrors how `products.product_code` renders under `product_name` in `ProductTable.tsx`), Description, Permission Count (count of `role_permissions` rows for this role), Status badge (Active/Disabled from `roles.is_active`, same `Badge` variant convention as `STAFF_STATUS_BADGE_VARIANT`), row actions (Edit → opens Role Detail; Disable/Enable toggle, same `Power` icon pattern already used in `app/settings/page.tsx`'s master-data rows).

**"Add Role" button** (top-right, same placement as Staff List's "Add Staff"): opens a small modal (reusing `Modal`, same shape as `StaffModal`) with just `name`, `role_key` (auto-slugified from `name`, editable), `description` — the minimum `roles` columns (DB §4). Creating a role does **not** grant any permission or Data Scope automatically — a brand-new role starts with zero `role_permissions`/`role_data_scopes` rows, and Role Detail's empty states (§13) make that explicit rather than silently defaulting to anything.

**Disabling a role** (soft-disable, `is_active = false`, DB §4) shows a confirmation (`AlertDialog`, same pattern as Staff/Product delete confirmations) warning if any `staff.role_id` currently points at it — disabling doesn't clear that reference (DB §6: "disabled, not deleted"), so the warning names how many staff are affected, without blocking the action.

---

## 3. Role Detail

Route: `/settings/permissions/roles/[id]`. Same header pattern as Staff Detail (`Avatar`-less here since roles have no photo; back arrow, name as `h1`, Status badge, Edit button opening the same modal as "Add Role", and a new **"Clone Permission"** button, Decision 14, described in §3.3 below).

Two tabs beneath the header:

### 3.1 Tab: Quyền (this role's grants)
A read/edit checklist grouped by `permissions.resource` (DB §4) — one collapsible group per resource (e.g. "Customers", "Marketing → Broadcast"), each row a permission with its `action` and a checkbox reflecting membership in `role_permissions` (DB §10 step 3). Checking/unchecking writes one `role_permissions` insert/delete immediately (same "commit on toggle" pattern `app/settings/page.tsx`'s master-data Active toggle already uses) rather than a separate Save step — keeps this tab a simple, single-role view; bulk cross-role editing lives in the Permission Matrix (§4, §12) instead.

### 3.2 Tab: Phạm vi dữ liệu (Data Scope)
One row per named resource (Customers, Orders, Revenue, Sales Ledger, Dashboard, Reports, Marketing, Commissions — Spec §4), each a 3-way segmented control: **Của tôi** (Own) / **Nhóm** (Team) / **Tất cả** (All), reading/writing `role_data_scopes.scope` (DB §4, §13). A resource with no existing `role_data_scopes` row shows no option pre-selected (none of the three segments active) rather than defaulting visually to one — matching DB §13's "no row ⇒ no defined scope" statement; selecting any option creates the row.

Orders is listed but shown disabled/grayed with a tooltip ("Orders chưa triển khai") — Orders has no ownership field yet (DB §13) and is BLOCKED project-wide — the row exists so the resource list matches Spec §4 exactly, but nothing can be set for it yet.

### 3.3 Clone Permission (Decision 14)

A header-level action button opening a small modal with two choices for the **target**:
- **New role** — name + `role_key` fields (same minimal form as "Add Role," §2), creating a brand-new `roles` row.
- **Existing role** — a dropdown of every other active role.

On confirm, every `role_permissions` row this (source) role currently holds is copied to the target — inserted for the target role, skipping any permission the target already has (no duplicate-grant errors, same `UNIQUE (role_id, permission_id)` constraint, DB §7, that already governs §3.1/§4). **Scope is deliberately narrow, matching the action's literal name:** only `role_permissions` (the permission grants) are cloned — `role_data_scopes` (Data Scope, §3.2/§5) and any `permission_sensitive_fields` implications (§6, which are derived from permissions, not stored per role, so they simply follow along automatically once the underlying permissions are cloned) are **not** separately copied or reset. If the target is an existing role, its current Data Scope settings are left exactly as they were before the clone.

This is logged to Audit History (§9) as a distinct action per resulting grant (or one summarizing entry naming the source/target pair and count — exact granularity is a Development-phase logging-format decision, not designed here), consistent with Decision 8's "every Role/Permission change" requirement.

---

## 4. Permission Matrix

Route: `/settings/permissions/matrix`. A dedicated bulk-editing grid, distinct from §3.1's single-role checklist — Roles as columns, Permissions as rows (grouped by `resource`, same grouping as §3.1), each cell a toggle reflecting `role_permissions` membership for that (role, permission) pair.

- First column (Permission) is sticky on horizontal scroll (§14).
- A resource group header row can bulk-toggle an entire row-group for one role (e.g., "grant every `marketing.*` permission to Manager") — see §12.
- Changes here write to the exact same `role_permissions` table §3.1 reads/writes — there is no separate "matrix data," only a different editing surface over the same rows, so a change made here is immediately visible on the corresponding Role Detail tab and vice versa.
- Disabled roles/permissions (`is_active = false`) still appear, visually muted, with their existing grants visible but their toggles disabled — consistent with DB §4's "disabled, not deleted" rule: existing grants involving a disabled row aren't hidden, just frozen from further editing until re-enabled.

---

## 5. Data Scope Configuration

The editable control is §3.2's per-role tab: **exactly Own / Team / All per (role, resource)** (Decision 4, DB §4/§13), no other tier, no free-text option. Editing still happens only there — one editor, same "no duplicate editors" principle as Sensitive Field Config (§6).

### 5.1 Data Scope Matrix (Decision 15, new, read-only)

Route: `/settings/permissions/data-scope-matrix`. Resolves Revision 1's Open Question #1. Same visual shape as the Permission Matrix (§4) — Roles as columns, the 8 named resources as rows (DB §13: Customers, Orders, Revenue, Sales Ledger, Dashboard, Reports, Marketing, Commissions) — but every cell is a **read-only badge** showing the resolved scope (Own/Team/All, or a muted dash for "not configured"), not a toggle. No control on this screen writes anything — it exists purely so an admin can answer "which roles currently see All Commissions" (or any other cross-role scope question) at a glance, without opening each Role Detail individually. Clicking a cell deep-links to that role's Data Scope tab (§3.2) if a change is actually needed — the matrix itself never mutates `role_data_scopes`.

---

## 6. Sensitive Field Configuration

Route: `/settings/permissions/sensitive-fields`. **Not** a per-role screen — this edits `permission_sensitive_fields` itself (DB §4, §14), the global mapping of which permission unlocks which of the 5 locked fields (Decision 6): Cost Price, Profit, Commission, Company Revenue, Internal Notes.

Layout: one card per field (fixed list of exactly 5, matching `field_key`'s `CHECK` constraint — no "add field" control exists, since the set is locked and none can be added from the UI), each showing:
- The field's label and which module it appears in (informational text, not stored — e.g. "Cost Price — Sản phẩm, Tồn kho").
- A multi-select of `permissions` currently paired to it via `permission_sensitive_fields` (search-as-you-type over `permissions.permission_key`, same `SearchInput` debounce pattern used elsewhere) — adding/removing an entry writes/deletes a `permission_sensitive_fields` row.

**Role Detail (§3) shows a read-only summary, not a second editor:** a "Trường nhạy cảm có thể xem" line listing which of the 5 fields this role's currently-granted permissions unlock (computed: role's `role_permissions` ∩ `permission_sensitive_fields.permission_key` → resulting `field_key` set) — changing it means going to this screen and re-pairing permissions, or going to §3.1/§4 and changing which permissions the role holds; never both places independently.

---

## 7. Team Management

Route: `/settings/permissions/teams`. `staff.team_id` (DB §4) is a **plain text grouping value with no backing table** (DB Self Review, explicitly flagged as a gap) — this screen works within that constraint rather than pretending a `teams` table exists:

- Lists every **distinct, non-null `team_id`** currently in use, each as a card showing the team name (the `team_id` value itself, since there's no separate display-name column) and its member count, expandable to the member list (staff avatar + name).
- **"Create Team"** — the **only** place a new team name can be entered as free text (Decision 13). That string becomes a `team_id` value; it isn't inserted anywhere as a registry row (there's nothing to insert it into — DB §4/§13, no `teams` table). This screen's distinct-values list is now the **authoritative closed list** every other picker in Permission Center (§8) draws from, not just an autocomplete convenience as in Revision 1 — since Decision 13 removes the ability to introduce a team any other way.
- **"Rename Team"** on a team card is a **bulk `UPDATE`**: every staff row currently holding the old `team_id` value gets rewritten to the new one in one action — flagged explicitly in the UI (a confirmation step naming how many staff are affected). A typo during **Create** can still produce a near-duplicate team name (the DB Self Review's flagged gap isn't closed at the schema level, DB §4/§13), but Decision 13 does close the same risk at every *assignment* point — a staff member can no longer typo their way into a stray team while being assigned one.
- **"Assign Team"** (Decision 13's third named action) — multi-select staff (checkboxes on the member list) → pick a target team from the same closed list (a dropdown of existing team cards, never a text field) → "Assign to team" / "Remove from team". Available here **or** from an individual Staff Detail page (§8) — same underlying `staff.team_id` write and the same closed-list constraint at both entry points, never free text at either.
- Staff with `team_id = NULL` are listed in a separate "Chưa có nhóm" (Unassigned) section at the bottom, not hidden.

---

## 8. User Role Assignment

**No new screen.** Extends the existing Staff Detail (`app/settings/staff/[id]`) and its edit modal (`StaffModal`, reused via `components/staff/StaffModal.tsx`) with two additional fields, alongside the existing Staff fields:

- **Vai trò (Role)** — a dropdown sourced from `roles` where `is_active = true`, writing `staff.role_id` (DB §4, §10). Legacy `staff.role` remains visible nearby as read-only text ("Vai trò cũ: Sales") whenever `role_id` is `NULL`, so it's clear which resolution path (§10) currently applies to this staff member — this label disappears once `role_id` is set, since the fallback is no longer consulted for them (DB §10 step 2).
- **Nhóm (Team)** — a **closed-list dropdown/searchable-select** (Decision 13): choose from §7's distinct-values list only, writing `staff.team_id` (DB §4, §12). No "type a new value" affordance anywhere in this control — unlike a typical master-data picklist elsewhere in this codebase, there is deliberately no inline "add new" shortcut here; a team that doesn't yet exist must be created first via Team Management's "Create Team" (§7), then selected here. Search-to-filter within the closed list is still supported (same `SearchInput`-style filtering as any other dropdown), just not free entry.

Staff Detail's read view gains a Role badge (showing `roles.name` if `role_id` is set, else the legacy `role` value with a small "chưa di chuyển" (not yet migrated) indicator) and a Team badge (or "Chưa có nhóm" if `team_id` is `NULL`), next to the existing Status badge.

---

## 9. Audit History

Route: `/settings/permissions/audit`. Same visual pattern as Staff Detail's existing activity feed (`getActivityLogsByStaff()` → chronological list, `ACTION_LABEL` mapping, timestamp via `formatDate()`) — generalized here to `getActivityLogsByEntity()` filtered to `entity IN ('role', 'permission', 'role_permission', 'role_data_scope')` (DB §16), across **all** roles/permissions at once, not scoped to one.

Each row: actor (staff name, resolved via `activity_logs.staff_id`), action label (e.g. "Đã cấp quyền", "Đã đổi phạm vi dữ liệu", "Đã tạo vai trò" — one label per `action` string DB §16 defines), entity reference (role/permission name, resolved from `entity_id`), timestamp. Clicking a row whose entity is a role deep-links to that Role Detail page (§3).

This is **read-only** — no edit/delete control anywhere, consistent with `activity_logs` being an append-only audit trail everywhere else this pattern is used in the app.

---

## 10. Search

- **Role List (§2):** single search box matching `roles.name`/`role_key`, same `SearchInput` component/placement as every other list screen (`StaffTable.tsx`, `ProductTable.tsx`).
- **Permission Matrix (§4):** search box filters the visible permission rows by `permission_key`/`resource`/`action` substring — the role columns never filter (all roles always shown, since hiding a column mid-bulk-edit would be confusing).
- **Sensitive Field Config (§6):** the per-field permission multi-select is itself search-as-you-type over `permissions.permission_key` (not a page-level search).
- **Team Management (§7):** search box over team names and, within an expanded team, over member names.
- **Audit History (§9):** search box over actor name and entity name/key.

All search inputs debounce and clear with the same "×" affordance already standard across this codebase (`INVENTORY_UI.md` §1.2).

---

## 11. Filters

- **Role List:** Status filter (Active / Disabled / All), same dropdown convention as Staff List's Status filter.
- **Permission Matrix:** Resource filter (jump to/show only one resource group) — a convenience on top of the always-present grouping, not a data restriction; and an Active/Disabled filter mirroring Role List's.
- **Team Management:** none beyond search — the team count is small enough (grouped by distinct value) that a filter adds no value.
- **Data Scope Matrix (§5.1):** Resource filter (same convenience as Permission Matrix's) and an Active/Disabled role filter — no scope-value filter, since the whole point of the screen is seeing all three side by side.
- **Audit History:** Entity type filter (Role / Permission / Permission Grant / Data Scope — the four `entity` values, DB §16) and a **local** date-range filter (from/to date inputs). Deliberately **not** a reuse of the shared `useGlobalDateFilter()`/`GlobalDateFilter` component — that hook drives cross-page shared state for Dashboard/Reports specifically; coupling Permission Center's audit view to it would mean changing the date filter here silently changes what Dashboard shows elsewhere, an unrelated and surprising side effect. This screen's date range is local state, scoped to this page only.

All filters combine with search using AND logic, same convention as every existing filter bar in this codebase.

---

## 12. Bulk Actions

- **Permission Matrix (§4):** row-group header toggle — grant/revoke every permission in one resource group for one role in a single action (one batch of `role_permissions` writes). A top-level "Save" is **not** required — same immediate-commit-on-toggle pattern as §3.1, applied per cell/group, so there's no risk of a large unsaved matrix being lost.
- **Team Management (§7):** multi-select staff (checkboxes on the member list, same interaction as any existing multi-select in this codebase) → "Assign to team" / "Remove from team", writing `staff.team_id` for every selected row in one action. "Rename Team" (§7) is itself a bulk action (every member's `team_id` rewritten together).
- **Role List:** no bulk action proposed — disabling/enabling is a deliberate per-role decision (Role List's Status filter, §11, is the closest thing to a bulk view, but the action itself stays per-row to avoid an accidental mass-disable of every role at once).
- **Role Detail — Clone Permission (§3.3, Decision 14):** itself a bulk action — one confirm writes every one of the source role's `role_permissions` rows onto the target role in a single batch, rather than requiring the admin to re-toggle each permission individually.
- **Audit History, Data Scope Matrix, Permission Dashboard:** none — all three are read-only (§5.1, §9, §18), nothing to bulk-act on.

---

## 13. Empty States

Same muted-icon + one-line-text pattern as every other list screen in this codebase (`ProductTable.tsx`/`BatchTable.tsx`, `INVENTORY_UI.md` §1.8).

| Screen | Empty condition | Message (illustrative) |
|---|---|---|
| Role List | No roles exist (shouldn't happen post-seed, DB §19, but designed for) | "Chưa có vai trò nào" |
| Role Detail — Quyền tab | Role holds zero permissions | "Vai trò này chưa được cấp quyền nào" — explicit, not silently blank, since a new role (§2) starts with none |
| Role Detail — Data Scope tab | No `role_data_scopes` rows for this role yet | "Chưa cấu hình phạm vi dữ liệu" |
| Permission Matrix | No permissions match the active search/filter | "Không tìm thấy quyền phù hợp" |
| Sensitive Field Config | A field has zero permissions paired to it | "Chưa có quyền nào mở khóa trường này" — means nobody can currently see that field regardless of role, called out explicitly since it's a meaningful state (accidentally locking a field for everyone) |
| Team Management | No staff have any `team_id` set yet | "Chưa có nhóm nào được tạo" |
| Audit History | No matching activity logs | "Chưa có lịch sử thay đổi" / "Không tìm thấy kết quả phù hợp" (search/filter applied) |
| Data Scope Matrix (§5.1) | A (role, resource) pair has no `role_data_scopes` row | Muted dash badge in that cell, not a blank cell — same "explicit absence, not silence" principle as Role Detail's Data Scope tab (§3.2) |
| Permission Dashboard (§18) | Zero roles/permissions/teams exist, or zero changes in the last 30 days | Each KPI card still renders its real value, including "0" — never hidden — same zero-value handling as `StatCard` elsewhere (`INVENTORY_UI.md` §1.8) |

---

## 14. Responsive Design

Follows the exact responsive behavior already shipped for Staff/Customer/Product (`INVENTORY_UI.md` §1.10/§1.11) — no new responsive pattern introduced except where the Permission Matrix genuinely needs one.

- **Role List, Team Management, Audit History:** identical mobile/desktop behavior to `StaffTable.tsx` — table scrolls horizontally within its card on narrow screens; filter bar stacks to a single column below the desktop breakpoint.
- **Role Detail tabs:** tab strip becomes a horizontally-scrollable pill row on mobile (same pattern already used for Settings' category button row, `app/settings/page.tsx`), single-column content beneath.
- **Permission Matrix — the one screen needing a deliberate mobile adaptation:** a wide grid doesn't collapse well. Desktop shows the full Role×Permission grid, first column sticky, horizontal scroll for additional role columns beyond viewport width (same `min-width` + horizontal-scroll approach `ORDERS_DATABASE.md`/existing tables already use, not a new pattern). On mobile, the grid **inverts to a per-role accordion**: pick one role from a dropdown, see that role's own permission checklist (effectively §3.1's view) full-width — avoids a genuinely unusable tiny-cell grid on a phone screen, while still reading/writing the exact same `role_permissions` data.
- **Sensitive Field Config:** 5 fixed cards stack to a single column on mobile, same `StatCard`-row responsive behavior used elsewhere.
- **Data Scope Matrix (§5.1):** same sticky-first-column + horizontal-scroll desktop treatment as Permission Matrix, same per-role accordion inversion on mobile (read-only version — badges instead of toggles).
- **Permission Dashboard (§18):** 5 KPI cards in a single responsive row (wraps to 2–3 columns on narrower desktop widths, stacks to one column on mobile), identical grid behavior to Inventory's Statistics Cards (`INVENTORY_UI.md` §1.4/§1.10).

---

## 15. User Journey

**Primary journey — configuring a new role end-to-end:**

1. Owner-equivalent staff opens Settings → Phân quyền → lands on the Permission Dashboard (§18, Decision 16), glances at the 5 KPIs, then navigates to Role List (§2).
2. Clicks "Add Role," names it (e.g. "Regional Sales Lead"), sets `role_key` — a new `roles` row exists, zero permissions, zero data scopes (§2). Alternatively, if a similar role already exists, uses **Clone Permission** (§3.3, Decision 14) from that role's Detail page to seed the new role's permissions in one step instead of starting from zero.
3. Opens the new role's Detail page (§3) → Quyền tab → grants/adjusts permissions (or uses the Permission Matrix, §4, if configuring several roles at once).
4. Switches to the Phạm vi dữ liệu tab (§3.2/§5) → sets Customers/Commissions to "Team," Reports to "All" — optionally cross-checks against the read-only Data Scope Matrix (§5.1) first to see how other roles are already configured.
5. (If relevant) Visits Sensitive Field Config (§6) to confirm which of the newly-granted permissions already unlock a sensitive field, or pairs a new one.
6. Visits Team Management (§7) → creates a team ("Miền Trung") if it doesn't already exist — the **only** point in this journey where a team name is typed as free text (Decision 13).
7. Goes to Staff Detail (§8) for each affected staff member → assigns the new Role and picks the new Team from the closed list (Decision 13; no typing here).
8. Returns to Audit History (§9) to confirm every step above was logged, as a sanity check before considering the configuration final.

**Secondary journey — auditing "why can this person see X":** Staff Detail (§8) shows their Role and Team badges → Role Detail (§3) shows that role's exact grants and scopes → Sensitive Field Config (§6) shows whether any granted permission unlocks the specific field in question → Audit History (§9) shows who last changed any of it and when. No step requires leaving the Permission Center section once inside it.

---

## 16. Accessibility

- **Permission Matrix and every toggle grid:** each cell is a real checkbox/switch with an accessible label combining role name + permission key (e.g. "Manager — customers.view"), not a bare icon-only clickable `div` — keyboard-navigable (Tab/Space), consistent with this codebase's existing Radix-based `Modal`/`AlertDialog` accessibility baseline.
- **3-way Data Scope control (§3.2/§5):** implemented as a labeled radio group (Own/Team/All), not three independent buttons with ambiguous grouping — screen readers announce it as one choice among three, not three unrelated buttons.
- **Color is never the only signal:** Status badges (Active/Disabled), Data Scope segments, and the "sensitive field unlocked" summary (§6) all pair color with text, same convention already used by every `Badge` in this codebase.
- **Icon-only controls** (row-action buttons, the Power/disable toggle, chevrons) get `aria-label`s, matching the existing `aria-label="Đóng menu"` convention already present in `Sidebar.tsx`.
- **Focus management:** opening the Add/Edit Role modal, and the new Clone Permission modal (§3.3), moves focus into it and returns focus to the triggering control on close, same as existing `Modal` usage elsewhere (no new modal component is introduced, so no new focus-trap logic is needed).
- **Read-only matrix cells (Data Scope Matrix, §5.1):** rendered as non-interactive badges with `aria-readonly`-equivalent semantics, not disabled buttons that look identical to the editable Permission Matrix's toggles — a screen reader or keyboard user must be able to tell the two matrices apart without relying on a visual-only cue.
- **Team closed-list select (§8, Decision 13):** a real `<select>`/combobox with proper labeling, not a text input with a suggestion dropdown — reinforces that free text isn't accepted, for assistive tech users the same way it does visually for everyone else.

---

## 17. Performance Considerations

- **Permission resolution caching (DB §17):** the signed-in staff member's own resolved permission set (used to decide whether Permission Center's screens are even reachable, once enforcement exists) should be resolved once per session, not per screen — this document doesn't re-decide that, just inherits it.
- **Permission Matrix is the one screen with a real N×M data-volume concern.** Load strategy: one batched fetch of all active `roles`, all active `permissions`, and all `role_permissions` rows (three queries, not one join-per-cell) — client-side assembly into the grid, avoiding an N+1 pattern. If the permission count grows large enough that this becomes slow, resource-group collapsing (§4, groups collapsed by default except the one currently searched/filtered) keeps the rendered DOM small without changing the fetch strategy.
- **Search inputs debounce** (§10), same convention as `SearchInput` elsewhere — no new debounce implementation needed.
- **Audit History** loads a bounded, paginated page of `activity_logs` (same pattern Staff Detail's activity feed already uses for one staff member, extended here to a date-bounded page across all Permission Center entities) rather than fetching the entire table — the date-range filter (§11) doubles as the pagination boundary for the default view (defaults to "last 30 days," expandable).
- **Team Management's distinct-`team_id` list** (§7) is computed from the same `staff` fetch List screens already do elsewhere — no new heavy query, just a client-side `DISTINCT`-style group-by over already-loaded staff data. This same computed list now also backs the closed-list Team select (§8, Decision 13), so it should be fetched once and shared rather than re-derived per screen.
- **Data Scope Matrix (§5.1)** reuses the same batched-fetch strategy as Permission Matrix (§17 above) — `roles` + `role_data_scopes` in two queries, assembled client-side, not one query per cell.
- **Permission Dashboard's 5 KPIs (§18)** are simple aggregate `COUNT`s, each cheap individually — `roles`, `permissions`, `staff` (for Assigned Users and Total Teams' distinct count), and a date-bounded `activity_logs` count for the 30-day metric. Fetched once on landing, not polled — a manual refresh affordance (same "Làm mới" pattern used elsewhere) is enough, no live-updating dashboard is implied by Decision 16.

---

## 18. Permission Dashboard (Decision 16, new)

Route: `/settings/permissions` — the section's default landing tab (Navigation, §1). Five `StatCard`s in a row, same component/pattern as Inventory's Statistics Cards (`INVENTORY_UI.md` §1.4) — every number a count, nothing computed beyond a straightforward aggregate:

1. **Total Roles** — count of `roles` where `is_active = true` (DB §4).
2. **Total Permissions** — count of `permissions` where `is_active = true` (DB §4).
3. **Assigned Users** — count of `staff` where `role_id IS NOT NULL` (DB §10, Decision 10's dynamic-role migration state), shown as "X / Y nhân viên" (X migrated, Y total staff) rather than a bare number — makes migration progress visible, consistent with Design Principle 4 (the legacy/dynamic fallback is surfaced, not hidden). Flagged as a judgment call in Self Review below, since Decision 16 didn't specify which reading of "Assigned Users" was intended.
4. **Total Teams** — count of distinct, non-null `staff.team_id` values (DB §4) — same computation Team Management (§7) already performs.
5. **Permission Changes (30 days)** — count of `activity_logs` rows where `entity IN ('role', 'permission', 'role_permission', 'role_data_scope')` (DB §16) and `created_at` falls in the trailing 30 days from now. A fixed rolling window, deliberately not tied to Audit History's adjustable local date filter (§11) — this is a stable KPI, not a report.

Each card is clickable, deep-linking to the relevant screen (Total Roles → Role List §2, Total Permissions → Permission Matrix §4, Assigned Users → Staff List filtered to unassigned, Total Teams → Team Management §7, Permission Changes → Audit History §9 pre-filtered to the last 30 days) — consistent with how `StatCard` drill-throughs already work on Dashboard/Reports elsewhere in this codebase.

---

## Open Questions

1. **Icon choice for the new Settings card (§1):** `ShieldCheck` is proposed (reused from its existing Sidebar import for Data Verification) since no icon was specified in the Decisions; confirming before Development avoids a cosmetic rework.
2. **"Assigned Users" definition (§18, Decision 16):** this document reads it as "staff migrated to the dynamic role model" (`role_id IS NOT NULL`) rather than "all staff with any resolvable role" (which, since `staff.role` defaults to a non-null value, would trivially equal total staff count and carry no information) — flagged since Decision 16 named the KPI but not its exact definition.

---

UI Design only. No code written. No database changes. No business rule changes. Stopping — waiting for Product Owner Review.
