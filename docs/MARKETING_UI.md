# Marketing CRM Foundation — UI Design Spec

**Module:** Marketing
**Status:** Revision 2 — **LOCKED**. Both Revision 1 gaps resolved by explicit Product Owner Decision (below); approved to proceed to Development.
**Phase:** UI design, now locked.
**Based on:** `docs/MARKETING_SPEC.md` (Revision 2, LOCKED) and `docs/MARKETING_DATABASE.md` (Revision 2, LOCKED). This document does not redesign, reinterpret, or add business logic. Every screen, card, and field below traces back to an already-locked section of one of those two documents, cited inline as (Spec §N) / (DB §N).

**Revision 2 — both Revision 1 gaps resolved:**

1. **Archive is unblocked.** `docs/MARKETING_DATABASE.md` Revision 2 adds `marketing_segments.status` (`Active`/`Inactive`/`Archived`, default `Active`). §4.3 below is updated: the Archive button is now wired to a real action (set `status = 'Archived'`), Restore sets it back to `Active`, and a Segment List Status filter/badge is added. Per Product Owner Decision, there is no hard-delete action for segments in this sprint — Archive/Inactive via `status` is the only "remove from use" mechanism (a segment referenced by any campaign can never be hard-deleted, enforced by `ON DELETE RESTRICT`, DB §6).
2. **Nested Sidebar confirmed**, and — per Product Owner Decision — must be built as a **reusable grouped-navigation primitive**, not a one-off: the same expand/collapse component/pattern this document specifies for Marketing's 7 children is intended for later reuse by Inventory and AI CRM. §1 below is updated accordingly.

---

## Design Principles

1. **No new business rule.** Every field, status, and condition here already exists in `MARKETING_SPEC.md`/`MARKETING_DATABASE.md` — this document only arranges them into screens.
2. **Reuse, don't reinvent (UX Rules).** Every table, card, button, search box, and pagination control reuses this codebase's existing primitives — `components/ui/{Card,Button,Modal,Input,SearchInput,Select,Badge,StatCard,AlertDialog}`, the table-card convention already used by `CustomerTable`/`SalesLedgerTable`, and `SalesLedgerPagination`'s page/of-page control. No new table, card, or button style is introduced.
3. **Segment evaluation is always live.** Segment Preview (§4.2) and every Dashboard/Birthday count (§3, §7) is computed server-side at request time — never cached, never precomputed into a stored count (Spec Feature 13, DB §1/§8).
4. **Foundation-only surfaces stay visibly inert.** Broadcast/Loyalty/Voucher (§9–§11) show "Coming Soon" with no control that does anything — same convention as every other placeholder in this codebase, not a disabled-looking-but-technically-live control.
5. **Permission framework reused as-is, gated only where the framework is designed to gate.** `RouteGuard` (`components/shared/RouteGuard.tsx`) exists but — confirmed by reading it — is wired into zero pages anywhere in this codebase today ("Not wired into any page in this sprint," per its own code comment). This document proposes wiring it around Marketing's mutating actions only (§12 per screen), using the existing `customers:manage` permission as the closest fit, since Spec Open Question #3 (which permission, or whether a new one is needed) is still unresolved. No new `Permission` literal is added by this document.

---

## 1. Navigation

Proposed Sidebar change: replace the single Market-Intelligence-style flat row with an **expandable parent entry**, "Marketing" (icon TBD at Development), that reveals 7 child rows when expanded — matching the task's menu tree exactly:

```
Marketing (parent, expandable)
├── Dashboard              → /marketing
├── Customer Segments       → /marketing/segments
├── Campaigns                → /marketing/campaigns
├── Birthday Center          → /marketing/birthdays
├── Broadcast (Coming Soon)  → /marketing/broadcast
├── Loyalty (Coming Soon)    → /marketing/loyalty
└── Voucher (Coming Soon)    → /marketing/voucher
```

Placement: appended after the existing "Thị trường" (Market Intelligence) entry and before "Kho kiến thức" (Knowledge Vault) — following the established pattern of new modules being appended near the end of the operational list, ahead of Settings.

The three Coming Soon children render the same disabled/muted treatment `Sidebar.tsx` already uses for not-yet-enabled entries (`enabled: false` styling — muted text, "Sắp có" badge, `cursor-not-allowed`), except they still navigate to their own placeholder page (§9–§11) rather than being fully inert, since the brief calls for a visible placeholder screen, not an absent one.

**Confirmed (Revision 2):** the nested tree is locked in, and the expand/collapse mechanism must be built as a generic, reusable component (e.g. a `SidebarGroup`-style primitive taking a label/icon/children array), not hardcoded to Marketing's own 7 entries — Inventory and AI CRM are named as future consumers of the same primitive. No such expand/collapse pattern exists anywhere in this codebase today (confirmed: no accordion/collapsible dependency installed) — this is genuinely new code, built once and shaped for reuse from the start.

---

## 2. Screen Flow

```
Marketing Dashboard (/marketing)
 ├──▶ Customer Segment List (/marketing/segments)
 │     ├──▶ Segment Builder — create (/marketing/segments/new)
 │     ├──▶ Segment Detail (/marketing/segments/[id])
 │     │     ├──▶ Segment Builder — edit (/marketing/segments/[id]/edit)
 │     │     └──▶ Campaign List, filtered to campaigns targeting this segment
 │     └──▶ (Duplicate action, stays on Segment List, new row appended)
 │
 ├──▶ Campaign List (/marketing/campaigns)
 │     ├──▶ Create Campaign (Modal, stays on Campaign List)
 │     └──▶ Campaign Detail (/marketing/campaigns/[id])
 │           ├──▶ Edit Campaign (Modal, same fields)
 │           └──▶ Target Segment → Segment Detail
 │
 ├──▶ Birthday Center (/marketing/birthdays)
 │     └──▶ Click customer → Customer Detail (/customers/[id]) — existing page, unmodified
 │
 ├──▶ Broadcast Placeholder (/marketing/broadcast) — dead end, Coming Soon
 ├──▶ Loyalty Placeholder (/marketing/loyalty) — dead end, Coming Soon
 └──▶ Voucher Placeholder (/marketing/voucher) — dead end, Coming Soon

Customer Detail (/customers/[id], existing page)
 └──▶ new "Campaign History" section (Spec §2.6) — links back to Campaign Detail
```

---

## 3. Marketing Dashboard

**Route:** `/marketing` | **Purpose:** top-line overview of Marketing activity — the landing page when the Marketing menu is opened (Spec Feature 11).

- **Layout:** single page, vertical scroll, no tabs — same convention as Market Intelligence/Reports.
- **Cards:** 7 `StatCard`s in a responsive grid (Spec §2.11, DB §8 — 7 independent live aggregate queries):
  1. Segment Count — total `marketing_segments` rows.
  2. Campaign Count — total `marketing_campaigns` rows.
  3. Birthday Today — customers whose `birthday` (month+day) is today.
  4. Birthday This Month — customers whose `birthday` (month+day) falls in the current month.
  5. Customers Without Purchase 30 Days — last purchase (or no purchase ever) older than 30 days.
  6. Customers Without Purchase 60 Days — same, 60-day cutoff.
  7. Customers Without Purchase 90 Days — same, 90-day cutoff.
- **Tables:** none — cards only, matching the brief's Feature 11 list exactly (no supplementary breakdown table is requested).
- **Filters / Search:** none — this is a fixed, all-time/all-current snapshot, no date range or search control (mirrors Market Intelligence's Summary Cards, which also carry no filter).
- **Actions:** each card is clickable, navigating to the relevant list pre-filtered/scrolled to the matching view (Segment Count → Segment List; Campaign Count → Campaign List; the three Birthday cards → Birthday Center, scrolled to the matching section; the three No-Purchase cards → Customer List, if/when that list supports a matching filter — flagged as a cross-module dependency, not built by this document since Customer List's filters are owned by the Customer module).
- **Empty State:** no empty state at the page level — cards always render, showing "0" when a count is zero (same convention as every other `StatCard` usage in this codebase, e.g. Market Intelligence).
- **Loading State:** each card shows the existing centered spinner convention while its own count resolves — cards can resolve independently, not gated behind a single all-or-nothing page loader.
- **Error State:** a card that fails to load its count shows a small inline "—" with a retry affordance, rather than blocking the other 6 cards (same resilience pattern already implicit in independent `StatCard` fetches elsewhere).
- **Navigation:** entry point from the Sidebar's "Dashboard" child (§1); does not replace or alter the existing top-level `/dashboard` (Feature Dashboard, LOCKED, untouched).
- **Permissions:** view-only, no RouteGuard — any authenticated staff member (Design Principle 5; no mutating action exists on this screen).

---

## 4. Customer Segment List

**Route:** `/marketing/segments` | **Purpose:** browse, search, and manage all segments (Spec Feature 1).

- **Layout:** page header ("Customer Segments" + "New Segment" button) above a single table, same header/table layout as `CustomerTable`'s page.
- **Cards:** none.
- **Table columns:** Name, Type (Dynamic/Manual badge), Status (Active/Inactive/Archived badge, Revision 2), Customer Count (live, DB §8), Created By, Updated At, Actions.
- **Filters:** Segment Type (All / Dynamic / Manual); Status (All / Active / Inactive / Archived, Revision 2 — defaults to Active).
- **Search:** by segment name (`SearchInput`, same component/debounce convention as Customer List's search).
- **Actions:** New Segment (→ Segment Builder, create mode, §4.1); per-row: View (→ Segment Detail), Edit (→ Segment Builder, edit mode), Duplicate (§4.4), Archive/Activate (§4.3, unblocked Revision 2).
- **Empty State:** "Chưa có phân khúc khách hàng nào" + a prompt to create the first one — same muted-icon-plus-text convention as every other list.
- **Loading State:** centered spinner, same convention as `CustomerTable`.
- **Error State:** inline error banner above the table, with a Retry button — same convention already used on data-fetch failure elsewhere (e.g. Data Verification page).
- **Pagination:** `SalesLedgerPagination`-style page/of-page control, server-side (DB §8, Feature 13 — never fetch-all).
- **Navigation:** reached from Sidebar → Customer Segments, or from Dashboard's Segment Count card.
- **Permissions:** list is view-only for any authenticated staff; New/Edit/Duplicate/Archive wrapped in `RouteGuard` (`customers:manage`, pending Open Question #3 — Design Principle 5).

### 4.1 Segment Builder

**Routes:** `/marketing/segments/new` (create) and `/marketing/segments/[id]/edit` (edit) — same page component in both modes, matching how this codebase already reuses one form for create/edit elsewhere (e.g. `CustomerForm`).

- **Purpose:** define a segment's name, type, and (for Dynamic) its condition set, with a live preview before saving (Spec Features 1–3).
- **Layout:** two-column on desktop — left column is the form (Name, Description, Segment Type toggle), right column is the Live Preview panel (§4.2); single column, form above preview, on mobile.
- **Segment Type toggle:** Dynamic / Manual (DB §2). Selecting **Dynamic** reveals the Condition Builder below the form fields. Selecting **Manual** reveals a customer-picker (search + add from the existing Customer List's search pattern, add/remove rows) instead — no condition UI at all, consistent with DB §2's "empty for Manual segments" design.
- **Condition Builder (Dynamic only):**
  - One row per condition: **Field** (`Select`, the 13 values from Spec §2.2/DB §2 verbatim), **Operator** (`Select`, options depend on the chosen Field's data type — e.g. date fields get "before/after/within last N days," numeric fields get "greater than/less than/between," text fields get "equals/contains"), **Value** (an `Input`, date picker, or range pair, shaped to match Field+Operator).
  - **AND / OR:** a single segment-level toggle (`condition_logic`, DB §2) shown once, above the condition list, applying to every row — **flat, not nested** (Spec Open Question #7 / DB §11 item 7 — this document follows the locked DB design's flat assumption, since a nested group UI would require a schema this design doesn't have).
  - Add Condition / Remove Condition buttons per row, matching the existing repeatable-row pattern already used elsewhere in this codebase (e.g. multi-value tag inputs).
  - Reordering rows: drag or up/down control, backed by `sort_order` (DB §2) — a nice-to-have, not a hard requirement of any locked spec section.
- **Live Preview panel:** re-runs on every Condition Builder change (debounced), server-side (Feature 13):
  - **Customer Count** — a large number, live count of matching customers.
  - **Estimated Reach** — shown directly beneath Customer Count. Per Spec Open Question #8 (still unresolved), this document renders it as **the same number as Customer Count** for this foundation sprint, with a label distinguishing the two only so the UI has a place for "Estimated Reach" to diverge later once a channel-reachability qualifier exists (Feature 7) — not a separate computation today.
  - **Sample Customers** — a short list (name + phone/code), paginated/capped, never the full match set (DB §8's "never load a full list at once").
  - **Refresh Preview** button — manual re-run, in addition to the automatic debounced refresh, for a customer who wants to force it after a slow network blip.
- **Actions:** Save (create or update the segment + its conditions/members), Cancel (discard, return to Segment List/Detail), and, only in edit mode: Duplicate (§4.4), Archive (§4.3).
- **Empty State:** a brand-new Dynamic segment with zero conditions shows Live Preview against "all customers" (an unfiltered count) with a hint text "Thêm điều kiện để thu hẹp phân khúc" (Add a condition to narrow this segment) rather than blocking Save.
- **Loading State:** Live Preview panel shows its own inline spinner while recomputing — the form itself never locks up while a preview is loading.
- **Error State:** a condition combination that produces an invalid query (e.g. a range Operator missing its second Value) is caught by client-side validation before any server call — Live Preview shows "Điều kiện chưa hợp lệ" (Invalid condition) inline on the offending row instead of attempting the request.
- **Navigation:** Save/Cancel both return to Segment Detail (edit mode) or Segment List (create mode).
- **Permissions:** entire screen wrapped in `RouteGuard` (`customers:manage`, pending confirmation) — this is a mutating screen, unlike List/Detail's read-only view.

### 4.2 Segment Detail

**Route:** `/marketing/segments/[id]` | **Purpose:** read-only view of one segment's definition, live stats, and linked campaigns.

- **Layout:** header (Name, Type badge, Edit/Duplicate/Archive buttons) + a stats row (Customer Count, Estimated Reach — same live values as §4.1's preview, computed fresh on page load) + a read-only rendering of the condition set (Dynamic) or member list (Manual) + a "Campaigns targeting this segment" table.
- **Cards:** Customer Count and Estimated Reach as two small `StatCard`s.
- **Tables:** condition set (Field / Operator / Value, read-only rows) for Dynamic; member list (paginated, DB §4 `idx_segment_members_segment_id`) for Manual; linked Campaigns (Name, Status, Start/End Date) reusing the Campaign List's row shape.
- **Filters / Search:** the Manual member list supports search-by-name (same `SearchInput` convention); the Campaigns table has no filter of its own (small, bounded list per segment).
- **Actions:** Edit (→ Segment Builder edit mode), Duplicate (§4.4), Archive (§4.3).
- **Empty State:** a Manual segment with zero members shows "Chưa có khách hàng nào trong phân khúc này"; a segment with zero linked campaigns shows "Chưa có chiến dịch nào nhắm đến phân khúc này" in the Campaigns table area.
- **Loading / Error State:** same conventions as §4/§4.1.
- **Navigation:** reached from Segment List row click, or from a Campaign Detail's Target Segment link.
- **Permissions:** page view is read-only for any authenticated staff; Edit/Duplicate/Archive buttons wrapped in `RouteGuard` (same as §4.1).

### 4.3 Archive (unblocked in Revision 2)

Archiving a segment sets `marketing_segments.status = 'Archived'` (DB §2, Revision 2). Effects:

- Removed from the **default** Segment List view (which filters to `status = 'Active'`) — a Status filter (All / Active / Inactive / Archived) on Segment List lets staff still find and view it.
- Removed from the Segment Builder's "Target Segment" picker for **new** campaigns (Campaign create only reads `status = 'Active'` segments) — campaigns that already target it keep working (`ON DELETE RESTRICT`, DB §6 — archiving is not deleting; there is no delete action for segments at all this sprint).
- **Restore** (the inverse action) sets `status` back to `'Active'`.
- **Inactive** is a lighter, reversible pause: same exclusion from the "new campaign" target-segment picker as Archived, but still shown by default on Segment List (distinguished by a Status badge) — the distinction from Archived is visibility on the default list, not query behavior.
- Actions wired: Segment List row action (Archive/Activate/Restore depending on current status), Segment Detail header, Segment Builder edit mode. Same `RouteGuard` gating as Edit/Duplicate (§12).

### 4.4 Duplicate

Creates a new segment (`Segment Type`, `condition_logic`, and — for Dynamic — every `marketing_segment_condition` row copied; for Manual, the member list is **not** copied, since duplicating hundreds of membership rows silently doesn't feel like the obviously-intended behavior of "duplicate a definition" — flagged as a judgment call, not a locked answer) with the name suffixed "(Copy)", landing on the new segment's Segment Builder in edit mode so the name/conditions can be adjusted before saving. No new field required — this is a pure copy operation the existing schema already supports.

---

## 5. Campaign List

**Route:** `/marketing/campaigns` | **Purpose:** browse, search, and manage all campaigns (Spec Feature 4).

- **Layout:** page header ("Campaigns" + "New Campaign" button) above a single table — same shape as Segment List.
- **Cards:** none (Campaign counts live on the Dashboard, §3, and the future Campaign Dashboard rollup, §6 — not duplicated here as cards).
- **Table columns:** Name, Target Segment (link → Segment Detail), Owner, Start Date, End Date, Status (badge, §5.1), Actions.
- **Filters:** Status (All / Draft / Active / Paused / Completed / Cancelled), Owner.
- **Search:** by campaign name.
- **Actions:** New Campaign (Modal form, §5.2); per-row: View (→ Campaign Detail), Edit (Modal form, prefilled), Status change (quick action from the row, §5.1).
- **Empty / Loading / Error State:** same conventions as Segment List (§4).
- **Pagination:** same server-side pattern as Segment List (DB §4 `idx_campaigns_status`/date indexes back the filters).
- **Navigation:** reached from Sidebar → Campaigns, or Dashboard's Campaign Count card.
- **Permissions:** list view-only for any authenticated staff; New/Edit/status-change wrapped in `RouteGuard` (`customers:manage`, pending confirmation).

### 5.1 Campaign Status

Exactly the 5 values locked in Spec §2.4/DB §2 — Draft, Active, Paused, Completed, Cancelled — rendered as a `Badge` using this codebase's existing status-badge convention (color mapping TBD at Development, same as `CUSTOMER_STATUS_BADGE_VARIANT`). Status is changeable from Campaign Detail (§5.3) and, as a quick action, from the List row. **Transition rules are locked (Revision 2):** `Draft → Active → Paused → Active → Completed`, or `Draft → Cancelled`. **Completed and Cancelled are terminal** — no transition out of either. The Status dropdown/quick-action only offers the valid next state(s) for the campaign's current status, not a free choice of all 5.

### 5.2 Create / Edit Campaign (Modal)

No separate "Campaign Builder" page — the brief's Screens list doesn't name one, and a flat field set (Name, Description, Target Segment, Start Date, End Date, Owner, Status) fits the existing Modal-form pattern already used for Customer/Product create-edit, so this document proposes a Modal rather than inventing a new full-page flow the brief didn't ask for.

- **Fields:** Name (text, required), Description (textarea, optional), Target Segment (`Select`, searchable, required — sourced from `status = 'Active'` segments only on **create**; editing an existing campaign keeps showing its already-targeted segment even if since archived, since the FK is `RESTRICT` and still valid), Start Date (date picker, required), End Date (date picker, optional/Nullable, confirmed DB §2 Revision 2), Owner (`Select`, sourced from `staff`, required), Status (defaults to Draft on create; editable on edit per the locked lifecycle, §5.1).
- **Validation:** End Date, if set, must not be before Start Date (DB §5).

### 5.3 Campaign Detail

**Route:** `/marketing/campaigns/[id]` | **Purpose:** read-only view of one campaign's plan + its status.

- **Layout:** header (Name, Status badge, Edit button) + an info panel (Description, Target Segment link, Start/End Date, Owner) + (future integration only, per Spec §2.6 — not built in this sprint) a placeholder area noting where send/engagement metrics will surface once Broadcast (§9) is real.
- **Cards:** none — this is a single record view, matching Segment Detail's non-card info-panel convention rather than Order Detail's line-item table (there's no line-item concept for a Campaign).
- **Actions:** Edit (Modal, §5.2), Status quick-change.
- **Empty / Loading / Error State:** same conventions as above.
- **Navigation:** reached from Campaign List row click, Dashboard, or a customer's Campaign History section (Spec §2.6).
- **Permissions:** view read-only; Edit/status-change wrapped in `RouteGuard`.

---

## 6. Campaign Dashboard

Per Spec Feature 5, this is **not a separate screen** — the brief's Screens list (this task) doesn't include one, and its 5 cards (Total, Running, Completed, Paused, Draft) are a subset of the same live status counts already shown as part of the Marketing Dashboard's Campaign Count card (§3) and the Campaign List's Status filter counts. Proposal: fold these 5 counts into a small stat row at the top of **Campaign List** (§5) rather than building a second dashboard page — flagged as a judgment call, since the brief named "Campaign Dashboard" as Feature 5 but didn't list it among this task's Screens to design standalone.

---

## 7. Birthday Center

**Route:** `/marketing/birthdays` | **Purpose:** surface customers by birthday proximity, one click from Customer Detail (Spec Feature 10).

- **Layout:** three sections, stacked vertically — Today, This Week, This Month — each its own table-card, matching the "Monthly Trends" vertical-stacking convention from Market Intelligence rather than tabs.
- **Cards:** a small count badge in each section's header (e.g. "Hôm nay (3)").
- **Tables:** each section lists matching customers — Name, Phone, Birthday (day/month), VIP badge if applicable — sortable by proximity within This Month.
- **Filters / Search:** none across sections (each section is already a fixed date-window bucket); a search-by-name box scoped to This Month's (largest) table only, since Today/This Week are typically short enough not to need one.
- **Actions:** click a customer row → Customer Detail (`/customers/[id]`, existing page, unmodified) — no other action on this screen (no message-send, since Broadcast is a placeholder, §9).
- **Empty State:** "Không có sinh nhật nào hôm nay/tuần này/tháng này" per section independently — one section being empty doesn't hide the others.
- **Loading State:** each section's table shows its own spinner independently.
- **Error State:** inline retry per section.
- **Navigation:** reached from Sidebar → Birthday Center, or Dashboard's two Birthday cards (§3), which land here scrolled to the matching section.
- **Permissions:** view-only, no RouteGuard — any authenticated staff (no mutating action exists here).

---

## 8–11. Broadcast / Loyalty / Voucher Placeholders

All three (Spec Features 7–9) share one design, differing only in which channels/concepts are listed:

- **Purpose:** show that the feature exists on the roadmap without implying it works.
- **Layout:** centered empty-state-style panel — icon, title ("Trung tâm Gửi tin" / "Loyalty" / "Voucher"), and a "Sắp ra mắt" (Coming Soon) message — same visual language as the Sidebar's own "Sắp có" badge, reused rather than invented fresh.
- **Cards:**
  - **Broadcast** (`/marketing/broadcast`): 4 small cards, one per channel (Facebook, Zalo, Email, SMS), each showing a channel icon + "Sắp ra mắt" — no send button, no compose form, no channel connection status (Spec §2.7 — no send capability of any kind).
  - **Loyalty** (`/marketing/loyalty`): 3 small cards — Points, Tier, Rewards — each "Sắp ra mắt," no numbers, no ledger (Spec §2.8).
  - **Voucher** (`/marketing/voucher`): a single "Sắp ra mắt" panel, no code list (Spec §2.9).
- **Tables / Filters / Search:** none on any of the three — nothing to browse yet.
- **Actions:** none — every control that might normally appear (compose, redeem, issue) is entirely absent, not present-but-disabled (Design Principle 4).
- **Empty / Loading / Error State:** not applicable — these pages have no data to load, so they render their Coming Soon content immediately and unconditionally.
- **Navigation:** reached only from their Sidebar child rows (§1); no other screen links into them.
- **Permissions:** view-only, no RouteGuard — nothing to gate.

---

## 12. Components

New, reused-shape components this module needs (no new visual style, only new data-bound instances of existing primitives):

| Component | Reuses | New behavior |
|---|---|---|
| `SegmentTable` | `CustomerTable`'s row/column/pagination shape | Segment-specific columns (§4) |
| `SegmentConditionRow` | Existing repeatable-row + `Select`/`Input` primitives | Field/Operator/Value editing, shape varies by Field (§4.1) |
| `SegmentLivePreview` | `StatCard` (Count/Reach) + a small paginated list | Debounced re-fetch on condition change (§4.1) |
| `SegmentTypeToggle` | Existing toggle/segmented-control pattern (if any exists) or a simple two-button group | Dynamic/Manual switch (§4.1) |
| `CampaignTable` | `CustomerTable`'s shape | Campaign-specific columns (§5) |
| `CampaignFormModal` | `Modal` + `CustomerForm`'s field-layout convention | Campaign's 7 fields (§5.2) |
| `CampaignStatusBadge` | `Badge` + `CUSTOMER_STATUS_BADGE_VARIANT`'s mapping convention | 5-value Campaign status colors (§5.1) |
| `BirthdaySection` | Existing table-card | Reused 3× for Today/Week/Month (§7) |
| `ComingSoonPanel` | Sidebar's existing "Sắp có" visual language, promoted to a full-page treatment | Reused 3× for Broadcast/Loyalty/Voucher (§8–11) |
| `MarketingSidebarGroup` | `Sidebar.tsx`'s existing row rendering | **New**: expand/collapse parent-child grouping (gap #2) |

No charting library, no drawer/sheet primitive, and no new Modal variant are introduced — everything above composes existing primitives.

---

## 13. User Journey

**Journey A — build and launch a segment-targeted campaign:**
1. Staff opens Marketing → Customer Segments, clicks New Segment.
2. Picks Dynamic, adds conditions (e.g. Lifetime Revenue > X AND Last Purchase > 90 days) — Live Preview shows Customer Count updating as conditions are added.
3. Saves — lands on Segment Detail showing the same live stats.
4. Navigates to Campaigns, clicks New Campaign, selects the segment just created as Target Segment, sets dates/owner, saves as Draft.
5. Later, opens Campaign Detail, changes Status to Active.
6. Any customer in that segment now shows this campaign under their Customer Detail's Campaign History (Spec §2.6).

**Journey B — birthday outreach:**
1. Staff opens Marketing Dashboard, sees "Birthday Today: 3."
2. Clicks the card → Birthday Center, scrolled to Today.
3. Clicks a customer → Customer Detail, to call/follow up manually (no automated send exists, Spec §2.7).

**Journey C — reuse a segment across campaigns:**
1. Staff opens an existing segment's Detail, sees 2 campaigns already targeting it.
2. Duplicates it for a variant with one changed condition, without disturbing the original or its existing campaigns.

---

## 14. Responsive Behavior

- **Mobile:** every table (Segment List, Campaign List, Birthday sections, Segment Detail's member/condition lists) becomes a stacked card list instead of a wide table — same responsive collapse already used by `CustomerTable` at narrow widths. Segment Builder's two-column (form/preview) layout stacks to form-above-preview. Dashboard's 7 `StatCard`s wrap into a 2-column grid.
- **Desktop:** tables render in full, multi-column form. Segment Builder shows form and Live Preview side by side. Dashboard cards render in a single row (wrapping only past 7 items if the viewport is narrow).

---

## 15. Accessibility Notes

- All new interactive elements (Condition Builder rows, AND/OR toggle, Status dropdown, Archive/Duplicate buttons) are reached and operated via keyboard, consistent with the existing `Select`/`Button`/`Modal` primitives' current behavior — no new custom widget is introduced that would need its own keyboard handling built from scratch.
- Status badges (`CampaignStatusBadge`, Segment Type badge) carry text, not color alone, matching the existing `Badge` convention already used for `CUSTOMER_STATUS_OPTIONS`.
- Live Preview's debounced auto-refresh (§4.1) announces its updated Customer Count via the same live-region pattern (if any) already used elsewhere for async updates — flagged as a Development-phase detail if no such pattern currently exists in this codebase, rather than asserting one does.
- The expandable Marketing Sidebar group (§1) needs a clear expanded/collapsed state exposed to assistive tech (e.g. `aria-expanded`) — called out explicitly since it's a new interaction pattern in this codebase (gap #2).

---

## 16. Future Expansion

- **Broadcast (Feature 7):** once real sending is approved, Campaign Detail's placeholder area (§5.3) becomes where send status/engagement would surface, and Customer Detail's Campaign History (Spec §2.6) would gain real send/open/click events instead of plan-level association only.
- **Loyalty (Feature 8) / Voucher (Feature 9):** their placeholder pages (§8–11) are the landing points for future Points/Tier/Rewards and Voucher screens — no structural rework of Marketing's own screens is anticipated, since neither integrates with Segments/Campaigns in this sprint.
- **AI Marketing (named in `MARKETING_DATABASE.md`'s Database Principles, not yet specified anywhere else):** no screen in this document anticipates it beyond the same channel-agnostic table design DB §1 already called out — any future AI-driven segment suggestion or campaign optimization would be a new Business Design spec of its own, not an extension implied by this UI document.
- **Segment Archive (§4.3):** the clearest near-term follow-up — needs its own small Database Design revision before Development can wire the button already placed by this document.
- **Nested Sidebar groups (gap #2):** if approved here, this becomes the first reusable pattern for any future module that also wants a parent/children menu shape (e.g. a hypothetical future "Reports" regrouping) — flagged as a precedent-setting decision, not just a one-off for Marketing.

---

UI Design Revision 2 — **LOCKED**. Proceeding to Development.
