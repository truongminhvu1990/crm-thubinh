# Marketing Automation — UI Design

**Module:** Marketing Automation
**Status:** Revision 1 — **LOCKED**. Reviewed 2026-07-21: the 2 process-note discrepancies (Next Run, Dashboard card count), 7 disclosed judgment calls, and 2 new UI patterns (wizard shell, bulk actions) are accepted as designed — approved to proceed to Development.
**Phase:** UI design only. No React code, component, page, or route is created by this document.
**Based on:** `docs/MARKETING_AUTOMATION_SPEC.md` (Revision 2, LOCKED) and `docs/MARKETING_AUTOMATION_DATABASE.md` (Revision 2, LOCKED — Database Freeze confirmed). This document does not redesign, reinterpret, or add business logic or schema. Every screen, field, and control below traces back to an already-locked section of one of those two documents, or to an existing, already-shipped UI convention from Marketing Foundation (`docs/MARKETING_UI.md`, LOCKED) — cited inline.

**Process note:** two gaps exist between what this task's Screens/Dashboard/List sections ask for and what the two locked documents actually contain. Both are disclosed here and given a proposed, non-blocking resolution rather than silently designed around or silently expanded into new business rules — full detail in §8 Self Review:
1. **"Next Run"** (Automation List column) has no backing column in `docs/MARKETING_AUTOMATION_DATABASE.md` — no scheduler/cron table was designed (DB doc §8, "Explicitly NOT designed"). Resolved here as a client-computed, explicitly-labeled estimate, never a stored value.
2. **Automation Dashboard's card list** — `docs/MARKETING_AUTOMATION_SPEC.md` Revision 2 locked exactly 5 KPI cards (Total Automations/Active/Paused/Today's Runs/Failed Runs), but this task's brief adds Recent Executions/Latest Broadcast/Latest Voucher under the same "Cards" heading. Resolved here by treating the 5 as KPI Stat Cards (the locked set, unchanged) and the 3 as separate list/summary panels beneath them — additive dashboard content, not a 6th–8th KPI card, so nothing contradicts the Spec's explicit "narrowed to exactly 5" decision.

---

## 1. Navigation Structure

### 1.1 Sidebar

The Marketing group (`components/Sidebar.tsx`, using the reusable `SidebarGroup` primitive — `components/shared/SidebarGroup.tsx`, `docs/MARKETING_UI.md` §1, explicitly built generic/reusable for exactly this kind of extension) gains **one new child entry**, inserted between Birthday Center and Broadcast per this task's requested order:

```
Marketing
├─ Dashboard              /marketing            (unchanged)
├─ Customer Segments      /marketing/segments    (unchanged)
├─ Campaigns              /marketing/campaigns   (unchanged)
├─ Birthday Center        /marketing/birthdays   (unchanged)
├─ Automation             /marketing/automation  (NEW — this document)
├─ Broadcast              /marketing/broadcast   (existing "Coming Soon" — upgraded, §1.3)
├─ Loyalty                /marketing/loyalty     (existing "Coming Soon" — upgraded, §1.3)
└─ Voucher                /marketing/voucher     (existing "Coming Soon" — upgraded, §1.3)
```

This is purely additive to the Sidebar's data array (one new `SidebarLeaf` entry) — the `SidebarGroup` component itself, the Marketing group's icon/label, and the other 7 entries are untouched. "Automation becomes a first-class module" (task brief) is satisfied by giving it its own top-level Sidebar entry rather than nesting it under an existing screen.

### 1.2 Automation's own route tree

No second-level Sidebar nesting is introduced (the Sidebar's `SidebarGroup` is one level deep only, matching every existing group). Automation's internal navigation instead follows the **Segments precedent** (`app/marketing/segments/`), the closest existing analogue — a multi-condition, wizard-style builder with its own routed pages, as opposed to Campaigns' single-step modal (`CampaignFormModal.tsx`) which Automation's 5-step wizard (§3.4) is too complex to reuse:

```
/marketing/automation                 → Automation Dashboard + Automation List (two tabs, one route — §1.3)
/marketing/automation/new             → Create Automation (5-step wizard)
/marketing/automation/[id]            → Automation Detail (includes embedded Run History)
/marketing/automation/[id]/edit       → Edit Automation (same 5-step wizard, pre-filled)
```

Execution Log (per-recipient detail within one Run) is **not** a separate route — it's a drill-down opened from a Run History row via `components/ui/Modal` (§3.5), the same "detail-in-a-dialog" pattern already used for `CampaignFormModal`.

### 1.3 Two-tab landing page (Dashboard + List)

`docs/MARKETING_AUTOMATION_SPEC.md`'s brief lists "Automation Dashboard" and "Automation List" as separate screens, but only **one** Sidebar entry ("Automation") is specified — the same shape Inventory already solved (`app/inventory/page.tsx`, two tabs: Inventory List / Batch View, per `[[project-rules-v1]]`'s 2026-07-17 Increment 1 note). `/marketing/automation` is designed as one route with two tabs, **Dashboard** (default) and **Automation List** — not two Sidebar rows, not two routes. This reuses an existing in-codebase pattern rather than inventing a new one.

---

## 2. Screen Flow

```
Sidebar "Automation"
        │
        ▼
┌───────────────────────────┐
│ /marketing/automation      │  Tab: Dashboard (default) ⇄ Tab: Automation List
└──────────┬──────────────┬─┘
           │              │
   [New Automation]   [row click]
           │              │
           ▼              ▼
  /marketing/automation/new   /marketing/automation/[id]  ──[Edit]──►  /marketing/automation/[id]/edit
   (5-step wizard)              Automation Detail                        (same wizard, pre-filled)
           │                   ├─ General Info                              │
           │                   ├─ Trigger / Frequency                       │
      [Save, Step 5]           ├─ Campaign Reference                    [Save, Step 5]
           │                   ├─ Run History (embedded, paginated)          │
           │                   │      └─[row click]→ Execution Log (Modal)  │
           │                   ├─ Execution Statistics                      │
           │                   └─ Activity Timeline                         │
           └──────────────────►│◄─────────────────────────────────────────┘
                          (both redirect back to Detail on save)
```

Bulk Actions (Automation List, §3.2) apply Activate/Pause/Cancel directly from the list — no intermediate screen, same locked status-transition rule as the single-record Actions column (§3.2), just applied to a multi-row selection.

Broadcast (§3.6), Loyalty (§3.7), and Voucher (§3.8) are **not** reached through the Automation flow — they keep their own existing Sidebar entries and existing routes (`/marketing/broadcast`, `/marketing/loyalty`, `/marketing/voucher`), upgraded in place from `ComingSoonPanel` to real (simulation-only / foundation-only / no-redemption) screens. A Manual Broadcast automation's Run History/Execution Log (§3.5) is the actual send-simulation detail; the standalone Broadcast screen (§3.6) is a cross-automation rollup (Audience Preview tool + history across all Manual Broadcast automations), not a duplicate data model.

---

## 3. Page Layouts

### 3.1 Automation Dashboard (tab 1 of `/marketing/automation`)

**Stat Cards row** (`components/ui/StatCard`, same row layout as the existing Marketing Dashboard's cards, `docs/MARKETING_UI.md` §2) — exactly the 5 locked by Spec Rev.2, in this order:

| Card | Source |
|---|---|
| Total Automations | `COUNT(*)` from `marketing_automations` |
| Active | `COUNT(*) WHERE status = 'Active'` |
| Paused | `COUNT(*) WHERE status = 'Paused'` |
| Today's Runs | `COUNT(*)` from `marketing_automation_runs WHERE started_at::date = today` |
| Failed Runs | `COUNT(*)` from `marketing_automation_runs WHERE status = 'Failed'` (scope: today, matching "Today's Runs" — see §8 judgment call) |

All 5 computed live, no cache table (matches DB doc §8's "no cache" convention throughout this schema).

**Below the Stat Cards**, three list/summary panels (§ Process note item 2 — additive, not additional KPI cards):
- **Recent Executions** — last 10 `marketing_automation_runs` rows across all automations, newest first (Automation Name, Status badge, Started At, Triggered By). Each row links to that Automation's Detail page.
- **Latest Broadcast** — the most recent run where the parent automation's `automation_type = 'Manual Broadcast'`: name, run status, recipient count (`COUNT` from `marketing_automation_logs` for that run), started at.
- **Latest Voucher** — the most recently created `marketing_vouchers` row: code, status badge, `start_date`–`end_date`.

Empty state (no automations exist yet): Stat Cards show `0` (not placeholder dashes — matches `StatCard`'s existing `placeholder` prop semantics for "not yet computed" vs. a real zero), the 3 panels show a centered "No automations yet — Create your first automation" message with a `[New Automation]` button, reusing the same empty-state visual language as `docs/MARKETING_UI.md`'s Segment/Campaign List empty states.

### 3.2 Automation List (tab 2 of `/marketing/automation`)

**Table columns** (per task brief, each mapped to a DB doc §2.1 field):

| Column | Source | Rendering |
|---|---|---|
| ☐ (select) | — | Checkbox, header checkbox = select-all-on-page (§8 — new pattern) |
| Name | `marketing_automations.name` | Text, links to Detail |
| Template | `automation_type` | Badge, one color per the 7 fixed values (reusing `CampaignStatusBadge`'s status→variant mapping pattern, a new `AUTOMATION_TYPE_BADGE_VARIANT` map) |
| Status | `status` | Badge, reusing `CampaignStatusBadge`'s exact 5-value palette (`Draft`=muted, `Active`=success, `Paused`=warning, `Completed`=secondary, `Cancelled`=destructive) — same lifecycle, same colors, per Spec Rev.2 decision #3's "reuses Campaign's locked lifecycle" |
| Frequency | `frequency` | Plain text (`Once`/`Daily`/`Weekly`/`Monthly`) |
| Last Run | live `MAX(started_at)` from `marketing_automation_runs` for this automation | Relative timestamp ("2 giờ trước") + that run's Status badge; "Chưa chạy" (never run) if no rows |
| Next Run | **not a stored field** (§ Process note item 1) | Computed client-side **only** when `trigger_type = 'Daily Schedule'` and `status = 'Active'`: Last Run + 1/7/30 days per `frequency`, prefixed "Dự kiến" (estimated). Shows "—" for `Manual` trigger, `Draft`/`Paused`/`Completed`/`Cancelled` status, or never-run automations |
| Version | `version` | `v1`, `v2`, ... |
| Actions | — | Row menu: View, Edit (disabled if `status ∈ {Completed, Cancelled}`, matching Spec Rev.2 decision #3's terminal-state rule), Activate/Pause/Cancel (whichever transitions are valid from the current `status`, same lifecycle rule) |

**Search:** by Name (client-debounced, server-side `ILIKE`, matching `SearchInput` + Segment List's existing search pattern).
**Filter bar** (reusing the existing Marketing filter-row layout): Status (All / Draft / Active / Paused / Completed / Cancelled), Template (All / 7 types), Frequency (All / Once / Daily / Weekly / Monthly), Trigger (All / Manual / Daily Schedule).
**Sort:** Name, Status, Last Run, Version — column-header sort, same interaction as existing sortable Marketing tables.
**Pagination:** `MarketingPagination` component, reused as-is (same `MARKETING_PAGE_SIZE` constant — extending, not duplicating, `lib/marketing/marketing.constants.ts`).
**Bulk Actions** (§8 — new pattern in this codebase): selecting ≥1 row reveals a selection toolbar ("N selected — Activate / Pause / Cancel / Clear"). Each bulk action only applies to the subset of selected rows for which that transition is currently valid (per the same locked lifecycle used in the single-row Actions column) — rows for which it isn't valid are silently skipped and a summary toast reports "Đã cập nhật X/N automation" (no new bulk-specific business rule; strictly a multi-row application of the existing single-row rule).

### 3.3 Automation Detail (`/marketing/automation/[id]`)

Sectioned single page (matches Segment Detail's layout shape — header + stacked sections, `docs/MARKETING_UI.md` §4.2):

- **Header:** Name, Status badge, Template badge, `[Edit]` button (same disabled-when-terminal rule as §3.2), Activate/Pause/Cancel quick actions.
- **General Information:** Name, Description, Template, created by / created at / updated at.
- **Trigger:** `trigger_type` (Manual / Daily Schedule).
- **Frequency:** `frequency` value, shown only when `trigger_type = 'Daily Schedule'` (a `Manual`-trigger automation's frequency is not operative — still stored per DB doc, but visually de-emphasized/hidden here to avoid implying a schedule that doesn't run itself; see §8 judgment call).
- **Target Segment:** Segment name (from `marketing_segments`, read-only link to Segment Detail — reusing Marketing Foundation's existing Segment Detail page, not a new view).
- **Campaign Reference:** zero or more linked Campaigns (via `marketing_campaign_automations`), each shown as a chip/badge linking to that Campaign's existing Detail page (`/marketing/campaigns/[id]`) — reusing Campaign Detail as-is, not duplicating campaign fields here. Empty state: "Chưa liên kết chiến dịch nào" + a `[Link Campaign]` action (a simple picker over existing Active/Draft campaigns — reuses the existing Campaign list-fetch, not a new query surface).
- **Run History (embedded, paginated):** table matching §3.5's Run History screen exactly (same columns/component, reused here filtered to this automation) — a "View Full Run History" link is not needed since this embedded table already paginates the complete set for this one automation.
- **Execution Statistics:** small stat row (not full `StatCard`s — compact inline stats, matching Segment Preview's "Customer Count / Estimated Reach" compact treatment, `docs/MARKETING_UI.md` §4.1) — Total Runs, Success Rate (`Success` / non-`Pending`/`Running` runs), Last Success, Last Failure — all live-computed from this automation's `marketing_automation_runs`.
- **Activity Timeline:** reuses the existing `activity_logs` table / `logActivity()` (`lib/activityLog.service.ts`) filtered to `entity = 'marketing_automation'`, `entity_id = this automation's id` — same list-rendering pattern as `CustomerNotesTimeline.tsx`'s timeline, not a new timeline component design.

### 3.4 Create / Edit Automation — 5-step wizard

Routed pages (`/marketing/automation/new`, `/marketing/automation/[id]/edit`), not a modal (§1.2) — a new **multi-step wizard shell** is required since no wizard/stepper component exists anywhere in this codebase today (§8 — new pattern, same category of disclosure as Inventory's Drawer / Marketing's SidebarGroup). Linear, back/next, no skip-ahead until the current step's required fields are valid:

1. **Template** — pick one of the 7 `automation_type` values (card-grid selector, one card per template, matching `ComingSoonPanel`'s existing card-grid visual style) + Name + Description fields.
2. **Audience** — pick a Target Segment (reuses the existing Segment picker/list — same data Campaign creation already reads, no new query).
3. **Schedule** — Trigger (Manual / Daily Schedule) and, only if Daily Schedule, Frequency (Once / Daily / Weekly / Monthly). Manual hides the Frequency control entirely (consistent with §3.3's Detail-page treatment, not just visually de-emphasized here since it's still being authored).
4. **Review** — read-only summary of Steps 1–3, plus (Edit mode only) a visible "Saving will increment version to vN+1" notice, surfacing the `version` field's behavior (§8) before commit.
5. **Save** — commits the automation (`Draft` status on create, per DB default; on edit, `status` is unchanged by the wizard — status changes happen via the List/Detail Activate/Pause/Cancel actions, not the wizard, keeping the wizard focused on definition, not lifecycle). Redirects to Automation Detail.

Each step's fields map 1:1 to `marketing_automations` columns (§ DB doc §2.1) — no field is introduced that isn't already in the locked schema.

### 3.5 Run History (screen, embedded in Detail §3.3) + Execution Log (Modal drill-down)

**Run History table columns** (per task brief, mapped to DB doc §2.2, post-Revision-2 rename):

| Column | Source |
|---|---|
| Started | `started_at` |
| Finished | `finished_at` ("—" while `status ∈ {Pending, Running}`) |
| Duration | `duration_ms`, formatted (e.g. "1.2s") |
| Status | `status` — badge, 5 values (`Pending`/`Running`/`Success`/`Failed`/`Cancelled`), new `AUTOMATION_RUN_STATUS_BADGE_VARIANT` map (`Pending`=muted, `Running`=default/primary, `Success`=success, `Failed`=destructive, `Cancelled`=secondary) |
| Error Message | `error_message` ("—" when null; truncated with a tooltip/expand for long text) |
| Triggered By | `triggered_by` (Manual / Daily Schedule) |

Row click (only when `status ∉ {Pending, Running}`, i.e. the run has finished) opens the **Execution Log** as a `components/ui/Modal` dialog: a paginated table of that run's `marketing_automation_logs` rows — Customer (name, links to Customer Detail), Result (`Pending`/`Success`/`Failed` badge — this is the *unchanged* `marketing_automation_logs.result`, distinct from the run-level `status` column, per DB doc §8 item 8's disclosed note that the two are no longer reconciled by a "mixed outcome" run status), Message. This is where Broadcast's "Delivery Status" (§3.6) is actually seen for a Manual Broadcast run. **Retry Failed** button in this modal's header, enabled only when ≥1 log row has `Result = Failed` — re-simulates just those recipients (creates a new run rather than mutating history, consistent with the append-only design of both tables, DB doc §7 Migration Strategy step 2).

### 3.6 Broadcast (`/marketing/broadcast`, upgraded from `ComingSoonPanel`)

Simulation-only, per Spec Rev.2 — no channel picker, no Email/SMS/Zalo/Facebook/TikTok UI of any kind.

- **Audience Preview / Estimated Reach:** a segment picker (reusing Marketing Foundation's Segment Preview computation, `docs/MARKETING_UI.md` §4.1 — not a new counting mechanism) — lets a user check reach *before* creating a Manual Broadcast automation. Does not itself send/create anything; it's a preview-only tool.
- **Execution History:** all `marketing_automation_runs` rows whose parent automation's `automation_type = 'Manual Broadcast'`, across every such automation — same Run History table shape as §3.5, unfiltered by automation, with an added "Automation" column linking back to that automation's Detail page.
- **Delivery Summary:** aggregate counts (Success / Failed / Pending) across all Manual Broadcast runs' logs — a compact stat row, same treatment as §3.3's Execution Statistics.

Creating a new broadcast is **not** a separate form on this page — per §2, it's just Create Automation (§3.4) with Template = "Manual Broadcast" selected in Step 1. This page is a rollup/monitoring surface, not a duplicate creation flow.

### 3.7 Loyalty (`/marketing/loyalty`, upgraded from `ComingSoonPanel`)

Foundation only, per Spec Rev.2 — no automatic point calculation UI (no "run this rule" button anywhere).

- **Rule List:** table of `marketing_loyalty_rules` — Name, Points Value, Status badge (Active/Inactive), Created By, Actions (Edit, Toggle Active/Inactive). Standard search/filter/paginate, same conventions as §3.2.
- **Rule Detail:** Name, Description, Points Value, Status — a simple read/edit form (no wizard needed; a single flat entity, unlike Automation).
- **Balance Summary:** searchable-by-customer view — pick/search a customer, show their live `SUM(points)` balance (never a stored value, DB doc §2.5) plus a small breakdown (Earned total / Adjusted total / Expired total, each `SUM(points) WHERE transaction_type = X`).
- **Transaction History:** paginated `marketing_loyalty_transactions` list — Customer, Type badge (`Earn`/`Adjust`/`Expire` — new `LOYALTY_TXN_TYPE_BADGE_VARIANT` map), Points (signed, colored green/red by sign), Rule (if cited), Note, Date. Filterable by Customer and Type.

No "grant points" action is designed with a business rule attached (e.g. "1 point per purchase") — per Spec Rev.2's "No automatic point calculation," a manual transaction-entry form (Customer, Type, Points, Rule (optional), Note) is the only write path, matching the DB design's ledger shape exactly.

### 3.8 Voucher (`/marketing/voucher`, upgraded from `ComingSoonPanel`)

No redemption UI anywhere, per Spec Rev.2.

- **Voucher List:** Code, Name, **Status** badge (`Draft`/`Active`/`Expired`/`Disabled` — new `VOUCHER_STATUS_BADGE_VARIANT` map), **Validity** (`start_date`–`end_date`, formatted as a range; "—" when either is null), **Assignment** (assigned customer name + link, or "Chưa gán" if `customer_id` is null), Actions (Edit, status change). Search by Code/Name, filter by Status, paginate.
- **History:** per-voucher, not a separate top-level screen — shown inside a Voucher Detail (row expand or a lightweight Modal, not a full routed page, since a voucher has few enough fields not to need Segment/Automation-style dedicated Detail routes) via the same Activity Timeline pattern as §3.3 (`activity_logs` filtered to `entity = 'marketing_voucher'`).

Voucher creation is a simple form (Code, Name, Description, Customer (optional picker), `start_date`, `end_date`) — no wizard, matching Rule Detail's flat-entity treatment (§3.7), not Automation's multi-step complexity.

---

## 4. Component Reuse

Every component below already exists; none is redesigned. New components (§8 lists them explicitly as new, not reused) are additions in the same style, not replacements.

| Existing component | Reused for |
|---|---|
| `components/ui/Card` | Dashboard panel containers, Rule/Voucher card-style pickers |
| `components/ui/StatCard` | Automation Dashboard's 5 KPI cards (§3.1) |
| `components/ui/Badge` | All status/template/type badges (via new `*_BADGE_VARIANT` maps, same pattern as `CampaignStatusBadge`) |
| `components/ui/Button` | All actions — primary/secondary/destructive variants already defined |
| `components/ui/Input`, `components/ui/SearchInput` | Form fields, list search boxes |
| `components/ui/Select`, `CreatableSelect` | Template/Status/Frequency/Trigger dropdowns, filter dropdowns |
| `components/ui/Modal` | Execution Log drill-down (§3.5), Voucher History (§3.8), Link Campaign picker (§3.3) |
| `components/ui/AlertDialog` | Cancel/Pause confirmation, Bulk Action confirmation |
| `components/marketing/MarketingPagination` | Every paginated list in this document (List, Run History, Transaction History, Voucher List) |
| `components/shared/SidebarGroup` | Sidebar's Marketing group, extended with one new leaf (§1.1) — component itself unmodified |
| `CampaignStatusBadge`'s status→variant mapping pattern | Template for `AUTOMATION_STATUS_BADGE_VARIANT` (identical 5 values/colors, reused verbatim) and the 3 new badge-variant maps (§3.2/§3.5/§3.7/§3.8) |
| `ComingSoonPanel`'s card-grid visual style | Template picker's card grid (§3.4 Step 1) — visual language reused, not the placeholder component itself (Broadcast/Loyalty/Voucher pages stop using `ComingSoonPanel` once upgraded) |
| `CustomerNotesTimeline`'s timeline rendering pattern | Activity Timeline (§3.3, §3.8) |
| Segment Preview's live-count computation | Broadcast's Audience Preview/Estimated Reach (§3.6) |
| `lib/marketing/marketing.constants.ts` (`MARKETING_PAGE_SIZE`, `*_OPTIONS` arrays) | Extended, not duplicated — new `AUTOMATION_TYPE_OPTIONS`, `AUTOMATION_STATUS_OPTIONS` (reuses `CAMPAIGN_STATUS_OPTIONS`'s 5 values as-is), `FREQUENCY_OPTIONS`, `RUN_STATUS_OPTIONS`, `VOUCHER_STATUS_OPTIONS`, `LOYALTY_TXN_TYPE_OPTIONS` follow the same file/shape |

**Not reused, genuinely new (disclosed in §8, same category as Inventory's Drawer / Marketing's SidebarGroup when each was first introduced):**
- A multi-step wizard shell (§3.4) — no stepper/wizard primitive exists in this codebase.
- Row-selection + bulk-action toolbar (§3.2) — no bulk-select pattern exists in this codebase.

---

## 5. Responsive Behavior

Matches `docs/MARKETING_UI.md`'s existing Mobile/Desktop conventions (already shipped, not redesigned) — extended to this module's new screens:

| Element | Desktop | Tablet | Mobile |
|---|---|---|---|
| **Tables** (List, Run History, Transaction History, Voucher List) | Full table, all columns | Full table, lower-priority columns hidden (Version, Triggered By) with a "more" overflow indicator — same breakpoint behavior as existing Segment/Campaign tables | Card-per-row (each row's key fields stacked vertically — Name/Status/Last Run for Automation List, matching existing Marketing table→card collapse pattern) |
| **Cards** (Stat Cards, §3.1) | 5-across row | 2–3 per row, wraps | 1 per row, stacked |
| **Filters** (§3.2 filter bar) | Inline row | Inline row, wraps to 2 lines if needed | Collapsed behind a "Filters" button opening a bottom sheet — same collapse behavior as existing Segment List filters |
| **Dialogs** (Execution Log Modal, confirmations) | Centered modal, fixed max-width | Centered modal, same as desktop | Full-screen sheet (existing `components/ui/Modal` mobile behavior — unmodified) |
| **Sidebar** | Expanded, `SidebarGroup` open/closed per user toggle | Same as desktop | Collapses to the existing off-canvas drawer (unmodified `Sidebar.tsx` mobile behavior) — the new "Automation" entry inherits this automatically, no special-casing needed |
| **Wizard** (§3.4, new) | Horizontal step indicator, all 5 steps visible | Horizontal step indicator, condensed labels | Vertical/collapsed step indicator showing only current + adjacent step, "Step 2 of 5" text label as the primary orientation cue |
| **Bulk Actions toolbar** (§3.2, new) | Inline row above the table | Same | Sticky bottom bar (thumb-reachable, matching this app's existing mobile action-bar convention on other List pages) |

---

## 6. Accessibility

Matches `docs/MARKETING_UI.md`'s existing accessibility notes (color-by-status always paired with text label, never color alone — already the rule `CampaignStatusBadge` follows and every new badge map here follows identically):

- **Keyboard Navigation:** every interactive element (wizard steps, table rows/actions, bulk-select checkboxes, modal controls) reachable and operable via Tab/Shift+Tab/Enter/Space, same as existing Marketing screens' current keyboard support.
- **Focus Order:** wizard steps follow visual top-to-bottom, left-to-right reading order within each step; on step change, focus moves to the new step's heading (announced, not silently shifted); Modal open moves focus to the modal's first focusable element and traps it until close (existing `components/ui/Modal` behavior, unmodified).
- **ARIA Labels:** bulk-select header checkbox labeled "Select all on this page"; per-row checkboxes labeled "Select {automation name}"; status/template/type badges carry their text value in the accessible name (already true — Badge renders text content, never icon-only); wizard step indicator uses `aria-current="step"` on the active step.
- **Color Contrast:** all new badge-variant maps reuse the exact existing `Badge` component variants (`success`/`warning`/`destructive`/`secondary`/`muted`/`default`) — no new colors introduced, so no new contrast audit is needed beyond what's already validated for those variants.
- **Loading:** skeleton/spinner states matching existing Marketing List/Detail loading treatment — Dashboard Stat Cards show `StatCard`'s existing `placeholder` state, tables show a row-skeleton, Detail page shows a section-skeleton.
- **Empty State:** every list/table has a named empty-state message + primary action (§3.1's Dashboard empty state, "no runs yet" in Run History, "no transactions yet" in Transaction History, "no vouchers yet" in Voucher List) — never a bare blank table.
- **Error State:** failed data fetch shows the existing app-wide error-state pattern (retry button + message); a `Failed` Run's `error_message` is surfaced inline in Run History (§3.5), not hidden behind a click.

---

## 7. User Journey

**Journey A — Staff creates and runs a Birthday Greeting automation:**
Sidebar → Automation → (Dashboard tab, sees "0 Active") → switches to List tab → `[New Automation]` → Wizard Step 1: selects "Birthday Greeting" template, names it → Step 2: picks an existing "VIP Customers" segment → Step 3: Trigger = Daily Schedule, Frequency = Daily → Step 4: reviews summary → Step 5: Save → redirected to Automation Detail, `status = Draft`. Staff clicks `[Activate]` on the Detail header → `status = Active`. (No run happens automatically from this UI — Daily Schedule's actual invocation mechanism is out of this document's and the DB design's scope, per Spec Rev.2 decision #4; this journey ends at "Active," matching what's actually buildable from the locked design.)

**Journey B — Staff reviews a Manual Broadcast's delivery:**
Sidebar → Broadcast → Audience Preview: picks a segment, sees Estimated Reach → (creates the actual broadcast via Automation → New → Template = Manual Broadcast, per §3.6's note) → back on Broadcast page's Execution History, finds the new run → clicks it → Execution Log Modal opens, sees per-customer `Success`/`Failed`/`Pending` rows → clicks `[Retry Failed]` → new run created for just the failed subset.

**Journey C — Staff records a manual loyalty point grant:**
Sidebar → Loyalty → Transaction History tab → `[New Transaction]` → picks Customer, Type = Earn, Points = 50, optional Rule, Note → Save → Balance Summary for that customer updates (live `SUM`, no page-specific "recalculate" step needed).

**Journey D — Staff bulk-pauses several automations:**
Sidebar → Automation → List tab → checks 4 rows (mixed statuses) → selection toolbar appears → clicks `[Pause]` → confirmation dialog lists how many of the 4 are actually pausable (`status = Active` only) → confirms → toast "Đã tạm dừng 3/4 automation" (1 skipped because it was already Draft).

---

## 8. Self Review

**Judgment calls made, disclosed rather than silently decided:**
1. **"Next Run" has no backing field** (§ Process note item 1) — designed as a client-computed estimate (`Last Run + N days` per `frequency`), shown only for Active + Daily Schedule automations, explicitly labeled "Dự kiến" (estimated) so it's never mistaken for a guaranteed scheduled execution. No `next_run_at` column is proposed (would violate the Field rule / DB doc's explicit "Explicitly NOT designed" scheduler exclusion).
2. **Dashboard's 8 vs. 5 "cards"** (§ Process note item 2) — resolved as 5 locked KPI Stat Cards + 3 additive list/summary panels, not 8 KPI cards, to avoid contradicting Spec Rev.2's explicit narrowing decision.
3. **"Failed Runs" card's time scope** — modeled as "today" to match "Today's Runs," though the Spec doesn't state this explicitly; an all-time Failed count was also plausible but would make the two adjacent cards use different time windows without any visual distinction, which seemed more likely to mislead.
4. **Frequency shown but de-emphasized for Manual-trigger automations** (§3.3, §3.4) — the column exists and is populated (per DB doc, `frequency` has no cross-column dependency on `trigger_type`, DB doc §8 item 5) but a `Manual`-trigger automation's frequency value has no operative effect, so the UI visually subordinates it rather than hiding the stored value outright.
5. **Two new, genuinely un-precedented UI patterns** (§4): a multi-step wizard shell, and row-selection + bulk actions. Both are designed narrowly (linear wizard, no branching; bulk actions strictly reuse the single-row lifecycle rule) rather than as general-purpose primitives, consistent with how `SidebarGroup` and the Drawer pattern were each introduced scoped-but-reusable in their originating modules — a future module can generalize either later if needed, not decided here.
6. **Execution Log's `result` vs. Run's `status` are shown as two distinct fields, never reconciled into one** — carrying forward DB doc §8 item 8's disclosed note (no "mixed outcome" run-level status exists post-Revision-2) rather than inventing a UI-only reconciliation that the data model doesn't support.
7. **Voucher and Loyalty Rule get flat single-page forms, not wizards** — because both are single flat entities (few fields, no multi-step conceptual grouping the way Automation's Template→Audience→Schedule naturally splits), consistent with not over-engineering a 5-step flow onto a 5-field record.

**Explicitly NOT designed, consistent with what the locked Spec/DB scope excludes (not an oversight):**
- Any UI for the three event triggers (Customer First Purchase, VIP Level Changed, Days Since Last Purchase) — Trigger picker (§3.4 Step 3) only offers Manual/Daily Schedule, matching `marketing_automations.trigger_type`'s locked 2-value constraint.
- Any voucher redemption action/status anywhere (§3.8) — "No Redemption" per Spec Rev.2.
- Any Reward Rules screen or Reward↔Voucher linking UI — dropped from scope at the Spec phase.
- Any real channel-send UI (no channel picker, no message composer with Facebook/Zalo/Email/SMS/TikTok fields) — Broadcast stays simulation-only end to end.
- Any role→permission-aware UI hiding/disabling (which roles see which of the 4 new `Permission` literals) — Spec Rev.2 Open Question #13 is still genuinely open; every screen above is designed assuming access is already gated upstream by route guards, same as every other Marketing screen, with the specific role mapping left for that still-open decision.

---

## 9. Ready For Product Owner Review

`docs/MARKETING_AUTOMATION_UI.md` (Revision 1, **LOCKED** 2026-07-21) is complete for the scope defined by the two locked documents. Reviewed and approved, including the 2 process-note discrepancies (Next Run, Dashboard card count), the 7 disclosed judgment calls, and the 2 genuinely-new UI patterns (wizard shell, bulk actions). Development (repository/service/component/page implementation) begins now.
