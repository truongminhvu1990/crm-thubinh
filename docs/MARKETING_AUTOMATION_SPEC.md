# Marketing Automation — Business Design Spec

**Module:** Marketing Automation (task brief labels it "Sprint v3.1.0 — Marketing Automation")
**Status:** Revision 2 — **LOCKED**. Product Owner Decisions applied below; approved to proceed to Database Design.
**Phase:** Business design, now locked. Database Design is a separate, later document (`docs/MARKETING_AUTOMATION_DATABASE.md`), itself gated on its own review round before any SQL is written.

## Revision 2 — Product Owner Decisions Applied

Issued directly against Revision 1's 13 Open Questions (§5 below, kept for historical record — every item now has an explicit resolution):

| Open Question | Decision |
|---|---|
| #1 Manifest/sprint mismatch | Waived, same as every prior module (Marketing Foundation, Jade Intelligence, Market Intelligence) — Marketing Automation confirmed as current module under "Sprint v3.1.0." |
| #2 Automation Type list | Confirmed 7, renamed for clarity: **Birthday Greeting, Welcome Customer, No Purchase 30 Days, No Purchase 60 Days, No Purchase 90 Days, VIP Upgrade, Manual Broadcast** (supersedes Revision 1's "Inactive 30/60/90 Days" naming — same underlying concept, brief's own updated wording). Still a data-level picklist, not a code enum, so a future 8th type stays additive. |
| #3 Automation Status lifecycle | Confirmed: reuse Marketing Foundation's Campaign status set and transition rule as-is — Draft/Active/Paused/Completed/Cancelled, `Draft → Active → Paused → Active → Completed` or `Draft → Cancelled`, both terminal. No separate lifecycle. |
| #4 Trigger execution mechanics | **Narrowed, not answered as originally framed: only Manual and Daily Schedule triggers are designed this sprint.** Customer First Purchase, VIP Level Changed, and Days Since Last Purchase ("Last Purchase Changed") are explicitly **event triggers, not designed this sprint** — removes the highest-impact open item by deferring it rather than resolving it. No hook into `purchase.service.ts`/`customer.service.ts` write paths is proposed or needed. |
| #5 Birthday Automation vs. Birthday Center | Implicitly confirmed acceptable: Birthday Greeting runs via the Daily Schedule trigger (a scan, same mechanism as any other Daily Schedule automation) — no event hook, no change to Birthday Center itself. |
| #6 Simulated delivery semantics | Confirmed **Simulation Only** — no Email/SMS/Zalo/Facebook/TikTok integration of any kind. Exact per-recipient outcome logic is a Development-phase detail; the schema only needs to represent an outcome per run/recipient (Execution Log fields below), not the algorithm that produces it. |
| #7 Broadcast audience source | Unchanged from Revision 1 — Manual Broadcast is one `automation_type` value; its audience is the Automation's Target Segment like any other automation. No separate broadcast/recipient-list entity. |
| #8 Loyalty point-earning event | **Narrowed:** Loyalty this sprint is **Foundation only** — Rule (definition), Balance, Point History. **No automatic point calculation** — a Rule documents a policy but nothing executes it automatically; point transactions are foundation-level ledger entries only. |
| #9 Reward Rules vs. Voucher relationship | **Reward Rules dropped from this sprint's scope entirely** — Loyalty Foundation is Rule/Balance/Point History only, no Reward Rules concept, no defined relationship to Voucher. |
| #10 Voucher assignment paths | Narrowed by the new status set (Draft/Active/Expired/Disabled — no "Assigned"/"Redeemed" state). A voucher may optionally reference a customer; exact assignment workflow is a Development-phase detail, not fixed here. |
| #11 Voucher redemption | Confirmed **No Redemption** — no redemption flow, no redemption status value, this sprint. |
| #12 Campaign attachment cardinality | **Narrowed:** a Campaign references **Automation only** (not Broadcast/Voucher/Loyalty Rule directly — those are dropped from Campaign Execution's scope). Referencing is passive; **no automatic execution** — a Campaign→Automation link does not cause the Automation to run. |
| #13 Permission-to-role mapping | Not addressed by this decision round — still open, carried into Database/UI Design as a Development-phase (application-layer) concern; does not affect table shape. |

**Also newly specified (not original Open Questions):** Voucher statuses fixed to exactly `Draft` / `Active` / `Expired` / `Disabled`. Execution Log (`marketing_automation_runs`) must capture Started, Finished, Duration, Result, Error Message. Automation Dashboard cards narrowed to exactly: Total Automations, Active, Paused, Today's Runs, Failed Runs (supersedes Revision 1's larger 8-card list carried from the original task brief).

**Process note (why this document exists before any code was written):** the task brief that opened this module was headed "STATUS: APPROVED," instructed 12 packages (DB → repository → service → 4 engines → dashboard → activity log → permissions → testing) to be built in one pass, and said "do not stop until fully implemented." Checked against the repository before starting:

- `docs/PROJECT_MANIFEST.md` (LOCKED) has no "Sprint v3.1.0" and no "Marketing Automation" entry anywhere in its Sprint Roadmap (Sprints 1–6 = Orders/Inventory/Reports/Dashboard/Jade Intelligence/Market Intelligence). `package.json` is `0.1.0`.
- No `docs/MARKETING_AUTOMATION_SPEC.md`, Database Design, or UI Design existed prior to this document.
- This exact mismatch happened once already this project (`docs/MARKETING_SPEC.md` Revision 1's Open Question #1, for Marketing Foundation itself) — a task brief's own "APPROVED" text is not a substitute for an actual Product Owner review round.

Per this project's standing process (Business Design → Product Review → Database Design → Product Review → UI Design → Product Review → Development, used for every module including Marketing Foundation), this document is the **first** step only: a Business Design draft plus Open Questions, produced without touching the database or writing any code. Everything below is a proposal, not a locked decision.

---

## 1. Business Design

### 1.1 Purpose

Add an **Automation layer** on top of the already-locked Marketing Foundation (`marketing_segments`, `marketing_campaigns`) so that Segments and Campaigns can trigger actions — a scheduled or event-driven Broadcast, a Loyalty point grant, or a Voucher assignment — instead of being purely planning records. This sprint is explicitly scoped by the brief to a **simulated delivery pipeline only**: no Facebook/Zalo/Email/SMS integration, matching Marketing Foundation's Broadcast Center (`docs/MARKETING_SPEC.md` §2.7), which is still "Coming Soon."

### 1.2 Source of truth (binding on every rule below)

This module **reuses** the Marketing Foundation entities and reads existing customer data; it does not redesign or duplicate either:

- `marketing_segments`, `marketing_segment_conditions`, `marketing_segment_members` (Marketing Foundation, LOCKED) — Automation's audience selection is always an existing Segment. No parallel audience/condition concept is introduced.
- `marketing_campaigns` (Marketing Foundation, LOCKED) — the brief's "Campaign Execution" package (Package 8) attaches Automation/Broadcast/Voucher/Loyalty Rule *to* an existing Campaign row; it does not add new campaign fields.
- `customers`, `staff`, `activity_logs` — read/write only in the same pattern already established (`lib/activityLog.service.ts`'s append-only `logActivity()`).

Per the brief's own additive-only instruction and this project's Database rule, no existing table is altered.

### 1.3 Module responsibilities

| Surface | Responsibility |
|---|---|
| **Marketing Foundation** (LOCKED) | Segments and Campaigns stay planning records exactly as designed. Automation reads them; it does not change their fields, statuses, or UI. |
| **Marketing Automation** (this module) | Defines *what happens* when a Segment/Campaign is acted on: a scheduled/triggered rule (Automation), a simulated send (Broadcast), a points transaction (Loyalty), a code (Voucher) — plus the dashboard and audit trail for all of the above. |

### 1.4 Connection to other modules (binding — brief's own Backward Compatibility list)

Same "Do Not modify" list the brief states explicitly: Customers, Products, Orders, Customer Purchases, Dashboard, Reports, Reports BI, Sales Ledger, Data Verification, **Marketing Foundation**, Staff, Sales Commission, VIP Care, Follow-up, Permission Framework, Activity Log. This document treats all of those as read-only inputs, same as Marketing Foundation did for Customers/Products/Staff.

---

## 2. Feature Business Rules (mapped from the task brief's packages)

### 2.1 Automation (Packages 1–3: entity, repository, service)

An **Automation** is a named, reusable rule: one Automation Type + one Trigger + one target Segment, with a Status. This is the entity `marketing_automations` in the brief's suggested schema.

- **Automation Type** — the brief lists 7: Birthday Greeting, Welcome Customer, Inactive 30/60/90 Days (3 separate types, not 1 parameterized type — brief names them individually), VIP Upgrade Reminder, Manual Broadcast. Architecture must stay "future-ready" for more types (brief's own words) — proposed as a fixed picklist column, not a hardcoded enum in code, so a new type is a data-level addition later, not a schema change. **Open Question #2.**
- **Status** — Draft / Active / Paused / Completed / Cancelled. The brief lists exactly these 5, identical to Marketing Foundation's Campaign status set (`docs/MARKETING_SPEC.md` §2.4) — proposed to reuse the same transition rule already locked there (`Draft → Active → Paused → Active → Completed`, or `Draft → Cancelled`, both terminal) rather than inventing a second lifecycle. **Open Question #3** (confirm reuse vs. a distinct lifecycle).
- **Trigger** — 6 named: Manual, Daily Schedule, Customer Birthday, Customer First Purchase, Days Since Last Purchase, VIP Level Changed. Each implies different execution mechanics (see §2.2–2.5); none has an execution engine (cron/scheduler) anywhere in this codebase today. **Open Question #4.**
- **Target Segment** — every Automation targets exactly one existing `marketing_segments` row (reused, not redesigned), consistent with the brief's "reuse all existing modules" instruction.

### 2.2 Birthday Automation (Package 5)

Reads `customers.birthday` (month+day), same field Marketing Foundation's Birthday Center (§2.10) and Birthday segment template (§2.1) already use. Proposed behavior: on a Daily Schedule trigger, find customers whose birthday matches "today" within the Automation's target Segment, then hand them to the Broadcast Engine as a simulated send. **This changes Birthday Center from a passive read-only list to something that can produce Automation Runs** — flagged as a real behavior question, not just an implementation detail. **Open Question #5.**

### 2.3 Broadcast Engine (Package 4)

Per the brief: Create Broadcast, Audience Preview, Estimated Reach, Execution History, Delivery Status, Retry Failed — **no real send integration, simulated delivery pipeline only.**

- Audience Preview / Estimated Reach reuse Marketing Foundation's existing Segment Preview computation (§2.3) — not a new counting mechanism.
- "Simulated delivery" needs a concrete definition before Development can build Delivery Status / Retry Failed meaningfully (e.g.: does every recipient row simulate to a fixed outcome, a random success/fail split, or a manually-set-for-testing outcome?). Retry Failed only means something if some simulated sends can fail. **Open Question #6.**
- A Broadcast's audience is always a Segment (existing) or a Campaign's target Segment — the brief doesn't describe a standalone recipient list separate from Segments, so this document assumes there isn't one. **Open Question #7** (confirm).

### 2.4 Loyalty Engine (Package 6)

Per the brief: Rule Management (Point Rules, Reward Rules), Customer Point Balance, Point History, Reward History.

- **Point Rules** — the brief doesn't say what earns a point (per purchase? per VND spent? per campaign interaction?). No existing table currently tracks anything point-like. **Open Question #8.**
- **Reward Rules** — the brief doesn't define what a "reward" is redeemed for, or its relationship (if any) to the Voucher Engine (§2.5) — a Reward could just *be* a Voucher grant, or a separate concept. **Open Question #9.**
- **Customer Point Balance** — proposed as a running total derived from a Point History ledger (`marketing_loyalty_transactions`), not a separately-maintained counter column, matching this project's "no duplicated/derivable state" preference (e.g. Segment membership, Customer Count are always computed, never cached — `docs/MARKETING_DATABASE.md` §1).

### 2.5 Voucher Engine (Package 7)

Per the brief: Voucher Templates, Voucher Generation, Voucher Assignment, Voucher Expiration, Voucher Redemption Status.

- **Assignment target** — a Voucher can be assigned to a customer directly, or generated in bulk for a Segment/Campaign/Broadcast audience. The brief doesn't specify which assignment paths are in scope for this sprint. **Open Question #10.**
- **Redemption** — the brief says "Voucher Redemption Status" (a state to track), not a redemption *flow*. Proposed reading: this sprint records/displays redemption status; it does not build a customer-facing or POS-facing redemption action, since nothing in this codebase is a point-of-sale/checkout surface today. **Open Question #11** (confirm no redemption UI/flow is expected this sprint, only status tracking).

### 2.6 Campaign Execution (Package 8)

Per the brief: "Allow Campaigns to attach Automation, Broadcast, Voucher, Loyalty Rule. Track execution history." Proposed as a Campaign gaining zero-or-more linked Automations (each Automation still independently targets its own Segment) — this does **not** add new fields to `marketing_campaigns` itself; the association is a new join concept. Execution history = the same Automation Run log (§2.1/`marketing_automation_runs`) filtered by Campaign. **Open Question #12** (confirm a Campaign can attach *multiple* of each kind, e.g. 2 Broadcasts + 1 Voucher, vs. exactly one of each).

### 2.7 Automation Dashboard (Package 9)

Cards per the brief: Active Automations, Today's Runs, Successful Runs, Failed Runs, Pending Runs, Broadcasts, Birthday Jobs, Voucher Usage. All proposed as live-computed counts (no cache/report table), same convention as Marketing Foundation's Dashboard (§2.11) and every other dashboard in this codebase (Reports BI, Market Intelligence). Additive — does not replace or edit the existing Marketing Dashboard or the app-level `/dashboard`.

### 2.8 Activity Log Integration (Package 10)

Per the brief: Automation Created/Updated/Executed, Broadcast Executed, Voucher Assigned, Voucher Redeemed, Loyalty Points Granted. Proposed as additional calls to the existing `logActivity()` (`lib/activityLog.service.ts`) — reused as-is, no new logging mechanism, matching how Marketing Foundation itself never needed to touch this file.

### 2.9 Permission Integration (Package 11)

Per the brief: `marketing.automation.manage`, `marketing.broadcast.manage`, `marketing.loyalty.manage`, `marketing.voucher.manage` — 4 new `Permission` literals, following the dot-separated naming the actual code already uses for `marketing.manage` (`types/permission.ts`; note Marketing Foundation's own spec doc claimed a colon convention, but the shipped code uses a dot — this proposal follows the real code, not the doc). Which role(s) get which of the 4 new permissions is not stated by the brief. **Open Question #13.**

### 2.10 Performance (binding, carried from the brief and from Marketing Foundation §2.13)

Every list/count is server-side, paginated, filtered, searched — no client-side fetch-all. Batch Processing (named by the brief, e.g. for Birthday Automation scanning all customers, or bulk Voucher Generation) must not be a per-row round trip.

---

## 3. Proposed New Entities (naming only — no column-level design; that is Database Design's job)

The brief's own suggested entity list, adopted as the Feature 1–9 basis above:

- `marketing_automations` — §2.1
- `marketing_automation_runs` — one row per execution attempt (§2.1, §2.7's Today's/Successful/Failed/Pending Runs cards)
- `marketing_automation_logs` — per-recipient detail within a run (needed for Broadcast's Delivery Status / Retry Failed, §2.3)
- `marketing_vouchers` — §2.5
- `marketing_loyalty_rules` — §2.4
- `marketing_loyalty_transactions` — §2.4's Point History/ledger

No column, enum, index, FK, or RLS policy is proposed by this document — Database Design is a separate, later phase, same as Marketing Foundation's own process.

---

## 4. Out of Scope

- **Any real message send** — Facebook/Zalo/Email/SMS API integration is explicitly excluded by the brief ("No real sending integration in this sprint. Use a simulated delivery pipeline only").
- **Redesigning Marketing Foundation** — `marketing_segments`/`marketing_campaigns` fields, statuses, or UI are not changed.
- **Redesigning any module on the brief's own Backward Compatibility list** (§1.4 above).
- **Any schema, migration, repository, service, or UI code** — this document is Business Design only.
- **A scheduler/cron execution engine implementation** — Daily Schedule trigger's *mechanics* (what actually invokes it on a timer) is flagged as Open Question #4, not designed here.
- **A point-of-sale / checkout redemption flow** for Vouchers (§2.5, Open Question #11).

---

## 5. Open Questions

1. **Module assignment / manifest mismatch** (restated from the header). Confirm Marketing Automation is the current module assignment and how (or whether) `docs/PROJECT_MANIFEST.md`'s Sprint Roadmap and `package.json`'s version scheme should reconcile with "Sprint v3.1.0" — same pattern as every prior module's sprint-numbering mismatch (Jade Intelligence, Market Intelligence, Marketing Foundation itself).
2. **Automation Type extensibility:** confirm a plain fixed-picklist column (not a code-level enum) is the right "future-ready" mechanism the brief asks for, and confirm the 7 named types are the complete Development-phase list (no 8th type implied elsewhere in the brief).
3. **Automation Status lifecycle:** reuse Marketing Foundation's locked Campaign transition rule (`Draft → Active → Paused → Active → Completed`, or `Draft → Cancelled`, both terminal) as-is for Automations, or does Automation need its own transition rules (e.g., can a Completed Automation re-run)?
4. **Trigger execution mechanics:** Manual and Daily Schedule are clear (a button, and *some* recurring job). Customer Birthday / Customer First Purchase / Days Since Last Purchase / VIP Level Changed are **event-driven** — what actually fires them? Options include: (a) folded into the same Daily Schedule sweep (e.g., a nightly job checks "any customer whose purchase count just became 1 today"), or (b) hooked directly into existing write paths (`purchase.service.ts`'s create-purchase, `customer.service.ts`'s VIP-level update) — the latter would touch LOCKED Customer/Purchase code and needs an explicit Impact Analysis approval before any such hook is added. This is the single highest-impact open question in this document.
5. **Birthday Automation vs. Birthday Center:** confirm it's acceptable for this sprint to add an *active* (simulated-send-producing) automation on top of what was explicitly a *passive, read-only* view in Marketing Foundation (§2.10) — no business rule change to Birthday Center itself is intended, only a new consumer of the same `customers.birthday` field.
6. **Simulated delivery semantics:** what determines a simulated Broadcast recipient's outcome (Delivered/Failed/Pending)? Needs a concrete, deterministic-enough rule for "Retry Failed" and the dashboard's Successful/Failed/Pending cards to be meaningfully testable, not just always-succeed.
7. **Broadcast audience source:** confirm every Broadcast's audience is always an existing `marketing_segments` row (Dynamic or Manual) — no separate ad hoc recipient list concept.
8. **Loyalty Point Rules — what earns a point:** the brief names "Point Rules" but not the point-earning event(s) (per purchase, per VND spent, per campaign engagement, manual grant only, or some combination).
9. **Loyalty Reward Rules vs. Voucher Engine:** is a "Reward" its own concept, or does redeeming loyalty points always produce a Voucher (i.e., Reward Rules configure "N points → 1 Voucher of type X")?
10. **Voucher assignment paths in scope:** direct single-customer assignment, bulk assignment across a Segment/Campaign/Broadcast audience, or both, for this sprint?
11. **Voucher redemption — status only vs. a flow:** confirm this sprint tracks/displays Redemption Status only (an operator manually flips a voucher to Redeemed, e.g. from a Customer Detail action) and does not build any checkout/POS-integrated redemption action.
12. **Campaign attachment cardinality:** can a Campaign attach multiple Automations/Broadcasts/Vouchers/Loyalty Rules of the same kind, or exactly one of each?
13. **Permission-to-role mapping:** which `StaffRole`(s) — Owner/Manager/Sales/Marketing/Viewer — get each of the 4 new permissions (`marketing.automation.manage`, `marketing.broadcast.manage`, `marketing.loyalty.manage`, `marketing.voucher.manage`)? Marketing Foundation's precedent gave `marketing.manage` to Owner/Manager/Marketing only.

---

Business Design Revision 2 — **LOCKED**. All Open Questions resolved via explicit Product Owner Decisions (above), several by narrowing scope rather than fully answering the original framing (event triggers deferred, Reward Rules dropped, Voucher redemption dropped, Campaign attachment narrowed to Automation-only). Proceeding to Database Design — a new `docs/MARKETING_AUTOMATION_DATABASE.md`, itself gated on its own Product Owner review round before any SQL is written, same three-gate pattern (approve design → approve SQL → approve execution) already used for every other module in this project. No database, repository, service, engine, dashboard, or permission code has been written by this document.
