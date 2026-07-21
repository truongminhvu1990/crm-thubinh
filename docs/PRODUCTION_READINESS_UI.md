# Production Readiness — UI Design Spec

**Sprint:** v4.0.1 — Production Readiness (no new business features)
**Module:** Cross-cutting (Production Readiness / Ops Console) — not a product module
**Status:** Draft — Revision 2. Product Owner issued 5 scoped Decisions (31–35); applied below, nothing else changed. Awaiting Product Owner Review.
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level business description only.
**Based on:** `docs/PRODUCTION_READINESS_SPEC.md` (LOCKED) and `docs/PRODUCTION_READINESS_DATABASE.md` (LOCKED). This document does not redesign either, does not redesign any frozen product module, and does not decide anything either locked document left as an open question — where a screen's real data source isn't decided yet (Backup Metadata's Option A/B, a monitoring vendor, Staging's existence), this document says so plainly and designs the screen to work either way, rather than assuming an answer.

**What this document is, framed honestly up front:** an internal, admin-only **Ops Console** — a new cross-cutting surface, not a redesign of any existing module, reusing the Enterprise Permission Center's own screen patterns (tab strip, table-card lists, checklists, `StatCard` KPIs) exactly as PERMISSION_UI.md established them. **Several of the 16 operational screens below have no real backing data source today** — this was already true in the locked Business Design (no monitoring vendor, no deployment automation, no incident-tracking table) and the locked Database Design (Backup Metadata/Restore Drill logging is explicitly optional and undecided). Rather than pretend those gaps are closed, each affected section states plainly whether it reads real data, manually-entered data, or is a placeholder awaiting a decision made elsewhere.

---

## 1. Production Dashboard

Route: `/settings/production-readiness` (landing page, same "Dashboard first" convention `PERMISSION_UI.md` §18 already established for Permission Center).

Eight `StatCard`-style status tiles, one per Production Ready dimension (`PRODUCTION_READINESS_SPEC.md`'s Decision 22 definition — Functional, Security, Backup, Recovery, Monitoring, Performance, Deployment, UAT), each showing a status derived **directly from the Release Checklist (§12)**, not a separately-invented health score:

- 🔴 **Red** — at least one Critical item for that dimension is still open on the Release Checklist.
- 🟡 **Amber** — no Critical items open, but at least one High item is.
- 🟢 **Green** — every Critical and High item for that dimension is checked off.
- ⚪ **Unknown** — the dimension has no checklist items yet resolved either way (distinct from Green — "nothing outstanding" and "nothing has been reviewed" must never look the same).

Each tile deep-links to its detail screen (§2–§16 below, grouped into tabs per §17 Responsive Behaviour's own description of the tab strip). No tile computes anything beyond counting checklist state — this dashboard is a **rollup view**, not an independent judgment of readiness.

### 1.1 Production Readiness Score (Decision 31)

A single number, shown prominently above the 8 dimension tiles — **calculated from the same Release Checklist (§12) the tiles already read, not a second, independently-invented metric.** Weighted so severity actually matters, not a flat "N of M checked" count: each Critical item worth 3 points, each High item worth 2, each Low item worth 1. Score = (points from checked items ÷ total possible points) × 100%.

Rendered as a percentage plus a one-line qualifier, not a bare number:
- **100%, all Critical/High clear** → "Sẵn sàng" (Ready)
- **< 100% but every Critical item clear** → "Gần sẵn sàng — còn hạng mục High/Low" (Nearly ready — High/Low items remain)
- **Any Critical item still open** → "Chưa sẵn sàng" (Not ready), shown in the same red treatment as a Red dimension tile, regardless of how high the numeric percentage happens to be — a high score built entirely from Low items while a Critical item is still open must never read as "mostly ready."

This score has exactly one source of truth (§12's checklist state) — there is no separate "override the score" control anywhere in this design, consistent with Permission Center's own "no duplicate editors" principle (`PERMISSION_UI.md` Design Principle 2).

---

## 2. Environment Status

Grouped under the **Môi trường** (Environments) tab.

Three cards — Development, Staging, Production — each showing: environment name, linked Supabase project reference (Development/Production only — real, read from the same config this repo's own `supabase` CLI link already exposes; Staging shown as a fourth, greyed-out card reading **"Chưa khởi tạo" (Not provisioned)** with a one-line explanation, since `PRODUCTION_READINESS_DATABASE.md` §2 is explicit that Staging does not exist), last-known migration state (cross-referencing Migration History, §6), and a link to that environment's own System Health check (§7).

**Real data:** Development/Production project identity (already known, static config). **Not yet real:** any live "last migration applied" timestamp — until Migration History (§6) has an actual entry, this shows "Chưa có dữ liệu" (No data yet), not a fabricated date.

### 2.1 Environment Banner (Decision 32)

A **persistent banner across every screen of the Ops Console** (not just this one) — always visible at the top, below the page header, stating which environment's data the viewer is currently looking at, in a **visually distinct style per environment** so a screenshot or a glance alone is enough to tell them apart:

- **Development** — neutral/informational style (the same muted-blue treatment already used for informational badges elsewhere in this codebase) — low visual weight, since mistakes here are low-stakes.
- **Staging** — a distinct accent (amber/purple family, not reused from Development or Production) — signals "rehearsal, not real," and doubles as a visible reminder that this environment doesn't exist yet (rendered in the same greyed/"not provisioned" treatment as its Environment Status card, §2, until it is).
- **Production** — the most visually assertive of the three (the same destructive/warning-red family already used for irreversible actions elsewhere in this codebase, e.g. delete confirmations) — deliberately impossible to mistake for Development, since every other screen in this document that shows per-environment data (Backup Status §4, Restore History §5, Migration History §6) depends on the viewer knowing, without having to read fine print, whether they're looking at rehearsal data or the real thing.

The banner reflects whichever environment context the current screen/filter is scoped to — on multi-environment screens (§2, §4, §5, §6) it follows the active environment tab/filter; on environment-agnostic screens (§1 Dashboard, §10 Audit Overview, §15 Access Control) it either shows all three compactly or is omitted, not forced to pick one arbitrarily.

---

## 3. Deployment History

Grouped under the **Triển khai** (Deployment) tab, alongside Migration History (§6) — the two are shown together since a deployment and the migration(s) that shipped with it are almost always one event.

**No deployment automation exists** (`PRODUCTION_READINESS_SPEC.md` §3) — so this cannot be a live feed of real deploy events. Designed instead as a **manually-entered log**: each entry records what was deployed (a version/commit label), to which environment, by whom, when, and a link to that deployment's Migration Verification Checklist result (§6, DB §3.1) if a migration shipped with it. A "Log a deployment" action opens a small form for exactly these fields — nothing more.

**Empty state:** "Chưa có bản ghi triển khai nào" (No deployment records yet) — expected on first use, not an error state.

---

## 4. Backup Status

Grouped under the **Sao lưu & Khôi phục** (Backup & Restore) tab, alongside Restore History (§5).

Directly renders whichever option `PRODUCTION_READINESS_DATABASE.md` §6 is eventually built as — **this document does not choose between them**, and designs one screen that works with either:

- **If Option A (runbook, no table) is chosen:** this screen displays the runbook's last-recorded entry per environment as read-only reference text (someone still updates the actual runbook document; this screen mirrors it, it doesn't replace it) — clearly labeled "Nguồn: tài liệu vận hành" (Source: operational runbook).
- **If Option B (`backup_metadata` table) is chosen:** this screen becomes a real list/detail view over that table — one row per environment per confirmation date (plan tier, PITR enabled, retention days, confirmed by, notes), with an "Add confirmation" action recording a fresh Dashboard check.

Either way, each environment shows a status badge: **Đã xác nhận** (Confirmed, if a check exists within some freshness window — window itself not set here, an operational decision) / **Cần xác nhận lại** (Needs re-confirmation, stale) / **Chưa xác nhận** (Never confirmed). Per Decision 27 (DB §6), nothing on this screen ever displays business/customer data — every field here is a fact *about* a backup, never backed-up content itself.

---

## 5. Restore History

Same table/runbook duality as §4. Each entry shows exactly the 6 minimum fields locked in `PRODUCTION_READINESS_DATABASE.md` §7 (Decision 28): **Timestamp, Operator, Backup reference, Restore duration, Result, Notes** — no more, no fewer, so this screen can never silently drift from what the Database Design actually requires to be recorded. Result renders as a badge (Thành công / Thất bại — Success/Failure); a failed drill's Notes field is shown expanded by default rather than collapsed, since a failed restore drill is the single most important row on this entire screen.

---

## 6. Migration History

Grouped with Deployment History (§3) under **Triển khai**.

`PRODUCTION_READINESS_DATABASE.md` §4 explicitly recommends **against** a custom migration-tracking table, relying instead on Supabase's own native `supabase_migrations.schema_migrations` ledger — which lives in its own schema, not necessarily reachable through this app's existing anon-key PostgREST access the same way `public` schema tables are. This screen is therefore designed around **two layers, not one**:

- **The migration file list itself** (`supabase/migrations/*.sql`) — static, read from the repository at build time, not a database query; shows filename, and a manually-set status per environment (Applied / Not applied / Unknown) until/unless a future decision wires up real Management-API access to the native ledger (not decided here).
- **The Migration Verification Checklist result** (DB §3.1, Decision 30) per migration per environment — Migration completed / Record counts / Constraints / Application startup, each a checkbox, plus who ran it and when. This part is exactly as real or as manual as Deployment History (§3) is — hand-entered until automation exists.

**This screen does not claim to show a live, authoritative "what's applied where" feed** — per the locked Database Design's own finding, that fact has historically been unreliable even at the infrastructure level. It shows what's been manually recorded, honestly labeled as such.

---

## 7. System Health

Grouped under **Sức khỏe & Giám sát** (Health & Monitoring) tab, alongside Monitoring Overview (§8) and Error Overview (§9).

**The one screen in this entire document with a fully real, already-existing data source:** `/api/health` already exists in the codebase today, deliberately excluded from the login gate for exactly this purpose (`PRODUCTION_READINESS_SPEC.md` §6). This screen pings it for Development and Production (and Staging, once provisioned) on a short interval while the page is open, showing Up/Down per environment with a last-checked timestamp. No new backend capability is needed for this specific screen — it's a UI wrapper around an endpoint that already responds.

---

## 8. Monitoring Overview

Same tab as §7. **No monitoring vendor exists** (`PRODUCTION_READINESS_SPEC.md` §6 — no Sentry/Datadog/etc., confirmed absent from `package.json`). This screen is a **placeholder by design**, not a stub that looks broken: three cards — Uptime Monitoring, Error-Rate Monitoring, Database Health — each showing "Chưa cấu hình" (Not configured) with one line naming what closing that gap would need (an uptime pinger, an error-tracking SDK, watching Supabase's own project dashboard). Once a vendor is chosen (an open decision in both locked documents), this screen's cards become either an embedded widget or an outbound link to that vendor's own dashboard — not reimplemented as a custom chart inside this app.

---

## 9. Error Overview

Same tab as §7/§8. **Also currently a placeholder**, for a more specific reason than §8: even if a monitoring vendor is chosen tomorrow, there is no historical error data to show yet, because today's errors only ever reach `console.error` (`lib/logger.ts`) with no persistence (`PRODUCTION_READINESS_DATABASE.md` §9 explicitly recommends **against** ever persisting logs into Postgres). This screen shows the same "Chưa cấu hình" treatment as §8, with an explicit note that it will only ever show data once an *external* log/error aggregation tool exists — this screen will never become a database-backed feature itself, by the Database Design's own stated position.

---

## 10. Audit Overview

Its own tab: **Nhật ký** (Audit Log).

**This is real and buildable on data that already exists** — `activity_logs`, live today, used by Staff, Marketing, Data Verification, and the Permission Center (`PRODUCTION_READINESS_SPEC.md` §17). This screen is deliberately **broader in scope than Permission Center's own Audit History page** (`PERMISSION_UI.md` §9, which filters to exactly 4 entity types: role/permission/role_permission/role_data_scope) — Audit Overview shows **every** `entity` value present in `activity_logs`, across every module that writes to it, as: a total-events count, a breakdown by entity type (count per `entity` value, e.g. "staff: 12, role: 6, permission_grant: 40, ..."), and a most-recent-activity feed across all of them combined. A card labeled "Phân quyền" (Permission Center) on this screen deep-links to Permission Center's own, narrower Audit History page rather than duplicating its detailed per-entity rendering.

**Not covered here or there:** Customers, Products, Batches, Settings, and Product Images still write directly client→Supabase with no server-side chokepoint (`PRODUCTION_READINESS_SPEC.md` §17) — nothing in `activity_logs` observes changes to those five modules, so this screen's totals will always undercount real system activity until that architectural gap closes. This screen states that limitation on itself, rather than implying its count is a complete picture.

---

## 11. UAT Progress

Grouped under **Sẵn sàng phát hành** (Release Readiness) tab, alongside Release Checklist (§12) and Go Live Checklist (§13).

Renders `PRODUCTION_READINESS_SPEC.md` §14.1's UAT by Role table (Owner, Manager, Sales, Marketing, Viewer) as a checklist: one row per role, a checkbox for "full-application-access verified," a checkbox for "Permission Center 403-on-write verified" (§9's caveat — Owner gets a third checkbox instead, "Permission Center admin access verified," since Owner's expected outcome is the opposite of the other four roles'), who signed off, and when.

**No table exists yet to persist this state** (neither locked document defines one) — same open-question treatment as Backup Metadata: this document does not invent a `uat_progress` table here, it flags in §20 that one may be needed, sized identically small to `restore_drill_log` if built.

---

## 12. Release Checklist

Same tab as §11. A direct, literal rendering of `PRODUCTION_READINESS_SPEC.md` §15 — three sections, **Critical / High / Low** (Decision 23), each item a checkbox with its `[Dimension]` tag already given in the locked spec (e.g. `[Security]`, `[Backup]`) preserved and shown as a small badge next to each item, since that tag is exactly what drives the Production Dashboard's per-dimension status (§1). Checking an item here records who checked it and when — this is the actual, single source of truth the Dashboard's status tiles read from, not a separate copy of the checklist that could drift out of sync with it.

---

## 13. Go Live Checklist

Same tab as §11/§12. Renders `PRODUCTION_READINESS_SPEC.md` §21's five-stage sequence (Dev → Staging → Production → Pilot rollout → Full rollout) as a horizontal stepper, showing which stage the *current* release is at. Since Staging and Pilot rollout don't exist as real mechanisms yet (§21's own admission), the stepper's Staging and Pilot-rollout stages render in a visually distinct "not yet available" state rather than being skippable steps that look identical to the two stages that do exist (Dev, Full rollout) — the UI should not imply parity between a stage that's real today and one that's only proposed.

### 13.1 Product Owner Approval (Decision 34)

A dedicated field on the Full Rollout stage — **Status: Pending / Approved** — set only by explicit Product Owner action, mirroring the project's own standing release rule that Production only ever advances on the Product Owner's explicit "OK Merge" (`PRODUCTION_READINESS_SPEC.md` §13). No one else's role (Owner-equivalent staff running this Ops Console included) can set it to Approved on the Product Owner's behalf — the field records *who* approved and *when*, the same audit-style pairing every other sign-off field in this document uses (Restore History's Operator, §5; Migration Verification's operator, §6).

**Go Live is not considered complete while this field reads Pending, regardless of every other checklist item's state.** The Full Rollout stage of the stepper (§13) renders as incomplete/blocked — not merely "in progress" — until this flips to Approved, and the Production Readiness Score (§1.1) does not report "Sẵn sàng" (Ready) while it's Pending, even if every Critical/High/Low item on the Release Checklist (§12) is otherwise checked off. This is the one gate in this entire document that isn't derived from checklist arithmetic — it's a deliberate, irreducible human sign-off, by design.

---

## 14. Incident Overview — Future Module (Decision 33)

**Marked explicitly as a Future Module — not built, not presented as an available operational feature in this revision.** Its tab in the Ops Console strip (§17) renders using the exact same disabled/"Sắp có" (Coming soon) treatment `components/Sidebar.tsx` already uses for not-yet-built nav entries (a static, non-clickable row, muted styling, small "Sắp có" chip) — the same established app-wide convention, not a new one invented for this screen. Nothing about the list/detail shape sketched below is built or shown to a user; it exists only so a future revision has a documented starting point, not as a preview of a working feature.

**Why, restated from Revision 1 and now made a firm decision rather than a caveat:** no incident-tracking table was defined in the locked Database Design — `PRODUCTION_READINESS_SPEC.md` §16 names the one real incident this project has had (`uat_round2_data_loss`, 2026-07-18) but describes incident recovery as "ad hoc, not procedural" today, and `PRODUCTION_READINESS_DATABASE.md` never proposed an `incidents` table at all (a genuine gap between the two locked documents, flagged in §20). Rather than ship a screen that looks operational but has nothing real behind it, Decision 33 settles that tension by explicitly deferring the whole screen instead of half-building it.

**Deferred design, for a future revision only:** a list/detail shape — one entry per incident: what happened, when detected, when resolved, root cause (nullable), and a link to any postmortem document.

---

## 15. Access Control

Its own tab: **Quyền truy cập** (Access Control).

**This screen does not introduce a new access-control mechanism** — it reuses the Enterprise Permission Center exactly as it already exists (`PERMISSION_UI.md`), gated the same way. A new permission key, conceptually `production.manage` (naming only — not created here), would need to be added to the `permissions` table via a future migration seed (data, not a schema change, same category of change as any other new permission this project has added since Permission Center launched) before this Ops Console can be gated by it; until then, this screen and the rest of the Ops Console fall back to the same `settings.manage` gate the Permission Center's own admin surface already uses.

This screen itself is thin: a short explanation of what's gated (this Ops Console) and by which permission, plus a deep link to Permission Center's own Role Detail screen (`PERMISSION_UI.md` §3) for actually granting/revoking it — **no duplicate grant/revoke UI is built here**, avoiding exactly the "two editors for one fact" mistake `PERMISSION_UI.md`'s own Design Principle 2 already warned against.

---

## 16. Mobile Readiness Status

Its own tab: **Di động** (Mobile).

A direct, literal rendering of `PRODUCTION_READINESS_SPEC.md` §18.1's Mobile Readiness Checklist — six rows (API Authentication, Token Refresh, Versioning, Offline Strategy, Push Notification Readiness, File Upload Readiness), each showing its current status exactly as that locked document assessed it (five ❌, one ⚠️ partial) and a short note field an Owner can update if the underlying reality changes (e.g., once a token-auth flow is eventually built for some other reason). This screen **does not build or propose any of the six capabilities** — it only tracks and displays their status, the same "status board, not implementation" treatment every other checklist screen in this document gets.

---

## 17. Responsive Behaviour

Follows the exact patterns already established by `PERMISSION_UI.md` §14 — no new responsive pattern introduced:

- The Ops Console's tab strip (grouping the 10 screens above into **Tổng quan / Môi trường / Triển khai / Sao lưu & Khôi phục / Sức khỏe & Giám sát / Nhật ký / Sẵn sàng phát hành / Sự cố / Quyền truy cập / Di động**) becomes a horizontally-scrollable pill row on mobile, same as Permission Center's own tab strip.
- Every table-shaped screen (Deployment History, Migration History, Backup Status, Restore History) scrolls horizontally within its own card on narrow screens, same as every other table in this codebase.
- The Production Dashboard's 8 status tiles stack from a single row (desktop) to 2-column (tablet) to 1-column (mobile), same responsive grid behavior as Inventory's Statistics Cards and Permission Center's own Dashboard.
- The Go Live stepper (§13) collapses from a horizontal stepper to a vertical list on narrow screens, since 5 stages with labels don't fit a phone-width horizontal layout — the one screen-specific mobile adaptation in this document, same category of deliberate exception `PERMISSION_UI.md` made for its Permission Matrix.

### 17.1 Mobile Operation Restriction (Decision 35)

**On mobile, the Ops Console supports monitoring only** — viewing is unrestricted everywhere, but three specific write actions are **desktop-only**, not offered on a phone/tablet-width viewport at all (not merely harder to reach — actually absent from the mobile layout):

- **Deployment** — Deployment History's (§3) "Log a deployment" action.
- **Restore** — Restore History's (§5) drill-entry action, and anything on Backup Status (§4) that would trigger or record a restore.
- **Migration** — Migration History's (§6) Migration Verification Checklist actions (marking Migration completed / Record counts / Constraints / Application startup) and any manual "mark as applied" action.

On mobile, each of these three screens still displays its full history/status (monitoring) but replaces the action control with a short note — "Chỉ thực hiện trên máy tính" (Desktop only) — rather than a disabled-but-visible button, so it reads as a deliberate boundary, not a broken control. **Rationale, not previously stated:** these three actions gate irreversible or high-consequence operations (a real restore, a migration sign-off, a deployment record that other checklist items key off of) — restricting them to desktop matches this codebase's own established caution around consequential actions, and avoids a mis-tap on a small screen recording a false "verified" state for something as significant as a Production restore or migration.

All other screens (Dashboard §1, Environment Status §2, System Health §7, Monitoring Overview §8, Error Overview §9, Audit Overview §10, UAT Progress §11, Release Checklist §12, Go Live Checklist §13 — including the Product Owner Approval field, §13.1, since approving is a decision, not an execution action — Access Control §15, Mobile Readiness Status §16) remain fully usable on mobile, read and write alike.

---

## 18. Accessibility

Same baseline `PERMISSION_UI.md` §16 already established, applied to this document's screens specifically:

- Status badges (Red/Amber/Green/Unknown on the Dashboard; Confirmed/Stale/Never on Backup Status; Success/Failure on Restore History) always pair color with text — never color alone, consistent with every `Badge` usage elsewhere in this codebase.
- The Go Live stepper's "not yet available" stages (§13) are marked with both a visual style and an explicit `aria-disabled`-equivalent state and label ("Chưa khả dụng"), not conveyed by graying-out alone.
- Every manual-entry form this document implies (Deployment History's "Log a deployment," Backup Status's "Add confirmation," Restore History's drill entry) follows the same labeled-input, focus-management convention already established by every existing `Modal`-based form in this codebase — no new form pattern introduced.

---

## 19. Performance Considerations

This is a low-traffic, admin-only surface (Owner-equivalent staff only, occasionally), so the performance bar is deliberately lower than any customer-facing screen:

- No pagination is proposed for any list here (Deployment History, Restore History, Migration History) at today's scale — these logs grow by one row per deployment/drill/migration, which is a low-frequency event by nature (unlike customer/product data). Revisit only if that assumption stops holding.
- Audit Overview's (§10) entity-breakdown counts should be computed as `count`/`group by` queries against `activity_logs`, not fetched-and-aggregated client-side — the one place in this document where a real performance recommendation applies, and it matches `PRODUCTION_READINESS_DATABASE.md` §15's own standing recommendation for all new code.
- System Health's (§7) polling interval should be conservative (on the order of once per minute while the page is open, not continuous) — it's pinging `/api/health` for a human glancing at a screen, not powering a real uptime SLA (that's Monitoring Overview's, §8, job once a vendor exists).

---

## 20. Open Questions

1. **Backup Status (§4) / Restore History (§5) / Migration History (§6):** none of their real data sources are decided (`backup_metadata` Option A vs. B; whether/how the native Supabase migration ledger becomes reachable) — this document designed each screen to work either way, but cannot build the real thing until those Database Design questions resolve.
2. **UAT Progress (§11):** no persistence mechanism exists or is proposed in either locked document — flagged here as potentially needing its own small tracking table, sized like `restore_drill_log`, not decided in this document.
3. **Incident Overview (§14):** a genuine gap between the two locked documents — the Business Design (Spec §16) describes incident recovery as a process need, but the Database Design never defined an `incidents` table to back it. This document cannot resolve that gap; it can only flag that Incident Overview has no real data source until a future Database Design revision addresses it.
4. **Access Control (§15):** the `production.manage` permission key is named here only as a placeholder — whether that's the right key name, and when it gets seeded, is a Database Design/Development-phase decision, not made here.
5. **Deployment History (§3) freshness/format:** what counts as a "version" label (git SHA? a semantic version? this project doesn't currently tag releases) isn't decided — this document assumes free-text until a convention exists.
6. **Backup Status's "staleness window"** (§4 — when does a confirmed backup check start showing "Needs re-confirmation"?) is not set here — an operational policy decision, not a UI one.
7. **Whether Monitoring Overview/Error Overview (§8/§9) should ever embed a third-party vendor's widget directly, versus always just linking out** — depends entirely on which vendor gets chosen (an open question in the locked Business Design itself), not decidable here.

---

UI Design only. No code written. No database changes. No business rule modified. No frozen module redesigned. Stopping — waiting for Product Owner Review.
