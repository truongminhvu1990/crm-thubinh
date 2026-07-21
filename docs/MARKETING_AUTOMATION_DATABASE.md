# Marketing Automation — Database Design

**Module:** Marketing Automation
**Status:** Revision 2 — **LOCKED (Database Freeze confirmed)**. The 8 judgment calls disclosed in §8 were not individually re-addressed by the freeze instruction; they stand as disclosed, non-blocking design notes carried forward into UI Design and, later, Development — not reopened.
**Phase:** Database design only. No SQL, migration, repository, service, or UI code is written by this document.
**Based on:** `docs/MARKETING_AUTOMATION_SPEC.md`, Revision 2 — **LOCKED**. This document does not redesign, reinterpret, or add business logic; every table and field below traces back to a Product Owner Decision cited inline as (Spec Rev.2 §N / decision table row).

## Revision 2 — Applied Changes

Five scoped changes only, per explicit instruction ("Do not modify anything else"):

1. `marketing_automations` — added `frequency` (Once/Daily/Weekly/Monthly).
2. `marketing_automation_runs` — the Revision 1 free-form `result` column is replaced by `status` (Pending/Running/Success/Failed/Cancelled — drops `Partial Success`, adds `Cancelled`). Revision 1's disclosed judgment call on this field's exact picklist is now superseded by this explicit Product Owner value list.
3. `marketing_vouchers` — added `start_date`, `end_date`.
4. `marketing_loyalty_transactions` — added `transaction_type` (Earn/Adjust/Expire).
5. `marketing_automations` — added `version` (`integer`, default `1`).

Everything else — table set, other columns, FKs, RLS, and Migration Strategy — is unchanged from Revision 1.

---

## 1. Entity Relationship Overview

```
marketing_segments (Marketing Foundation, LOCKED, unchanged)
        ▲
        │ target_segment_id (required)
        │
marketing_automations ──┐
   │        ▲            │  (0..N per automation)
   │        │            │
   │        │            └── marketing_campaign_automations ── marketing_campaigns
   │        │                 (campaign_id, automation_id)      (Marketing Foundation,
   │        │                                                    LOCKED, unchanged)
   │ 1:N
   ▼
marketing_automation_runs
   │ 1:N
   ▼
marketing_automation_logs ── customer_id → customers (Marketing Foundation reads, unchanged)


marketing_loyalty_rules            marketing_vouchers
   │ 0..1:N (optional)                  │
   ▼                                    │ customer_id (optional)
marketing_loyalty_transactions ──►  customers
   │
   customer_id → customers
```

Six tables total: the five entities the brief suggested (`marketing_automations`, `marketing_automation_runs`, `marketing_automation_logs`, `marketing_loyalty_rules`, `marketing_loyalty_transactions`, `marketing_vouchers` — six, not five) plus **one** additional supporting table, justified in §1.1. No table for Broadcast — "Manual Broadcast" is an `automation_type` value on `marketing_automations`, executed/logged through the same Runs/Logs pair as every other automation type (Spec Rev.2, Open Question #7 decision), so a dedicated broadcast table would duplicate what Runs/Logs already model.

### 1.1 Justification for the one added table: `marketing_campaign_automations`

The Spec's Revision 2 decision on Open Question #12 locks Campaign Execution to "Campaign references Automation only... referencing is passive, no automatic execution." `marketing_campaigns` is a Marketing Foundation table, and this sprint's Backward Compatibility rule (both the original brief and this phase's brief) explicitly forbids modifying Marketing Foundation — so no `automation_id` column can be added directly to `marketing_campaigns`. A campaign referencing an automation therefore needs its own row somewhere; the smallest additive shape is a plain join table (`campaign_id`, `automation_id`), with no extra columns beyond an audit timestamp, matching this schema's existing join-table precedent (`marketing_segment_members`, Marketing Foundation). Kept to a many-to-many shape (not one-to-one) since neither the Spec nor the original brief restricts a campaign to referencing exactly one automation, or an automation to being referenced by only one campaign — a stricter cardinality would be inventing a rule the Spec doesn't state.

No other supporting table is added. Considered and rejected:
- **A separate `marketing_broadcasts` table** — rejected per §1 above; "Manual Broadcast" reuses Automations/Runs/Logs.
- **A separate `marketing_loyalty_reward_rules` table** — rejected; Spec Rev.2 explicitly drops Reward Rules from this sprint's scope (Open Question #9 decision).
- **A voucher/automation link table** — rejected; no `automation_type` in the locked list of 7 produces a voucher, and Campaign Execution is Automation-only (§1.1 above) — Vouchers stay a standalone foundation table this sprint, same treatment as Loyalty.

---

## 2. Table Definitions

### 2.1 `marketing_automations`

**Purpose:** One row per configured Automation — a named rule pairing an Automation Type + Trigger + target Segment, with its own lifecycle Status. (Spec Rev.2 §2.1, decisions #2/#3/#4.)

| Column | Type | Purpose | Required | Default |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key | Required | `gen_random_uuid()` |
| `name` | `text` | Display name | Required | — |
| `description` | `text` | Free-text description | Optional | — |
| `automation_type` | `text` | One of the 7 locked types | Required | — |
| `trigger_type` | `text` | `Manual` or `Daily Schedule` only (Spec Rev.2 decision #4 — event triggers not designed this sprint) | Required | — |
| `frequency` *(Revision 2, new)* | `text` | How often the automation runs: `Once` / `Daily` / `Weekly` / `Monthly` | Required | — |
| `target_segment_id` | `uuid` | Which Segment this automation acts on | Required | — |
| `status` | `text` | Draft/Active/Paused/Completed/Cancelled (Spec Rev.2 decision #3 — reuses Campaign's locked lifecycle) | Required | `'Draft'` |
| `version` *(Revision 2, new)* | `integer` | Row version, incremented on each edit | Required | `1` |
| `created_by` | `uuid` | Staff who created it | Optional (nullable if staff later removed) | — |
| `created_at` | `timestamptz` | Audit | Required (system-set) | `now()` |
| `updated_at` | `timestamptz` | Audit | Required (system-set) | `now()` |

**Primary Key:** `id`.
**Foreign Keys:**
- `target_segment_id` → `marketing_segments.id`, **ON DELETE RESTRICT** — same rationale as `marketing_campaigns.target_segment_id` (Marketing Foundation precedent): an automation without a target segment contradicts this table's own Required rule, so a still-targeted segment can't be deleted out from under it. (A segment can still move to `Inactive`/`Archived` — that's a status change, not a delete, and this design doesn't restrict that.)
- `created_by` → `staff.id`, **ON DELETE SET NULL** — matches `marketing_segments.created_by` / `marketing_campaigns.owner_staff_id` precedent.

**Indexes:** see §5.
**Constraints:**
- `automation_type` — fixed allow-list: `'Birthday Greeting'`, `'Welcome Customer'`, `'No Purchase 30 Days'`, `'No Purchase 60 Days'`, `'No Purchase 90 Days'`, `'VIP Upgrade'`, `'Manual Broadcast'`.
- `trigger_type` — fixed allow-list: `'Manual'`, `'Daily Schedule'`.
- `frequency` *(Revision 2, new)* — fixed allow-list: `'Once'`, `'Daily'`, `'Weekly'`, `'Monthly'`.
- `status` — fixed allow-list: `'Draft'`, `'Active'`, `'Paused'`, `'Completed'`, `'Cancelled'`.
- `version` *(Revision 2, new)* — `>= 1`.
**Relationships:** N:1 to `marketing_segments` (many automations can target one segment). 1:N to `marketing_automation_runs`. M:N to `marketing_campaigns` via `marketing_campaign_automations`.
**Judgment call, flagged (Revision 2):** `frequency`'s relationship to `trigger_type` isn't specified beyond both existing as columns — e.g. whether `frequency = 'Once'` is only meaningful when `trigger_type = 'Manual'`, or whether a `Daily Schedule` automation can also be `Weekly`/`Monthly` (a schedule with a longer period than daily). Modeled as two independent columns, no cross-column CHECK, since the brief doesn't state a dependency rule between them — flagged in §8.

---

### 2.2 `marketing_automation_runs`

**Purpose:** One row per execution attempt of an automation — the Execution Log the Spec's Revision 2 decisions require: Started, Finished, Duration, Status, Error Message. (Spec Rev.2, "Also newly specified" — Execution Log fields; backs Dashboard's Today's Runs / Failed Runs cards.)

| Column | Type | Purpose | Required | Default |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key | Required | `gen_random_uuid()` |
| `automation_id` | `uuid` | Which automation this run belongs to | Required | — |
| `triggered_by` | `text` | `Manual` or `Daily Schedule` — how this specific run was invoked (mirrors the automation's `trigger_type`, kept on the run row so history is accurate even if the automation's `trigger_type` is later edited) | Required | — |
| `started_at` | `timestamptz` | When execution began | Required | `now()` |
| `finished_at` | `timestamptz` | When execution ended | Optional (null while still running) | — |
| `duration_ms` | `integer` | Elapsed milliseconds, set when `finished_at` is set | Optional | — |
| `status` *(Revision 2, renamed from `result`)* | `text` | `Pending` / `Running` / `Success` / `Failed` / `Cancelled` | Required | `'Pending'` |
| `error_message` | `text` | Failure detail, if `status` is `Failed` | Optional | — |
| `created_at` | `timestamptz` | Audit | Required (system-set) | `now()` |

**Primary Key:** `id`.
**Foreign Keys:** `automation_id` → `marketing_automations.id`, **ON DELETE CASCADE** — a run row has no meaning without its parent automation (same reasoning as `marketing_segment_conditions.segment_id` in Marketing Foundation).
**Indexes:** see §5.
**Constraints:**
- `triggered_by` — fixed allow-list: `'Manual'`, `'Daily Schedule'`.
- `status` *(Revision 2, renamed from `result`)* — fixed allow-list: `'Pending'`, `'Running'`, `'Success'`, `'Failed'`, `'Cancelled'`.
- `duration_ms`, when present, should be `>= 0`.
- `finished_at`, when present, should be `>= started_at`.
**Relationships:** N:1 to `marketing_automations`. 1:N to `marketing_automation_logs`.
**Revision 2 note:** Revision 1's disclosed judgment call on this column (an invented `Partial Success` value) is superseded — the column is renamed `result` → `status` and its allow-list is now an explicit Product Owner value list (`Cancelled` replaces `Partial Success`). A run where some simulated recipients fail and others succeed (a Manual Broadcast) now has no dedicated run-level status distinguishing "mixed outcome" from `Success`/`Failed` — the per-recipient detail in `marketing_automation_logs.result` (unchanged, §2.3) is the only place that distinction is still visible. Flagged in §8.

---

### 2.3 `marketing_automation_logs`

**Purpose:** One row per affected customer within a run — backs Broadcast's per-recipient Delivery Status / Retry Failed (simulation only) and gives the Dashboard's Failed/Today's Runs cards a real per-recipient detail to roll up from. (Spec Rev.2, Open Question #6/#7 decisions.)

| Column | Type | Purpose | Required | Default |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key | Required | `gen_random_uuid()` |
| `run_id` | `uuid` | Which run this recipient row belongs to | Required | — |
| `customer_id` | `uuid` | Which customer was targeted | Required | — |
| `result` | `text` | `Pending` / `Success` / `Failed` | Required | `'Pending'` |
| `message` | `text` | Simulated outcome detail / error text | Optional | — |
| `created_at` | `timestamptz` | Audit | Required (system-set) | `now()` |

**Primary Key:** `id`.
**Foreign Keys:**
- `run_id` → `marketing_automation_runs.id`, **ON DELETE CASCADE** — a log row has no meaning without its parent run.
- `customer_id` → `customers.id`, **ON DELETE CASCADE** — matches `marketing_segment_members.customer_id` precedent (Marketing Foundation): if a customer is deleted, log rows referencing them are meaningless history, not data to preserve.
**Indexes:** see §5.
**Constraints:** `result` — fixed allow-list: `'Pending'`, `'Success'`, `'Failed'`. Uniqueness on (`run_id`, `customer_id`) — a given run should not log the same customer twice.
**Relationships:** N:1 to `marketing_automation_runs`. N:1 to `customers` (no back-reference needed; Customer Timeline integration, if any, is out of scope this sprint per the Spec — not requested by the brief for Automation the way it was for Marketing Foundation's Campaign History).

---

### 2.4 `marketing_loyalty_rules`

**Purpose:** Foundation-only rule definitions — documents a points policy without executing it. (Spec Rev.2, Open Question #8 decision: "No automatic point calculation.")

| Column | Type | Purpose | Required | Default |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key | Required | `gen_random_uuid()` |
| `name` | `text` | Rule display name | Required | — |
| `description` | `text` | Free-text policy description (e.g. "1 point per purchase" — documented, not enforced) | Optional | — |
| `points_value` | `integer` | Reference point amount this rule describes | Required | — |
| `status` | `text` | `Active` / `Inactive` | Required | `'Active'` |
| `created_by` | `uuid` | Staff who created it | Optional | — |
| `created_at` | `timestamptz` | Audit | Required (system-set) | `now()` |
| `updated_at` | `timestamptz` | Audit | Required (system-set) | `now()` |

**Primary Key:** `id`.
**Foreign Keys:** `created_by` → `staff.id`, **ON DELETE SET NULL**.
**Indexes:** see §5.
**Constraints:** `status` — fixed allow-list: `'Active'`, `'Inactive'`. `points_value` should be `> 0`.
**Relationships:** 1:N to `marketing_loyalty_transactions` (optional — a manual transaction need not cite a rule; see §2.5).
**Judgment call, flagged:** `status` (Active/Inactive) is not named by the Spec's Loyalty decision — added because every other fixed-choice entity in this schema (Segments, Campaigns, Automations) has a status field, and a rule with no way to deactivate it would be a permanent, un-editable record. Minimal 2-value set, not the 5-value Automation/Campaign lifecycle, since a Rule is a static definition, not a process with a run history. Flagged in §8.

---

### 2.5 `marketing_loyalty_transactions`

**Purpose:** The Point History ledger. Customer Point Balance (Spec Rev.2, "Loyalty... Balance") is **never stored** — always `SUM(points)` per customer, computed live, matching Marketing Foundation's "no duplicated/derivable state" convention (Segment Preview's Customer Count, `docs/MARKETING_DATABASE.md` §1/§8).

| Column | Type | Purpose | Required | Default |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key | Required | `gen_random_uuid()` |
| `customer_id` | `uuid` | Which customer this transaction affects | Required | — |
| `rule_id` | `uuid` | Which rule this transaction cites, if any | Optional (manual/ad hoc grants need not cite a rule) | — |
| `transaction_type` *(Revision 2, new)* | `text` | `Earn` / `Adjust` / `Expire` | Required | — |
| `points` | `integer` | Signed amount — positive = grant/earn, negative = deduction/adjustment | Required | — |
| `note` | `text` | Free-text reason | Optional | — |
| `created_by` | `uuid` | Staff who recorded this transaction | Optional | — |
| `created_at` | `timestamptz` | Audit — also the transaction date | Required (system-set) | `now()` |

**Primary Key:** `id`.
**Foreign Keys:**
- `customer_id` → `customers.id`, **ON DELETE CASCADE** — same precedent as `marketing_segment_members.customer_id`.
- `rule_id` → `marketing_loyalty_rules.id`, **ON DELETE SET NULL** — a rule being deactivated/removed later shouldn't erase historical point transactions that cited it.
- `created_by` → `staff.id`, **ON DELETE SET NULL**.
**Indexes:** see §5.
**Constraints:** `points <> 0` (a zero-point transaction is not a meaningful ledger entry). `transaction_type` *(Revision 2, new)* — fixed allow-list: `'Earn'`, `'Adjust'`, `'Expire'`.
**Relationships:** N:1 to `customers`. N:1 to `marketing_loyalty_rules` (optional).
**Judgment call, flagged (Revision 2):** no cross-column rule ties `transaction_type` to the sign of `points` (e.g. `Expire` implying a negative amount) — the task's scope was adding the column, not a redesign of `points`' existing sign convention. Left as two independent columns; flagged in §8.

---

### 2.6 `marketing_vouchers`

**Purpose:** Voucher records — Draft/Active/Expired/Disabled lifecycle, no redemption. (Spec Rev.2: "Voucher statuses fixed to exactly Draft/Active/Expired/Disabled," Open Question #10/#11 decisions.)

| Column | Type | Purpose | Required | Default |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key | Required | `gen_random_uuid()` |
| `code` | `text` | Voucher code, unique | Required | — |
| `name` | `text` | Display name | Required | — |
| `description` | `text` | Free-text description | Optional | — |
| `status` | `text` | Draft/Active/Expired/Disabled | Required | `'Draft'` |
| `customer_id` | `uuid` | Optionally assigned to a specific customer | Optional (null = unassigned) | — |
| `start_date` *(Revision 2, new)* | `date` | Date the voucher becomes usable | Optional | — |
| `end_date` *(Revision 2, new)* | `date` | Date the voucher stops being usable | Optional | — |
| `expires_at` | `date` | Expiration date | Optional | — |
| `created_by` | `uuid` | Staff who created it | Optional | — |
| `created_at` | `timestamptz` | Audit | Required (system-set) | `now()` |
| `updated_at` | `timestamptz` | Audit | Required (system-set) | `now()` |

**Primary Key:** `id`.
**Foreign Keys:**
- `customer_id` → `customers.id`, **ON DELETE SET NULL** — deliberately *not* Cascade: a voucher is a marketing/finance-adjacent record, and losing a customer shouldn't silently delete voucher history the way losing a customer legitimately empties their segment membership. Unassigning (null) preserves the voucher row itself.
- `created_by` → `staff.id`, **ON DELETE SET NULL**.
**Indexes:** see §5.
**Constraints:** `status` — fixed allow-list: `'Draft'`, `'Active'`, `'Expired'`, `'Disabled'`. `code` — `UNIQUE`. `end_date`, when present alongside `start_date`, should be `>= start_date` *(Revision 2, new — same pattern as `marketing_campaigns.end_date >= start_date` in Marketing Foundation)*.
**Relationships:** N:1 to `customers` (optional).
**Deliberately absent:** any discount/value/benefit field (percentage, fixed amount, free item, etc.) and any "Redeemed" status or redemption timestamp. Neither is named anywhere in the Spec's Revision 2 decisions ("No Redemption" is explicit; a value/benefit shape was never specified at all, unlike, say, Marketing Foundation's segment-condition Value column which the Spec did describe as variable-shape). Adding either would be inventing a business rule the Spec doesn't state (Field rule) — flagged as an open item in §8, not guessed at here.
**Judgment call, flagged (Revision 2):** `start_date`/`end_date` were added without instruction on their relationship to the pre-existing `expires_at` column — the three now overlap in purpose (a voucher's usable window vs. its expiration). Not resolved here since the task scoped this round to additive columns only, not a redesign of the existing `expires_at` field — flagged in §8.

---

### 2.7 `marketing_campaign_automations`

**Purpose:** Passive join between an existing Campaign and an Automation it references — no execution semantics. (Spec Rev.2, Open Question #12 decision: "Campaign references Automation only, no automatic execution." Justified in §1.1.)

| Column | Type | Purpose | Required | Default |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key | Required | `gen_random_uuid()` |
| `campaign_id` | `uuid` | Which campaign | Required | — |
| `automation_id` | `uuid` | Which automation it references | Required | — |
| `linked_by` | `uuid` | Staff who created the link | Optional | — |
| `linked_at` | `timestamptz` | Audit | Required (system-set) | `now()` |

**Primary Key:** `id`.
**Foreign Keys:**
- `campaign_id` → `marketing_campaigns.id`, **ON DELETE CASCADE** — a link row has no meaning without its parent campaign (Marketing Foundation table, referenced not modified).
- `automation_id` → `marketing_automations.id`, **ON DELETE CASCADE** — symmetric reasoning.
- `linked_by` → `staff.id`, **ON DELETE SET NULL**.
**Indexes:** see §5.
**Constraints:** Uniqueness on (`campaign_id`, `automation_id`) — the same automation shouldn't be linked to the same campaign twice.
**Relationships:** N:1 to `marketing_campaigns` (LOCKED, unmodified). N:1 to `marketing_automations`. Realizes an M:N between the two.

---

## 3. Relationships

- `marketing_segments` (Marketing Foundation, unmodified) 1:N `marketing_automations` — one segment can be the target of many automations. `ON DELETE RESTRICT` mirrors the existing `marketing_campaigns.target_segment_id` guard.
- `marketing_automations` 1:N `marketing_automation_runs` — every execution attempt is its own row, full history retained.
- `marketing_automation_runs` 1:N `marketing_automation_logs` — per-recipient detail within a run.
- `marketing_automation_logs` N:1 `customers` — no new relationship surfaced on Customer Detail this sprint (not requested).
- `marketing_campaigns` (Marketing Foundation, unmodified) M:N `marketing_automations`, realized through `marketing_campaign_automations`.
- `marketing_loyalty_rules` 1:N `marketing_loyalty_transactions` (optional FK — a transaction need not cite a rule).
- `customers` 1:N `marketing_loyalty_transactions` — ledger; Balance is `SUM(points)`, never stored.
- `customers` 1:N `marketing_vouchers` (optional FK — a voucher need not be assigned).
- `staff` 1:N across `marketing_automations.created_by`, `marketing_loyalty_rules.created_by`, `marketing_loyalty_transactions.created_by`, `marketing_vouchers.created_by`, `marketing_campaign_automations.linked_by` — all `SET NULL`, all optional, matching the existing staff-reference precedent so a staff departure never destroys automation/loyalty/voucher history.
- **No new relationship touches `customer_purchases`, `products`, or `sales_commissions`** — none of the six tables above references them. (Consistent with Spec Rev.2 dropping the event-trigger types — Customer First Purchase / Days Since Last Purchase / VIP Level Changed — that would have been the only reason to read those tables from this module.)

---

## 4. Constraints

Consolidated from §2 (all are `CHECK` allow-lists, `UNIQUE`, or `NOT NULL` — no native Postgres enum type, matching Marketing Foundation's stated convention of "plain text with a fixed allow-list," `docs/MARKETING_DATABASE.md` §1):

| Table | Constraint |
|---|---|
| `marketing_automations` | `automation_type` ∈ 7 fixed values; `trigger_type` ∈ {Manual, Daily Schedule}; `frequency` ∈ {Once, Daily, Weekly, Monthly} *(Rev.2)*; `status` ∈ 5 fixed values, default `Draft`; `version >= 1`, default `1` *(Rev.2)*. |
| `marketing_automation_runs` | `triggered_by` ∈ {Manual, Daily Schedule}; `status` ∈ {Pending, Running, Success, Failed, Cancelled}, default `Pending` *(Rev.2, renamed from `result`)*; `duration_ms >= 0` when present; `finished_at >= started_at` when present. |
| `marketing_automation_logs` | `result` ∈ {Pending, Success, Failed}, default `Pending`; unique (`run_id`, `customer_id`). |
| `marketing_loyalty_rules` | `status` ∈ {Active, Inactive}, default `Active`; `points_value > 0`. |
| `marketing_loyalty_transactions` | `points <> 0`; `transaction_type` ∈ {Earn, Adjust, Expire} *(Rev.2)*. |
| `marketing_vouchers` | `status` ∈ {Draft, Active, Expired, Disabled}, default `Draft`; `code` unique; `end_date >= start_date` when both present *(Rev.2)*. |
| `marketing_campaign_automations` | unique (`campaign_id`, `automation_id`). |

Every Reference column above is `NOT NULL` except where explicitly marked Optional in §2 (`created_by`/`linked_by` staff references, `rule_id`, voucher/log `customer_id` where noted) — same Required/Optional convention `docs/MARKETING_DATABASE.md` §5 already used.

---

## 5. Index Strategy

Grouped by the Spec/brief's named performance surfaces (task's own "Design indexes for: Dashboard, Execution History, Automation List, Voucher List, Loyalty History, Broadcast History"):

| Index | Table(column) | Backs |
|---|---|---|
| `idx_marketing_automations_status` | `marketing_automations(status)` | Automation List filtering; Dashboard's Total/Active/Paused cards. |
| `idx_marketing_automations_type` | `marketing_automations(automation_type)` | Automation List filtering by type. |
| `idx_marketing_automations_segment_id` | `marketing_automations(target_segment_id)` | Reverse lookup: which automations target a given segment (also needed pre-delete/pre-archive check, mirrors Marketing Foundation's `idx_campaigns_target_segment_id`). |
| `idx_automation_runs_automation_id` | `marketing_automation_runs(automation_id)` | Execution History for a given automation. |
| `idx_automation_runs_started_at` | `marketing_automation_runs(started_at)` | Dashboard's Today's Runs card (date-range filter); Execution History date sort. |
| `idx_automation_runs_status` *(Revision 2, renamed from `idx_automation_runs_result`)* | `marketing_automation_runs(status)` | Dashboard's Failed Runs card. |
| `idx_automation_logs_run_id` | `marketing_automation_logs(run_id)` | Broadcast History / Delivery Status detail for a given run. |
| `idx_automation_logs_customer_id` | `marketing_automation_logs(customer_id)` | Reverse lookup: automation history for a given customer. |
| `idx_automation_logs_result` | `marketing_automation_logs(result)` | Retry Failed (simulation) — finding all `Failed` log rows for a run. |
| `idx_loyalty_rules_status` | `marketing_loyalty_rules(status)` | Rule Management list (Active-only default view, same pattern as Segment List). |
| `idx_loyalty_transactions_customer_id` | `marketing_loyalty_transactions(customer_id)` | Customer Point Balance (`SUM`) and Point History list — the single most-queried index in this design, since Balance is computed live on every view. |
| `idx_loyalty_transactions_created_at` | `marketing_loyalty_transactions(created_at)` | Point History date sort/pagination. |
| `idx_loyalty_transactions_rule_id` | `marketing_loyalty_transactions(rule_id)` | Reverse lookup: transactions citing a given rule. |
| `idx_vouchers_status` | `marketing_vouchers(status)` | Voucher List filtering; Dashboard's Voucher Usage-style breakdowns if added later. |
| `idx_vouchers_customer_id` | `marketing_vouchers(customer_id)` | Voucher List "assigned to" filter; Customer-scoped voucher lookup. |
| (unique) `idx_vouchers_code` | `marketing_vouchers(code)` | Enforces uniqueness; also the lookup path for code entry. |
| `idx_campaign_automations_campaign_id` | `marketing_campaign_automations(campaign_id)` | Campaign detail: which automations it references. |
| `idx_campaign_automations_automation_id` | `marketing_campaign_automations(automation_id)` | Reverse: which campaigns reference a given automation. |
| (unique) `idx_campaign_automations_pair` | `marketing_campaign_automations(campaign_id, automation_id)` | Enforces the uniqueness constraint (§4); also the existence-check lookup path. |

No index is proposed on any existing table (`customers`, `marketing_segments`, `marketing_campaigns`, `staff`) — Marketing Foundation's migration already added `idx_customers_birthday`/`province`/`district`/`vip_level` and the campaign/segment indexes this design's foreign keys ride on; this module adds no new query pattern against those tables that isn't already covered.

---

## 6. RLS Design

Per this phase's explicit instruction ("Reuse existing permission architecture. Do not redesign authentication.") and Marketing Foundation's own locked precedent (`docs/MARKETING_DATABASE.md` §7): all seven new tables get Row Level Security **enabled**, with the identical uniform policy shape already applied to every operational table in this schema since `20260718_rls_authenticated_role.sql` — one `FOR ALL USING (true) WITH CHECK (true)` policy `TO anon`, one identical policy `TO authenticated`. No bespoke, Automation-specific row-level policy (e.g. "staff can only see automations they created") is introduced — this project's real authorization boundary is the application-level `lib/permission.ts` / route guards (Spec §2.9's 4 new `Permission` literals), not differentiated RLS, exactly as Marketing Foundation's Feature 12/§7 already established and this document does not redesign.

Tables requiring RLS: `marketing_automations`, `marketing_automation_runs`, `marketing_automation_logs`, `marketing_loyalty_rules`, `marketing_loyalty_transactions`, `marketing_vouchers`, `marketing_campaign_automations`.

---

## 7. Migration Strategy

This document proposes no SQL — per this phase's explicit instruction and this project's standing database rule, the actual migration is Development-phase work, gated on a further, separate approval of this design. When it is written:

1. **One new migration file**, creating the seven tables in dependency order: `marketing_automations` first (depends only on `marketing_segments`/`staff`, both already existing), then `marketing_automation_runs` (depends on `marketing_automations`), then `marketing_automation_logs` (depends on `marketing_automation_runs`/`customers`), then `marketing_campaign_automations` (depends on `marketing_campaigns`/`marketing_automations`), then `marketing_loyalty_rules` (depends on `staff`), then `marketing_loyalty_transactions` (depends on `marketing_loyalty_rules`/`customers`/`staff`), then `marketing_vouchers` (depends on `customers`/`staff`).
2. Reuse the existing `set_customers_updated_at()` trigger function (already defined by Marketing Foundation's migration, applied to `marketing_segments`/`marketing_campaigns`) for the four tables here with an `updated_at` column (`marketing_automations`, `marketing_loyalty_rules`, `marketing_vouchers`) — no new trigger function needed. (`marketing_automation_runs`, `marketing_automation_logs`, `marketing_loyalty_transactions`, `marketing_campaign_automations` are append-only/immutable-after-insert by design, so they get no `updated_at` column or trigger.)
3. Enable RLS + the standard anon/authenticated policies on all seven (§6).
4. No data backfill — all seven tables start empty; nothing pre-existing migrates into them.
5. **Zero changes to any existing table** — no column added to `marketing_segments`, `marketing_campaigns`, `customers`, `staff`, or any other table. This is the mechanism that keeps Marketing Foundation genuinely untouched while still letting Campaigns "reference" Automations (§1.1).

Per this project's three-gate pattern (approve design → approve SQL → approve execution, already used for Orders and Marketing Foundation): this document is gate one. A further explicit go-ahead is required before any SQL file is drafted, and another before it is executed against Development.

---

## 8. Self Review

**Judgment calls made, all disclosed inline in §2 rather than silently decided:**
1. `marketing_automation_logs.result` picklist (3 values) is proposed, not literally enumerated by the Spec. *(Revision 1 also flagged `marketing_automation_runs.result` here — superseded in Revision 2, now an explicit Product Owner value list, renamed `status`.)*
2. `marketing_loyalty_rules.status` (Active/Inactive) is added even though not named by the Loyalty decision, for the same reason every other configurable entity in this schema has a status field.
3. `marketing_vouchers` has no discount/value/benefit column and no `expires_at`-driven auto-transition logic design (only the field exists; whether "Expired" is set by a scheduled job or computed at read time is a Development-phase question, not decided here since the Spec doesn't ask for a scheduler to be designed).
4. `marketing_campaign_automations` cardinality is many-to-many (a campaign can reference multiple automations, an automation can be referenced by multiple campaigns) — the Spec doesn't restrict this either way; a stricter 1:1 would have been an invented rule.

**Revision 2 judgment calls, disclosed inline in §2:**
5. `marketing_automations.frequency` has no cross-column rule tying it to `trigger_type` (e.g. whether `Once` only pairs with `Manual`) — modeled as an independent column.
6. `marketing_vouchers.start_date`/`end_date` now overlap in purpose with the pre-existing `expires_at` column — not reconciled, since this round's scope was additive columns only, not a redesign of `expires_at`.
7. `marketing_loyalty_transactions.transaction_type` has no cross-column rule tying it to the sign of `points` (e.g. `Expire` implying negative) — modeled as an independent column.
8. `marketing_automation_runs`'s renamed `status` column has no dedicated "mixed outcome" value (Revision 1's `Partial Success` is gone, `Cancelled` is not a stand-in for it) — a Manual Broadcast run with some failed and some successful recipients now reads as whichever of `Success`/`Failed` the run-level logic assigns, with the real mixed detail visible only in `marketing_automation_logs`. Not resolved unilaterally since the task gave an explicit, closed 5-value list.

**Explicitly NOT designed, per Spec Rev.2's own scope narrowing (not an oversight):**
- Any table/column for the three event triggers (Customer First Purchase, VIP Level Changed, Days Since Last Purchase) — Spec Rev.2 decision #4 explicitly defers these; `marketing_automations.trigger_type` only allows `Manual`/`Daily Schedule`.
- Any Reward Rules table or Reward↔Voucher relationship — dropped from scope (Open Question #9 decision).
- Any redemption column/status/flow on `marketing_vouchers` — explicitly "No Redemption."
- Any scheduler/cron table (e.g. a `next_run_at` column or job queue) — "Daily Schedule" as a trigger *value* is designed; the mechanism that invokes automations on a timer is Development/infrastructure work, not a database design concern this document addresses.
- Any role→permission mapping table — the 4 new `Permission` literals (Spec §2.9) are application-layer (`types/permission.ts`), not a database concept; no schema change is needed for them.

**Backward compatibility confirmed:** every table in this document is new; the only reference to Marketing Foundation or Customer/Staff tables is via foreign key, never a column addition. `customers`, `products`, `orders`, `customer_purchases`, `reports`/`reports_bi`/sales-ledger views, `staff`, `marketing_segments`, `marketing_campaigns`, and the Permission Framework's existing tables/types are all untouched by this design.

---

## 9. Ready For Database Freeze

This Database Design (Draft, Revision 2) applies exactly the 5 requested field-level changes on top of the already-drafted Revision 1 — no other table, column, index, FK, or RLS decision was touched. No SQL, migration, repository, service, engine, dashboard, or permission code has been written. Awaiting explicit Database Freeze confirmation — in particular on the 8 disclosed judgment calls (§8, 4 carried from Revision 1 + 4 new this round) and Revision 1's "Explicitly NOT designed" list (unchanged), to confirm nothing there needs to be pulled into scope before this design is frozen and migration authoring begins.
