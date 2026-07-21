# Marketing CRM Foundation — Business Design Spec

**Module:** Marketing (task brief labels it "Sprint v3.0.0 — Marketing CRM Foundation")
**Status:** Revision 2 — **LOCKED**. Product Owner Decisions applied below; approved to proceed to Development.
**Phase:** Business design, now locked. Database Design and UI Design (Revision 2 each) are locked in their own documents.

**Process note (Revision 1 history, kept for record):** the task brief that opened this module was headed "STATUS: APPROVED / Business Rules are LOCKED / Start immediately," skipping the normal Business Design → Product Review → Database Design → Product Review → UI Design → Product Review → Development sequence. Revision 1 of this document flagged that as a mismatch (Open Question #1) since no prior review round had actually happened and `PROJECT_MANIFEST.md` still listed Marketing as `PLANNED`. The Product Owner has now reviewed Revision 1's 9 Open Questions and issued explicit decisions (below), confirming Marketing as the current module under "Sprint v3.0.0" (manifest/package-version reconciliation waived — ignore `package.json`'s version scheme for this module's sprint numbering).

## Revision 2 — Product Owner Decisions Applied

| # | Open Question | Decision |
|---|---|---|
| 2 | `sales_commissions` source table | Not read by any Feature 1–11 rule; remains listed as a core CRM table but no condition/metric in this sprint uses it. |
| 3 | Which permission gates Marketing | Reuse the existing Permission Framework; add one new literal, **`marketing:manage`** (Product Owner decision named it "marketing.manage" with a dot; corrected to the colon convention every existing `Permission` literal actually uses — `staff:view`, `customers:manage`, `commission:approve`, `settings:manage` — a disclosed spelling fix, not a business decision change). |
| 4 | "VIP" meaning | `customers.vip_level` **only** — not `customer_tags`. |
| 5 | Numeric thresholds (New/High/Low Value) | **Do not hardcode.** High Value / Low Value are not preset thresholds — the user defines the comparison value directly in the Segment Builder condition (e.g. "Lifetime Revenue > 50,000,000"). New Customer uses **First Purchase within Last X Days**, where X is a user-supplied condition value, not a fixed constant. The 30/60/90-day No-Purchase windows (§2.1) remain fixed as originally specified (they are named literally in the brief's example segments, unlike "New"/"High/Low Value" which were never given a number). |
| 6 | Favorite Category/Product/Color source | Favorite Category and Favorite Product are **calculated from `customer_purchases`** (purchase-history-derived, joined to `products`). Favorite Color **reuses `customers.favorite_color`** (the existing wishlist field) — confirmed, not purchase-derived. |
| 7 | Flat vs. nested AND/OR | **Flat only** — one AND or one OR combinator per segment, applied across all its conditions. No nested groups. |
| 8 | Customer Count vs. Estimated Reach | **V1: Estimated Reach = Customer Count** (identical value, reserved label for a future channel-reachability qualifier once Broadcast is real). |
| 9 | Campaign status transitions / Cancelled dashboard gap | Lifecycle locked to: `Draft → Active → Paused → Active → Completed`, or `Draft → Cancelled`. **Completed and Cancelled are terminal** — no transition out of either. The Campaign Dashboard's card list is unchanged (no Cancelled card added). |

**New decisions (not original Open Questions, issued directly by the Product Owner):**
- **Segment status:** `marketing_segments` gets a `status` field — enum `Active` / `Inactive` / `Archived` (see `docs/MARKETING_DATABASE.md` Revision 2 for the column definition). Default `Active`.
- **Segment delete:** a segment that is targeted by any campaign must **not** be hard-deleted. The only allowed state change for such a segment is to `Inactive` or `Archived` — hard delete is not a feature this sprint exposes at all (superseding Revision 1's UI doc's "Archive, blocked pending schema" note — it's unblocked now).
- **Campaign `end_date`:** confirmed **Nullable** (Revision 1's judgment call is now locked, not just assumed).
- **Sidebar:** the nested/expandable "Marketing" parent + 7 children navigation tree is confirmed, and must be built as a **reusable grouped-navigation pattern** (not a one-off), since Inventory and AI CRM are named as future consumers of the same primitive.

---

## 1. Business Design

### 1.1 Purpose

Give sales/marketing staff a foundation for organizing customers into segments and planning campaigns against them, in order to increase repeat purchases, retention, and customer lifetime value. This sprint builds the **foundation only** — segmentation, campaign records, a dashboard, and placeholder surfaces for channels/loyalty/vouchers that will be wired up in later sprints. No message is actually sent to a customer by anything built in this phase.

### 1.2 Source of truth (binding on every rule below)

Per the task brief and Project Rules V1.1's Database rule ("never duplicate business data"), this module **reads** existing tables only and introduces no copies of business data:

- `customers`
- `customer_purchases`
- `products`
- `staff`
- `sales_commissions`

Any new table this module eventually needs (segment definitions, segment conditions, campaign records — see §2.1/§2.2/§2.4) stores only *marketing-specific* data that doesn't already exist elsewhere (segment name/type/conditions, campaign name/dates/owner/status) — never a copy of a customer/product/staff field. Segment membership for **Dynamic** segments is never stored at all; it's computed live from the condition set against the tables above (§2.3).

### 1.3 Module responsibilities (proposed, mirrors the precedent set by Market Intelligence/Reports)

| Surface | Responsibility |
|---|---|
| **Customer module** (LOCKED) | System of record for customer fields. Marketing never edits a Customer field, form, or write path. |
| **Reports / Dashboard / Market Intelligence** (LOCKED) | Existing analytics stay as-is. Marketing Dashboard (Feature 11) is a separate, new surface — it does not replace or edit any existing dashboard/report. |
| **Marketing** (this module) | Segmentation, campaign planning/tracking, a marketing-specific dashboard, and placeholder surfaces for future channel/loyalty/voucher work. |

### 1.4 Connection to other modules (binding — "Do Not" list from the task brief)

| Module | Relationship to Marketing |
|---|---|
| **Customers** (LOCKED) | Read-only source of truth for every segment condition. No Customer field, form, or write path changes. |
| **Customer Purchases** (part of Customer module) | Read-only source for Purchase Count / Lifetime Revenue / Last Purchase / First Purchase / Favorite Category / Favorite Product conditions (§2.2). |
| **Products** (LOCKED) | Read-only source for Favorite Category/Product (joined via Customer Purchases). No Product field, form, or write path changes. |
| **Staff** (LOCKED) | Read-only source for Assigned Staff condition and Campaign Owner. No Staff field, form, or write path changes. |
| **Sales Commission** (LOCKED) | Named as a source-of-truth table by the brief; no Marketing feature in this sprint reads it directly yet — flagged in Open Question #2. |
| **Orders** (BLOCKED) | No dependency. Marketing does not read from, write to, or wait on Orders. |
| **Permission Framework** (LOCKED, `lib/permission.ts` / `types/permission.ts`) | Reused as-is (Feature 12) — no new permission system. See Open Question #3 for the one open point (which existing permission, if any, gates this module). |
| **Dashboard, Reports, Sales Ledger, Data Verification, VIP Care, Follow-up, Activity Log** (all LOCKED, per the brief's explicit "Do Not" list) | Not redesigned, not modified. Any future cross-link (e.g. a Marketing Dashboard card that links out) is additive UI only, not a change to those modules' own logic. |

---

## 2. Feature Business Rules

### 2.1 Feature 1 — Customer Segments

A **Segment** is a named grouping of customers, of exactly one of two kinds:

- **Dynamic Segment** — membership is a live query result: every customer currently matching the segment's condition set (§2.2), re-evaluated whenever the segment is viewed. Nothing about *which customers* belong is ever stored.
- **Manual Segment** — membership is an explicit, staff-curated list of customers, added/removed by hand rather than by condition. (Storing that list is a Database Design concern — out of scope for this document — but functionally a Manual segment does not carry a live condition set the way a Dynamic one does.)

The task brief's example segments are **pre-built Dynamic segment templates** (a starting condition set staff can use as-is or clone), not a separate hard-coded segment type:

| Example | Condition basis |
|---|---|
| VIP | `customers.vip_level` / `customer_tags` contains "VIP" — see Open Question #4 |
| New Customer | First Purchase within a recent window (exact window TBD — Open Question #5) |
| Returning Customer | Purchase Count ≥ 2 |
| No Purchase 30/60/90 Days | Last Purchase older than 30/60/90 days (or never purchased) |
| High Value / Low Value | Lifetime Revenue above/below a threshold (threshold TBD — Open Question #5) |
| Birthday This Month / Birthday Today | `customers.birthday` matches the current month / today (month+day only — no year-of-birth requirement, matching how the Birthday Center (§2.10) will read the same field) |

### 2.2 Feature 2 — Segment Builder

A segment's Dynamic condition set is built from these fields, each mapped to an existing column (no new field is introduced by this document):

| Builder condition | Existing source |
|---|---|
| Purchase Count | `COUNT(customer_purchases)` per customer |
| Lifetime Revenue | `SUM(customer_purchases.sale_price)` per customer |
| Last Purchase | `MAX(customer_purchases.sale_date)` per customer |
| First Purchase | `MIN(customer_purchases.sale_date)` per customer |
| Birthday | `customers.birthday` |
| Province | `customers.province` |
| District | `customers.district` |
| Assigned Staff | `customers.assigned_staff_id` (→ `staff`) |
| Favorite Category | Derived — most-purchased `products.category` across a customer's `customer_purchases` (no stored "favorite category" field exists; see Open Question #6) |
| Favorite Product | Derived — most-purchased `products.product_name`/`product_id` across a customer's `customer_purchases` (no stored field; same open question) |
| Favorite Color | `customers.favorite_color` (existing wishlist field — distinct from the *purchased*-color derivation Favorite Category/Product use; see Open Question #6 on which is intended) |
| Budget | `customers.budget` (existing free-text field, already parsed to a VND range elsewhere — see `docs/AI_JADE_SPEC.md` §1.2) |
| VIP Level | `customers.vip_level` (existing pipeline-stage field — see Open Question #4 on whether this is the intended meaning of "VIP Level") |

Conditions combine with **AND** / **OR** exactly as named in the brief — no nested group logic (e.g. `(A AND B) OR C`) is described in the brief, so this document assumes a single flat list joined by one chosen operator, not arbitrary nesting. Flagged as Open Question #7.

### 2.3 Feature 3 — Segment Preview

For a Dynamic segment being built or edited: Customer Count, Estimated Reach, and a Sample Customers list, computed live against the condition set — never persisted, never a copy of customer data (per §1.2). A Refresh Preview action re-runs the same live query. "Estimated Reach" is listed separately from "Customer Count" in the brief without a distinct definition — flagged as Open Question #8 (they may be the same number today, with "Estimated Reach" reserved for a future channel-reachability qualifier once Broadcast Center, §2.7, is more than a placeholder).

### 2.4 Feature 4 — Campaign

A Campaign is a planning record with the fields the brief lists — Campaign Name, Description, Target Segment (FK to a Segment), Start Date, End Date, Owner (FK to `staff`), Status. Status is exactly the five values named: Draft, Active, Paused, Completed, Cancelled. The brief does not specify the allowed status transitions (e.g. can a Completed campaign return to Active?) — flagged as Open Question #9. No send/execution behavior is attached to a Campaign in this sprint (that's Broadcast Center, explicitly foundation-only, §2.7) — a Campaign here is a plan, not an action.

### 2.5 Feature 5 — Campaign Dashboard

Counts of Campaigns grouped by status: Total, Running (= Active), Completed, Paused, Draft. Cancelled is tracked on the Campaign record (§2.4) but the brief's dashboard card list doesn't include a Cancelled count — carried forward as-is, not added unilaterally (flagged in Open Question #9 alongside the transition question).

### 2.6 Feature 6 — Customer Timeline (extension)

Adds a "Campaign History" section to the existing Customer Detail timeline, showing which Campaigns this customer's segment(s) have made them a target of. Per the brief, this is **future integration only** — it displays plan-level association (customer was in a targeted segment when a campaign ran), not any send/open/click record, since no sending exists yet (§2.7). This extends the existing Customer Detail page additively; it does not alter the existing timeline's current content (notes, tag changes, follow-up events — see `CustomerNotesTimeline.tsx`).

### 2.7 Feature 7 — Broadcast Center

Foundation only: a page listing the four channels (Facebook, Zalo, Email, SMS), each shown with a "Coming Soon" state. No message composition, no recipient targeting, no send capability, no channel API integration of any kind in this sprint.

### 2.8 Feature 8 — Loyalty Foundation

UI only: Points, Tier, Rewards, each shown with a "Coming Soon" state. No points ledger, no tier calculation, no rewards catalog, no data model — this sprint does not read or write any loyalty-related value anywhere.

### 2.9 Feature 9 — Voucher Foundation

UI only: a "Coming Soon" state. No voucher codes, no redemption logic, no data model.

### 2.10 Feature 10 — Birthday Center

Reads `customers.birthday` (month+day) to group customers into Today / This Week / This Month / Upcoming, matching the same field Feature 1's Birthday segments use (§2.1). Clicking a customer navigates to the existing Customer Detail page — no new detail view.

### 2.11 Feature 11 — Marketing Dashboard

Cards: Segment Count, Campaign Count, Birthday Today, Birthday This Month, Customers Without Purchase 30/60/90 Days. Every count is computed live from existing data (customers, customer_purchases) plus the new Segment/Campaign records (§2.1/§2.4) — no new aggregate table.

### 2.12 Feature 12 — Permissions

Reuses `lib/permission.ts` / `types/permission.ts` as-is — no new permission system, no new role. See Open Question #3 for which existing permission (or a new `Permission` literal added to the existing framework, which is a smaller ask than "a new system") gates access to Segments/Campaigns.

### 2.13 Feature 13 — Performance

Binding constraint carried into Database/UI/Development phases: every list/count in this module (Segment Preview, Campaign list, Marketing Dashboard, Birthday Center) is computed server-side with pagination where a list is shown — no client-side fetch-all-then-filter pattern, no loading of data not needed for the current view.

---

## 3. Data Sources

No new field, column, or table is proposed by this document (Database Design is a separate, later phase). Everything below already exists:

- **`customers`** — `birthday`, `province`, `district`, `assigned_staff_id`, `favorite_color`, `budget`, `vip_level`, `customer_tags`, `created_at`.
- **`customer_purchases`** — `customer_id`, `product_id`, `sale_price`, `sale_date`. Sole source for Purchase Count, Lifetime Revenue, Last/First Purchase, and (joined to `products`) Favorite Category/Product.
- **`products`** — `category`, `product_name`, `product_id`. Read only via the join above; no Product field/form/write-path change.
- **`staff`** — `id`, `full_name`, `role`. Source for Assigned Staff (segment condition) and Campaign Owner.
- **`sales_commissions`** — named as a source-of-truth table by the brief; not read by any Feature 1–11 rule in this document (see Open Question #2).

---

## 4. Out of Scope

- **Redesigning Customers, Products, Orders, Dashboard, Reports, Sales Ledger, Data Verification, Sales Commission, Staff, VIP Care, Follow-up, Permission, or Activity Log** — all explicitly named in the brief's "Do Not" list. This module integrates with them read-only.
- **Any actual message send** — Broadcast Center (§2.7) is Coming Soon only; no Facebook/Zalo/Email/SMS API integration.
- **Any loyalty points/tier/reward calculation** — Loyalty Foundation (§2.8) is UI only.
- **Any voucher code/redemption logic** — Voucher Foundation (§2.9) is UI only.
- **Any new permission system or role** — Feature 12 reuses the existing framework exactly.
- **Any client-side full-table fetch pattern** — Feature 13 binds every surface to server-side computation with pagination.
- **Duplicating customer/purchase/product/staff/commission data into new tables** — segments/campaigns store only their own planning metadata (§1.2).

---

## 5. Open Questions — RESOLVED in Revision 2 (see decisions table above)

Kept below for historical record only; every item has an explicit Product Owner Decision now.

1. **Process/manifest mismatch (restated from the header note).** `PROJECT_MANIFEST.md` lists Marketing as `PLANNED`, not in the Sprint Roadmap (1–6), and the task brief's "Sprint v3.0.0" doesn't match this project's version scheme (`package.json` is currently `0.1.0`). Confirm Marketing is the current module assignment and how (or whether) to reconcile the manifest, same pattern as the Jade Intelligence/Market Intelligence sprint-numbering mismatches noted in those specs.
2. **`sales_commissions` as a source of truth:** the brief lists it among the five source tables, but no Feature 1–11 rule in this draft reads it. Is a commission-based condition/metric intended somewhere (e.g. a segment condition on commission-generating customers), or is it listed simply because it's part of the CRM's core data and may be read by a later Marketing increment?
3. **Which permission gates this module (Feature 12):** today's `ROLE_PERMISSIONS` gives the `Marketing` role only `customers:manage`. Should Segments/Campaigns be gated by that same existing permission, or does this module need one new `Permission` literal added to the existing enum (e.g. `marketing:manage`) — a smaller change than "a new system," but still a new field in `types/permission.ts` requiring explicit approval per the Field rule?
4. **"VIP" meaning, used in two places:** the VIP segment example (§2.1) and the VIP Level builder condition (§2.2) — does "VIP" mean `customers.vip_level` (a free-text pipeline-stage field, not a dedicated VIP flag), the `customer_tags` list containing the literal tag "VIP" (`PRESET_CUSTOMER_TAGS`), or both combined?
5. **Numeric thresholds:** "New Customer," "High Value," "Low Value," and the 30/60/90-day windows need concrete cutoffs (e.g. how many days counts as "new," what revenue splits High from Low). None are specified in the brief.
6. **Favorite Category/Product/Color — purchased vs. wishlist:** Favorite Category/Product (§2.2) would be *derived* from purchase history (no stored field exists), while Favorite Color already exists as a *stated preference* field (`customers.favorite_color`, wishlist data, not necessarily what they've bought). Should Favorite Category and Favorite Product also read from the existing wishlist-style fields where possible (`favorite_type` most resembles "Favorite Category"), or are all three meant to be purchase-history-derived for consistency with each other?
7. **Condition grouping:** confirm a segment's AND/OR is one flat combinator across all its conditions, not nested groups — the brief doesn't describe nesting.
8. **Customer Count vs. Estimated Reach (§2.3):** confirm these are the same number in this foundation sprint, or if "Estimated Reach" anticipates a future channel-eligibility filter not yet defined.
9. **Campaign status transitions and the Cancelled dashboard gap (§2.4/§2.5):** what transitions are valid between Draft/Active/Paused/Completed/Cancelled, and should the Campaign Dashboard (which lists Total/Running/Completed/Paused/Draft) also show a Cancelled count?

---

Business Design Revision 2 — **LOCKED**. All Open Questions resolved via explicit Product Owner Decisions (above). Proceeding to Database Design / UI Design Revision 2 and Development.
