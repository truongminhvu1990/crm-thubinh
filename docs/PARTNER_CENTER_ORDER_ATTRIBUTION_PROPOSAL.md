# Order — Revision Proposal (Partner Attribution Field)

**Status:** APPROVED / APPLIED — Product Owner Revision 2026-07-31 ("Partner Center — Product Owner Revision," Decision 4: *"Order Integration is NOT blocked. Add Partner (optional) to Order. Store partner_id only."*). `docs/03_ORDER_SPEC.md` (Revision 5) and `docs/ORDERS_DATABASE.md` (Revision 6) have both been updated to record this field — see those documents' own Revision History. `supabase/migrations/20260811_orders_partner_id.sql` is the applied (drafted; awaiting the same manual DB-apply step as every other migration this session) change. This document is retained as the decision record.
**Prepared by:** Claude (Engineering Lead), per Product Owner Implementation Task 2026-07-31, Module: Partner Center.
**Objective:** Give the already-confirmed "Partner Attribution" Business Concept (`docs/12_PARTNER_CENTER_SPEC.md` §7, Decision 3, LOCKED) an actual field to attach to, so an Order can reference an Attributed Partner.
**Scope:** Proposes exactly one addition — a nullable `attributed_partner_id` reference on `orders`. Does not modify Payment, Compensation, Settlement, or any Business Event. Does not modify `docs/12_PARTNER_CENTER_SPEC.md` in any way — that document is unaffected and unchanged by this proposal.

---

## 1. What triggered this proposal

The Product Owner Implementation Task for Partner Center (2026-07-31) required "Order Integration" — the ability to select a Partner, optionally, when creating or editing an Order — plus Partner-side statistics derived from Order data (Total Referred Orders, Revenue Generated, Successful Orders).

None of that is buildable today. Per direct investigation before implementation began:

- `orders` has **zero** partner-related columns (confirmed against `docs/ORDERS_DATABASE.md` §4 and the live migration history — `supabase/migrations/20260717_orders_table_upgrade.sql` is the migration that actually ran).
- `docs/12_PARTNER_CENTER_SPEC.md` §7 itself already anticipated exactly this gap: *"Partner Attribution is a Business Concept... This document describes the concept only and does not describe its implementation — no field, schema, or write path is designed here. No such field exists on the Order record today; adding one remains Order's own future Field-approval process through its own Revision, not something this document performs."*

The same Implementation Task also explicitly instructed: *"Do NOT change database architecture"* and *"Partner Center does NOT own... Order."* Adding a column to `orders` — a table owned by Order, not Partner Center — is squarely Order's own Field-approval process, not something Partner Center's implementation can do unilaterally. This proposal exists so that approval can happen as its own, separate, explicit decision, matching every other cross-module change this session (Product Status sync, Sales Ledger `is_duplicate`, Commission's direct-invocation proposal).

**Approved scope decision (2026-07-31):** Partner Center's own CRUD module (sidebar, list/detail/create/edit, permissions, CSV export) was implemented today without this field. Every place that would show Order/Compensation-derived Partner data (Partner List's "Total Referred Orders"/"Total Compensation"/"Outstanding Compensation" columns, Partner Detail's Partner Statistics/Orders/Compensation Summary sections) renders an explicit "not available yet" state instead of a fabricated value.

---

## 2. Proposed change

**`docs/ORDERS_DATABASE.md`** — add one nullable column to `orders`:

```sql
ALTER TABLE orders ADD COLUMN attributed_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
```

- **Nullable, no default** — matches the task's own "This field is optional. An Order may exist without a Partner." Every existing Order row is unaffected (`NULL` = no partner attributed, not a data migration).
- **`ON DELETE SET NULL`, not `CASCADE`** — Partner Center never hard-deletes a Partner (`docs/12_PARTNER_CENTER_SPEC.md` §10, no `partner.delete` permission exists), so this is a defensive default rather than an expected path.
- Ownership stays with Order — Order's own Field-approval process governs this column exactly like every other Order field, per `docs/BUSINESS_SPEC_INDEX.md` §8 Specification Ownership ("a module's own database-design document is owned by the same authority as its business spec").

**`docs/03_ORDER_SPEC.md`** — add `attributed_partner_id` to the Order field list (Part A), and to Order create/edit UI as an optional Partner selector, sourced from Partner Center's own Read Model (`GET /api/partners`) — never a direct join into Partner Center's own service code, consistent with `database/foundation/17_DATABASE_FOUNDATION.md` §6 Read Model Strategy.

**Not proposed here, deliberately:** any Compensation/Settlement wiring off this field. `docs/13_COMPENSATION_SPEC.md` §7 already establishes Compensation subscribes to Order via Business Events, not a direct field read — if Compensation Eligibility should ever consider Partner Attribution, that is Compensation's own future decision, not something this proposal decides on Compensation's behalf.

---

## 3. What this unblocks, once approved and applied

- Order create/edit: optional Partner selector.
- Partner List: "Total Referred Orders" becomes a real count (`orders.attributed_partner_id = partner.id`).
- Partner Detail → Orders section: real list of attributed Orders.
- Partner Detail → Partner Statistics: Total Orders / Successful Orders / Revenue Generated become computable from `orders` directly.
- Partner Detail → Compensation Summary and Partner List's compensation columns **remain blocked** even after this field lands — those additionally require Compensation/Settlement/Compensation Ledger to exist as real, implemented modules (currently zero code anywhere), which is a separate, larger scope than this one-column proposal.

## 4. Product Owner Questions

| # | Question | Why it needs a decision |
|---|---|---|
| Q1 | Approve the `attributed_partner_id` column addition to `orders`, per the SQL above? | This is Order's own table — Partner Center cannot approve a change to it on Order's behalf. |
| Q2 | Should the Order create/edit UI change (Partner selector) ship in the same Revision as the column, or separately? | Affects how much of `docs/03_ORDER_SPEC.md` this Revision touches. |
