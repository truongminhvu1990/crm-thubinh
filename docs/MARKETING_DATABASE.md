# Marketing CRM Foundation — Database Design

**Module:** Marketing
**Status:** Revision 2 — **LOCKED**. Product Owner Decisions applied below (see `docs/MARKETING_SPEC.md` Revision 2 for the business-rule side of the same decisions); approved to proceed to Development.
**Phase:** Database design, now locked.
**Based on:** `docs/MARKETING_SPEC.md`, Revision 2 — **LOCKED**. This document does not redesign, reinterpret, or add business logic; every table and field below traces back to a section of that spec, cited inline as (Spec §N).

## Revision 2 — Product Owner Decisions Applied

Everything in Revision 1 below is unchanged **except** the following, per explicit Product Owner Decisions:

1. **`marketing_segments` gets a new `status` column** — `Enum: 'Active' / 'Inactive' / 'Archived'`, Required, defaults to `'Active'`. This directly resolves Revision 1's "Archive, blocked pending schema" gap flagged by `docs/MARKETING_UI.md` — see the updated `marketing_segments` table in §2 below.
2. **Segment delete behavior is now locked, not a hard-delete feature at all:** a segment referenced by any `marketing_campaigns` row must not be hard-deleted — this is already what `ON DELETE RESTRICT` on `marketing_campaigns.target_segment_id` enforces at the DB level (Revision 1 §6, unchanged). The only state change allowed for such a segment is setting `status` to `Inactive` or `Archived`. No DELETE UI/endpoint is built for `marketing_segments` in this sprint — status change is the sole "remove from active use" mechanism.
3. **Permission:** `marketing:manage` added to `types/permission.ts`'s `Permission` union (Development-phase code change, not a schema change — noted here for completeness since it was a Field-rule item). See `docs/MARKETING_SPEC.md` Revision 2 decision #3 for the naming-convention correction (colon, not dot).
4. **Campaign `end_date`:** Revision 1's "Optional, judgment call" is now confirmed **Nullable** — no schema change, just removes the "flagged" status.
5. **Segment Builder condition logic:** confirmed **flat AND/OR only** — no schema change, Revision 1's design already assumed this (§2, §11 item 7).
6. **Estimated Reach = Customer Count (V1):** no schema impact, both are live-computed, never stored.
7. All other Revision 1 §11 consolidated open items (numeric thresholds, VIP meaning, Favorite Category/Product source, `sales_commissions` usage, campaign status transitions) are **Value-column/application-logic questions, not schema questions** — resolved in `docs/MARKETING_SPEC.md` Revision 2, no table/column shape change needed here, consistent with what Revision 1 already predicted.

---

## 1. Database Architecture

Marketing introduces **four new tables** — `marketing_segments`, `marketing_segment_conditions`, `marketing_segment_members`, `marketing_campaigns`. No existing table (`customers`, `customer_purchases`, `products`, `staff`, `sales_commissions`) is altered; Marketing only *references* them, per Spec §1.2's "never duplicate business data" rule.

Conventions followed (matching every table already in this schema, e.g. `staff`, `activity_logs`, `orders`):
- Every table gets its own system-generated **internal identifier** (uuid) as Primary Key — same pattern as `customers.id`/`products.id`/`staff.id`.
- Fixed-choice fields (segment type, condition logic, campaign status) are **plain text with a fixed allow-list**, not a native database enum type — the same pattern already used by `staff.role`/`staff.status` and (per `ORDERS_DATABASE.md`) `orders.status`.
- RLS follows the uniform "allow full access to anon + authenticated" shape locked project-wide since `20260718_rls_authenticated_role.sql` (§7) — no bespoke row-level policy.

**No new table for Broadcast, Loyalty, or Voucher** (Features 7–9) — those stay UI-only "Coming Soon" placeholders per the Spec, so this design doesn't build a data model for them. Instead, this design satisfies the brief's "Support future Broadcast/Loyalty/Voucher/AI Marketing" principle by keeping `marketing_campaigns`/`marketing_segments` **channel-agnostic and customer-referencing only** — a future `broadcast_sends`, `loyalty_ledger`, or `vouchers` table can be added later as a pure addition (its own FK to `customers` and/or `marketing_campaigns`), without touching any table defined here.

**No report, cache, or materialized table anywhere in this design** — Segment Preview (Feature 3) and Marketing Dashboard (Feature 11) counts are computed live at query time, the same "no report table" rule already locked in `ORDERS_DATABASE.md` §1 and reused here, consistent with Feature 13 (Performance).

---

## 2. New Tables

| Table | Role |
|---|---|
| `marketing_segments` | One row per segment (Dynamic or Manual) — the named grouping itself (Spec §2.1). |
| `marketing_segment_conditions` | One row per condition inside a **Dynamic** segment's rule set (Spec §2.2). Empty for Manual segments. |
| `marketing_segment_members` | One row per customer manually added to a **Manual** segment (Spec §2.1). Empty for Dynamic segments. |
| `marketing_campaigns` | One row per campaign plan (Spec §2.4). |

### `marketing_segments`

| Field | Purpose | Business Data Type | Required / Optional | Snapshot / Reference |
|---|---|---|---|---|
| Internal ID | Primary Key. | Internal ID (system-generated) | Required | Native |
| Name | Segment display name. | Text | Required | Native |
| Description | Free-text description. | Text | Optional | Native |
| Segment Type | Dynamic or Manual (Spec §2.1). | Enum: `Dynamic` / `Manual` | Required | Native |
| Condition Logic | AND/OR combinator across this segment's own conditions (Spec §2.2). Meaningful only when Segment Type = Dynamic. | Enum: `AND` / `OR` | Required for Dynamic; not applicable to Manual | Native |
| **Status** *(Revision 2, new)* | Active/Inactive/Archived lifecycle state (Spec Revision 2 decision). Drives the Segment Builder's Archive/Restore actions and exclusion from the Campaign target-segment picker for new campaigns once not `Active`. | Enum: `Active` / `Inactive` / `Archived` | Required, defaults to `Active` | Native |
| Created By | Staff member who created the segment. | Reference (→ `staff`) | Optional (nullable if staff record is later removed) | Reference |
| Created timestamp | Audit — when the row was inserted. | Timestamp | Required (system-set) | Native |
| Updated timestamp | Audit — when the row last changed. | Timestamp | Required (system-set) | Native |

**Deliberately absent:** an "is template" flag. The brief's example segments (VIP, New Customer, No Purchase 30/60/90 Days, etc., Spec §2.1) are treated as **UI-level starting suggestions**, not a stored database concept — picking one just creates a normal Dynamic segment row plus its condition rows. Adding a dedicated template field/table wasn't asked for by the Spec, so it isn't added here (Field rule).

### `marketing_segment_conditions`

| Field | Purpose | Business Data Type | Required / Optional | Snapshot / Reference |
|---|---|---|---|---|
| Internal ID | Primary Key. | Internal ID (system-generated) | Required | Native |
| Segment reference | Which segment this condition belongs to. | Reference (→ `marketing_segments`) | Required | Reference |
| Field | Which builder condition this row represents — one of the 13 keys named verbatim in Spec §2.2: Purchase Count, Lifetime Revenue, Last Purchase, First Purchase, Birthday, Province, District, Assigned Staff, Favorite Category, Favorite Product, Favorite Color, Budget, VIP Level. | Fixed picklist (13 values) | Required | Native |
| Operator | Comparison operator appropriate to the field's data type (e.g. equals / greater than / less than / between / within last N days / contains). | Fixed picklist | Required | Native |
| Value | The comparison value(s) this condition tests against — a single value, a two-value range, or a list, depending on Field + Operator. | Structured value (shape varies by Field — see note below) | Required | Native |
| Sort Order | Display/evaluation order within the segment. | Whole number | Required (defaults to 0) | Native |

**Why Value is a variable-shape structured field, not a fixed column per condition:** Spec §5 Open Questions #4–#8 leave the exact semantics of several conditions unresolved (what "VIP" means, whether Favorite Category reads a wishlist field or a purchase-history derivation, the numeric cutoffs for "New"/"High Value"/etc., whether grouping nests). None of those answers change this table's *shape* — they only change what gets written into Field/Operator/Value at Development time. Structuring the schema this way means Database Design doesn't need those questions answered to proceed, but Development still does before it can write real evaluation logic.

### `marketing_segment_members`

| Field | Purpose | Business Data Type | Required / Optional | Snapshot / Reference |
|---|---|---|---|---|
| Internal ID | Primary Key. | Internal ID (system-generated) | Required | Native |
| Segment reference | Which Manual segment this membership belongs to. | Reference (→ `marketing_segments`) | Required | Reference |
| Customer reference | Which customer was added. | Reference (→ `customers`) | Required | Reference |
| Added By | Staff member who added this customer to the segment. | Reference (→ `staff`) | Optional | Reference |
| Added timestamp | When this customer was added. | Timestamp | Required (system-set) | Native |

No customer field is copied onto this table — only the reference, per Spec §1.2's "no duplication" rule. A given (segment, customer) pair can only appear once (§5 Constraints).

### `marketing_campaigns`

| Field | Purpose | Business Data Type | Required / Optional | Snapshot / Reference |
|---|---|---|---|---|
| Internal ID | Primary Key. | Internal ID (system-generated) | Required | Native |
| Name | Campaign name. | Text | Required | Native |
| Description | Free-text description. | Text | Optional | Native |
| Target Segment reference | Which segment this campaign targets (Spec §2.4). | Reference (→ `marketing_segments`) | Required | Reference |
| Start Date | When the campaign is planned to start. | Date | Required | Native |
| End Date | When the campaign is planned to end. | Date | Optional — see note below | Native |
| Owner | Staff member responsible for this campaign. | Reference (→ `staff`) | Required | Reference |
| Status | Draft / Active / Paused / Completed / Cancelled (Spec §2.4, exact 5 values). | Enum (5 values) | Required (defaults to `Draft`) | Native |
| Created timestamp | Audit — when the row was inserted. | Timestamp | Required (system-set) | Native |
| Updated timestamp | Audit — when the row last changed. | Timestamp | Required (system-set) | Native |

**Judgment call:** End Date is modeled as Optional even though the Spec lists it as a plain field with no stated optionality, to allow an open-ended/ongoing campaign. Flagged for confirmation in §11 rather than silently assumed either way.

---

## 3. Relationships

- One `marketing_segments` row has many `marketing_segment_conditions` rows — 1:N (Dynamic segments only).
- One `marketing_segments` row has many `marketing_segment_members` rows — 1:N (Manual segments only).
- One `marketing_segments` row can be targeted by many `marketing_campaigns` rows — 1:N. A segment is reusable across multiple campaigns rather than being cloned per campaign, which keeps a condition set defined exactly once.
- One `staff` row can create many segments and own many campaigns — 1:N in both directions, both nullable/optional so staff departure doesn't break existing records.
- One `customers` row can appear in many `marketing_segment_members` rows across different Manual segments — realized as N:N between `customers` and `marketing_segments`, through the `marketing_segment_members` join table.
- No Marketing table has a foreign key into `customer_purchases`, `products`, or `sales_commissions`. Those are read live at query time to evaluate Dynamic segment conditions (Feature 2/3) and Marketing Dashboard cards (Feature 11) — never joined at the schema/constraint level, consistent with "no duplication" (Spec §1.2).

---

## 4. Index Strategy

New indexes on the new tables:

| Index | Table(column) | Backs |
|---|---|---|
| `idx_marketing_segments_type` | `marketing_segments(segment_type)` | Marketing Dashboard's Segment Count (Feature 11), type-filtered segment lists. |
| `idx_marketing_segments_status` *(Revision 2, new)* | `marketing_segments(status)` | Default Segment List view (Active only), Campaign target-segment picker exclusion of non-Active segments. |
| `idx_segment_conditions_segment_id` | `marketing_segment_conditions(segment_id)` | Fetching a segment's full condition set (Segment Builder, Segment Preview). |
| `idx_segment_members_segment_id` | `marketing_segment_members(segment_id)` | Paginated Manual segment membership list. |
| `idx_segment_members_customer_id` | `marketing_segment_members(customer_id)` | Reverse lookup: which Manual segments a given customer belongs to (Customer Timeline, Feature 6). |
| (unique) `segment_id, customer_id` | `marketing_segment_members` | Prevents duplicate membership rows; also serves as a lookup index for the pair. |
| `idx_campaigns_status` | `marketing_campaigns(status)` | Campaign Dashboard counts (Feature 5). |
| `idx_campaigns_target_segment_id` | `marketing_campaigns(target_segment_id)` | Customer Timeline's Campaign History (Feature 6): campaigns targeting a segment a customer belongs to; also needed to check for dependents before a segment delete (§6). |
| `idx_campaigns_owner_staff_id` | `marketing_campaigns(owner_staff_id)` | "My campaigns" filtering. |
| `idx_campaigns_start_date`, `idx_campaigns_end_date` | `marketing_campaigns` | Date-range filtering and pagination (Feature 13). |

**Supporting indexes needed on existing tables** (no column change — index-only, purely additive, but flagged separately since these tables are LOCKED, per the Impact rule):

| Index | Table(column) | Backs | Status |
|---|---|---|---|
| `idx_customers_birthday` | `customers(birthday)` | Birthday/Birthday This Month/Birthday Today conditions and segments (Features 1, 2, 10), Marketing Dashboard's two Birthday cards (Feature 11) — evaluated on essentially every Marketing page load. | New, proposed by this document. |
| `idx_customers_province` | `customers(province)` | Province condition (Feature 2). | New, proposed by this document. |
| `idx_customers_district` | `customers(district)` | District condition (Feature 2). | New, proposed by this document. |
| `idx_customer_purchases_sale_date` | `customer_purchases(sale_date)` | Last/First Purchase, No-Purchase-30/60/90-Days conditions and Dashboard cards. | **Already drafted, not yet applied** — `20260718_performance_indexes.sql`. |
| `idx_customer_purchases_product_id` | `customer_purchases(product_id)` | Favorite Category/Favorite Product conditions (joined to `products`). | **Already drafted, not yet applied** — same file. |
| `idx_customers_vip_level` | `customers(vip_level)` | VIP Level condition. | **Already drafted, not yet applied** — same file. |

Flagging this so the eventual Marketing migration doesn't draft the same three indexes a second time in a different file — recommend it either depends on `20260718_performance_indexes.sql` being applied first, or (if that file is still unapplied by the time Marketing reaches Development) folds those three statements in directly and treats that older file as superseded for those three indexes specifically.

---

## 5. Constraints

- `marketing_segments.segment_type`: fixed allow-list (`Dynamic`, `Manual`).
- `marketing_segments.condition_logic`: fixed allow-list (`AND`, `OR`).
- `marketing_segments.status` *(Revision 2, new)*: fixed allow-list (`Active`, `Inactive`, `Archived`), defaults to `Active`.
- `marketing_segment_conditions.field`: fixed allow-list, exactly the 13 keys named in Spec §2.2 — prevents a stray or mistyped condition key from ever silently failing to evaluate.
- `marketing_campaigns.status`: fixed allow-list, exactly the 5 values named in Spec §2.4, defaulting to `Draft`.
- `marketing_segment_members`: uniqueness on (Segment reference, Customer reference) — a customer cannot be manually added to the same segment twice.
- `marketing_campaigns`: End Date, when present, should not be before Start Date — flagged as a minor open point (enforceable at the database or application layer; not a blocking decision for this document).
- Every "Reference" column above is required (NOT NULL) except where explicitly marked Optional (Created By, Added By, End Date) — same Required/Optional convention used in `ORDERS_DATABASE.md` §4.

---

## 6. Foreign Keys

| Column | References | On Delete | Rationale |
|---|---|---|---|
| `marketing_segment_conditions.segment_id` | `marketing_segments.id` | Cascade | A condition row has no meaning without its parent segment. |
| `marketing_segment_members.segment_id` | `marketing_segments.id` | Cascade | Same reasoning — a membership row has no meaning without its parent segment. |
| `marketing_segment_members.customer_id` | `customers.id` | Cascade | Matches the existing `customer_purchases.customer_id → customers.id` precedent (`20260716_crm_baseline_customer_purchases.sql`) — if a customer is deleted, membership rows referencing them are meaningless. |
| `marketing_segments.created_by` | `staff.id` | Set Null | Matches the existing staff-reference precedent (`activity_logs.staff_id`, `customers.assigned_staff_id`) — a staff member leaving doesn't destroy segment history. |
| `marketing_campaigns.owner_staff_id` | `staff.id` | Set Null | Same staff-reference precedent. |
| `marketing_campaigns.target_segment_id` | `marketing_segments.id` | **Restrict** | A campaign without a target segment contradicts Spec §2.4 (Target Segment is a required field). Restrict blocks deleting a segment that's still targeted by any campaign, forcing a staff member to reassign or cancel the campaign first. **Judgment call, flagged in §11** — the Spec doesn't specify delete-order behavior; the alternative (Set Null, treating a null target as an implicit "Cancelled" state) would invent business logic the Spec doesn't state. |

---

## 7. RLS Strategy

All four new tables get Row Level Security enabled with the same uniform "allow full access to anon + authenticated" policy shape already locked project-wide (`20260718_rls_authenticated_role.sql`) and applied to every operational table added since (`staff`, `activity_logs`, `sales_commissions`, etc.) — no bespoke, Marketing-specific row-level policy.

This is consistent with Feature 12 ("reuse existing Permission Framework, no new permission system"): this project's actual authorization boundary is the application-level `lib/permission.ts` / route guards, not differentiated RLS — Marketing doesn't introduce a different pattern.

---

## 8. Performance Considerations

- Feature 13's binding constraint (server-side computation, pagination, no unnecessary loading) applies to every list/count surface this schema supports: Segment Preview, Campaign list, Marketing Dashboard, Manual segment membership list, Birthday Center.
- **Dynamic segment evaluation is inherently a variable query, not a fixed view.** Because a segment's condition set is an arbitrary combination of Field/Operator/Value rows (§2), "which customers currently match" can't be answered by one static SQL view the way a fixed report can — it has to be assembled at the application/service layer from the stored conditions at query time. This document doesn't design that query builder (a Development-phase concern), but the indexes in §4 are chosen specifically to keep whatever it builds fast — every condition Field a customer can be filtered/sorted on has a backing index.
- Segment Preview's Sample Customers (Feature 3) must be a `LIMIT`-bound, paginated query — never "fetch all matches, then slice in application code."
- Marketing Dashboard's 7 cards (Feature 11) are 7 independent aggregate queries; none needs to join all of them together in one round trip.
- Manual segment membership (potentially hundreds of customers) is paginated through `marketing_segment_members` and its indexes — never loaded as a full list into memory at once.
- No materialized view or report/cache table is introduced (§1) — every count is computed live, matching the Orders/Market Intelligence precedent of "no cache table," at the cost of depending on the indexes above to keep live computation fast as data grows.

---

## 9. Migration Plan

This document proposes no SQL — the actual migration is Development-phase work, gated on approval of this design. When it is written:

1. **One new migration file**, creating the four tables in dependency order: `marketing_segments` first (no dependencies), then `marketing_segment_conditions` / `marketing_segment_members` / `marketing_campaigns` (each references `marketing_segments`, and the latter two also reference `staff`/`customers`).
2. Enable RLS + the standard anon/authenticated policies on all four (§7).
3. Add the three new indexes on `customers` (`birthday`, `province`, `district` — §4) — purely additive, no column change.
4. Reconcile with `20260718_performance_indexes.sql` (§4) rather than re-drafting `customer_purchases.sale_date`/`product_id` and `customers.vip_level` a second time.
5. No data backfill — all four tables start empty; there is nothing pre-existing to migrate into them.

Per this project's standing database rule, no SQL is written until this Database Design document is itself approved, and even then, execution against the Development database requires a further, separate explicit go-ahead — the same three-gate pattern (approve plan → approve SQL → approve execution) already used for Orders.

---

## 10. Backward Compatibility

- **Zero impact on existing table data or behavior.** No column is added, removed, or renamed on `customers`, `customer_purchases`, `products`, `staff`, or `sales_commissions` — the only touch to an existing table is three new indexes on `customers`, which change no data and no query result, only query speed.
- **Zero impact on existing modules' code.** Customer/Product/Staff/Commission service files are not modified; Marketing reads them only via foreign keys and read queries.
- **The `assigned_salesperson` (free text) vs. `assigned_staff_id` (FK) duality on `customers` is carried forward unchanged** — Marketing's Assigned Staff condition (Spec §2.2) reads `assigned_staff_id` only, consistent with Staff Management's already-established preference for the structured FK over the legacy free-text field.
- **Fully additive and reversible before Development starts.** If this design is not approved or is revised, nothing outside the four new tables (and the three new `customers` indexes, if pre-applied) would ever need to be undone.

---

## 11. Consolidated Open Items — ALL RESOLVED in Revision 2

Kept below for historical record; every item now has an explicit Product Owner Decision (see Revision 2 section at the top of this document and `docs/MARKETING_SPEC.md` Revision 2).

1. Manifest/sprint-numbering mismatch — resolved: Marketing confirmed as current module, "Sprint v3.0.0" confirmed, package.json version scheme waived.
2. `sales_commissions` — resolved: listed as core data, not read by any rule this sprint.
3. Which permission gates this module — resolved: new `marketing:manage` literal added.
4. Exact meaning of "VIP" — resolved: `customers.vip_level` only.
5. Numeric thresholds — resolved: not hardcoded; user-supplied condition values (Segment Builder), except the already-fixed 30/60/90-day windows.
6. Favorite Category/Product/Color exact source — resolved: Category/Product calculated from `customer_purchases`; Color reuses `customers.favorite_color`.
7. Flat vs. nested AND/OR — resolved: **flat confirmed**, no schema change needed.
8. Customer Count vs. Estimated Reach — resolved: identical (V1).
9. Campaign status transition rules — resolved: `Draft → Active → Paused → Active → Completed`, or `Draft → Cancelled`; Completed/Cancelled terminal. No Cancelled dashboard card added.
10. End Date optionality — resolved: confirmed Nullable.
11. Segment delete-guard behavior — resolved: `RESTRICT` confirmed (unchanged), paired with the new `status` column as the actual "remove from use" mechanism (§Revision 2 above).

---

Database Design Revision 2 — **LOCKED**. Proceeding to migration authoring and Development.
