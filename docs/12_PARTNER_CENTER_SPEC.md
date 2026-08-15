# Partner Center — Product Specification

**Status:** REVISION 4 — Product Owner Decisions 1–6 applied 2026-07-30 (Revision 2); Revision 3 (2026-07-30) applies a single consequential change from `docs/13_COMPENSATION_SPEC.md` Revision 2, Decision 4: §8's own "Partner Compensation Eligibility" concept is marked for future revision, since Compensation Eligibility is now owned exclusively by Compensation — Partner Center must not itself define it. **Revision 4 (2026-07-31)** confirms §13's remaining two questions via two Product Owner Implementation Tasks (2026-07-31): Q1 (Partner Lifecycle/Status) confirmed as written; Q2 (permission set) confirmed as written, with an explicit follow-up Decision that role→permission grants are NOT hardcoded in the seed migration — an Owner/Admin assigns them via the Permission Center's own Permission Matrix UI. §7's Order relationship is also updated: Partner Attribution (`orders.partner_id`) is now built, not just a confirmed concept — see that section.
**Prepared by:** Claude (Engineering Lead), per Product Owner instruction 2026-07-30, Module: Partner Center.
**Architecture:** Specification-First, business-first. Architecture only — no implementation, no SQL, no API. Part A states Business Rules exactly as the 13 requested sections; Part B is implementation-only context; Part C lists open questions.

**Basis:** confirmed via direct search that **no Partner Center code exists anywhere in the codebase** — no service, table, UI, or type. Like Notification, this is a genuine from-scratch design. The pre-existing empty `docs/PARTNER_CENTER_SPEC.md` placeholder (`docs/BUSINESS_SPEC_INDEX.md` §6, Planned Specifications) is the only prior trace of this module, and it carries zero content.

**Foundation alignment check performed before writing:** cross-checked against every LOCKED Business Specification (`docs/01_CUSTOMER_SPEC.md` through `docs/11_MARKETING_SPEC.md`) and Foundation Document (`docs/docs/BUSINESS_RULE_DECISIONS.md`, `docs/PERMISSION_SPEC.md`, `docs/BUSINESS_SPEC_INDEX.md`, `database/foundation/01_DATABASE_PRINCIPLES.md`). One real architectural gap is surfaced in §7 and not silently resolved.

---

# Part A — Partner Center Specification

## 1. Purpose

Partner Center is a Business Capability that manages every external business partner the company works with — parties outside the company's own Staff who help generate sales or refer business. It owns Partner information — identity, type, status, relationship terms — but does **not** own Customer, Order, Payment, Product, or Commission data; those remain owned by their own already-LOCKED Business Specifications.

## 2. Scope

**In scope:** Partner identity/lifecycle/status/type as business concepts (§4–§6), Partner's relationship to Customer/Order/Payment/Commission at the architecture level only (§7), Partner Roles as a business concept (§8), permissions, and AI readiness.

**Out of scope:** any Customer, Order, Payment, Product, or Commission business logic (each remains its own owning module's job), any UI or workflow for managing partners, and — flagged as the most consequential open item — whether Partners can earn Commission-type compensation, which is not designed here (§7, §12).

## 3. Partner Principles

**Business Rule (restates direct instruction):** Partner Center owns Partner information — and only Partner information.

**Business Rule (restates direct instruction):** Partner Center does not own Customer, Order, Payment, Product, or Commission data. It may reference records in any of these modules for attribution purposes (§7), but never creates, edits, or deletes them, and never changes their business state.

**Business Rule (restates direct instruction):** Partner Center manages every external business partner — any party outside the company's own Staff who participates in generating business. Per direct instruction, the starting examples (Collaborator, Sales Agent, Dealer, Affiliate, §6) are not assumed final.

## 4. Partner Lifecycle

**Business Rule (PROPOSED — no existing precedent; mirrors Customer's own two-dimensional lifecycle shape, `docs/01_CUSTOMER_SPEC.md` §4/§7, without assuming Partners behave identically to Customers):** A Partner record is created when the business begins a relationship with an external party, and moves through a lifecycle: **Onboarding** (relationship being set up, terms not yet finalized) → **Active** (currently engaged) → **Inactive** (temporarily dormant) → **Terminated** (relationship ended permanently). Unlike Customer's fully bidirectional Status model, Terminated is treated as a practical endpoint here — proposed, not confirmed (§12, §13 Q1).

## 5. Partner Status

**Business Rule (PROPOSED):** Every Partner has exactly one Status at all times, from the set named in §4:

| Status | Business meaning |
|---|---|
| Onboarding | Relationship being set up; terms not yet finalized. |
| Active | Currently engaged; eligible for referrals/business. |
| Inactive | Temporarily dormant; not currently engaged. |
| Terminated | Relationship ended permanently. |

## 6. Partner Types

**Business Rule (Decision 6, 2026-07-30, extends the set — still not assumed final):** Partner Types:

- Collaborator
- Sales Agent
- Dealer
- Affiliate
- **Referral Partner** — an informal partner who occasionally refers business without an ongoing formal agreement, distinct from Affiliate. Confirms Revision 1's proposed candidate; resolves Revision 1's §13 Q2.

This remains a starting set, per direct instruction — not assumed final even now.

## 7. Partner Relationship

**Business Rule:** Partner Center's relationship with each named module is:

- **Customer** (`docs/01_CUSTOMER_SPEC.md`, LOCKED) — a Partner may be associated with one or more Customers it referred or introduced to the business. This is a reference relationship only — Partner Center never owns, edits, or writes to the Customer record; `docs/01_CUSTOMER_SPEC.md` remains its sole owner.
- **Order** (`docs/03_ORDER_SPEC.md`, LOCKED) — **Business Rule (Decision 3, 2026-07-30, LOCKED into this document — "Partner Attribution"):** Partner Attribution is a Business Concept: an Order may reference an Attributed Partner — the Partner credited with facilitating that sale. This document describes the concept only and does not describe its implementation — no field, schema, or write path is designed here. This resolves Revision 1's §13 Q3: Partner Attribution is now a confirmed business concept. **Revision 4 note (2026-07-31):** the field is now built — `orders.partner_id`, nullable, storage only — per `docs/PARTNER_CENTER_ORDER_ATTRIBUTION_PROPOSAL.md`, approved through Order's own Field-approval process (`docs/03_ORDER_SPEC.md` Revision 5, `docs/ORDERS_DATABASE.md` Revision 6), exactly as this paragraph anticipated. Partner Center still does not own this field — Order does; Partner Center only reads it via its own Read Model (`GET /api/partners/[id]/orders`, `GET /api/partners/[id]/stats`).
- **Payment** (`docs/04_PAYMENT_SPEC.md`, LOCKED) — **Business Rule (Decision 4, 2026-07-30, LOCKED into this document):** Partner Center does not own Payment. It **may reference Payment Status when required by another Business Capability** — e.g., if Compensation Eligibility (owned by `docs/13_COMPENSATION_SPEC.md`, not Partner Center — see Revision 3 note below) is ever gated on an Order's Payment Status having reached Paid, the same way Commission's own Approval/Settlement is gated on BR-001 (`docs/06_COMMISSION_SPEC.md` §8/§9). This is a read-only reference, never ownership — Payment collection remains entirely Payment's own concern.
- **Compensation** (Decisions 1–2, 2026-07-30, LOCKED into this document — supersedes Revision 1's Commission-specific framing entirely): **Partner Center must not assume Commission as the mechanism for Partner compensation.** A Partner may receive **future compensation** of several possible kinds, named only, not assumed final:
  - Commission
  - Bonus
  - Referral Fee
  - Incentive
  - Rebate

  None of these five is designed here — no Workflow, Calculation, Lifecycle, or Approval — the same "acknowledge only" treatment already established for Payment's Refund/Write-off and Commission's own Adjustment/Reversal/Void/Clawback. **Every prior reference to a "Commission Recipient" concept is replaced with Compensation Eligibility** — a concept that does not presuppose Commission specifically, or any of the other four, as the eventual mechanism.

  **Revision 3 note (2026-07-30, supersedes the paragraph above's original "§8... a Partner-owned concept" framing):** Compensation Eligibility is now owned exclusively by `docs/13_COMPENSATION_SPEC.md` §8, not by Partner Center — see this document's own §8, marked for future revision. Partner Center references the concept; it does not define it.

**Business Rule:** Partner Center reads every referenced module via its own Read Model, never by calling another module's service code directly — the same architecture discipline established repeatedly across this project's recent specifications.

## 8. Partner Roles

**Business Rule (business concepts only; Decision 5, 2026-07-30, LOCKED into this document):** A Partner Role describes what a Partner is authorized or expected to do within the relationship (e.g., "may refer Customers," "may facilitate Orders," "may not interact directly with Customer support") — distinct from Partner Type (§6, which classifies *what kind* of partner they are). Role describes *what they may do*, Type describes *what they are*. **Partner Roles must be business-configurable — no fixed list is defined here**, consistent with this project's Extensibility principle (`database/foundation/01_DATABASE_PRINCIPLES.md` §3). This resolves Revision 1's §13 Q5.

**MARKED FOR FUTURE REVISION (2026-07-30, per `docs/13_COMPENSATION_SPEC.md` Revision 2, Decision 4):** the paragraph below, introducing "Partner Compensation Eligibility" as a concept this document defined, is **superseded** — Compensation Eligibility is now owned exclusively by Compensation (`docs/13_COMPENSATION_SPEC.md` §8); Partner Center must not itself define it. The text is retained verbatim below as a marker of what needs to be formally removed or rewritten in a future Revision of this document — it is not deleted now, and it should not be treated as this document's own current, authoritative position on Eligibility.

~~**Business Rule (introduces "Partner Compensation Eligibility," per Decision 2):** A Partner's eligibility for any future compensation (§7) is its own business concept, tracked independently of Partner Role and Partner Type — a Partner may hold a Role that permits facilitating Orders without necessarily being Eligible for compensation on them, and vice versa. This document does not design how Eligibility is determined or by whom; it only establishes that Eligibility is a distinct, Partner-owned concept, never assumed to be "Commission eligibility" specifically.~~

## 9. Business Rules (Summary)

1. Partner Center owns Partner information only; it never owns Customer, Order, Payment, Product, or Commission data (§3).
2. Partner Types are not assumed final; the confirmed set is Collaborator, Sales Agent, Dealer, Affiliate, Referral Partner (§6, Decision 6).
3. Partner Lifecycle/Status is Onboarding → Active → Inactive → Terminated, proposed, not previously decided anywhere (§4, §5).
4. Partner Attribution is a confirmed Business Concept — an Order may reference an Attributed Partner — though not yet implemented (§7, Decision 3).
5. Partner Center does not own Payment but may reference Payment Status when another Business Capability requires it (§7, Decision 4).
6. Partner compensation is never assumed to be Commission specifically — five named, undesigned future mechanisms exist (Commission, Bonus, Referral Fee, Incentive, Rebate), tracked via Compensation Eligibility (§7, §8, Decisions 1–2).
7. Partner Roles must be business-configurable — no fixed list is defined (§8, Decision 5).
8. **Superseded (Revision 3):** Compensation Eligibility is owned exclusively by `docs/13_COMPENSATION_SPEC.md`, not Partner Center — §8's own prior text defining it is marked for future revision, not this document's current position.

## 10. Permissions

**Business Rule (PROPOSED, proposed because required — Partner Center owns real entity data):** Following the `resource.action` standard (`docs/PERMISSION_SPEC.md` Decision 3, LOCKED) and the same CRUD-shaped pattern already established for Customer/Product:

- `partner.view`
- `partner.create`
- `partner.update`
- `partner.export`

**No `partner.delete`** — consistent with the project's established pattern of never hard-deleting a business entity in favor of a Status transition (Customer §4, Product §4): a Partner relationship that ends is set to Terminated (§5), never physically deleted.

## 11. AI Readiness

**Business Rule:** Partner performance data — referrals generated, revenue attributed, active relationship duration — is a plausible future input for a partner-performance or partner-recommendation model. No such model is designed here; this document only names the possibility, consistent with how every other spec in this project treats AI Readiness.

## 12. Assumptions

Revision 1's Assumptions 2–5 are resolved by this revision's Decisions 2–6: Partner Compensation reframed away from Commission specifically, via Partner Compensation Eligibility (Decisions 1–2); Partner Attribution confirmed as a Business Concept (Decision 3); Referral Partner confirmed as a fifth Type (Decision 6); Partner Roles confirmed business-configurable (Decision 5). Assumption 1 (Lifecycle/Status) and Assumption 3 (permission set) are resolved by Revision 4 — see §13. Remaining:

1. **Partner Attribution (§7) is now implemented** (`orders.partner_id`) but role→permission grants for `partner.*` are intentionally unseeded — an Owner/Admin must assign them via the Permission Matrix UI before any role can use Partner Center at all (Revision 4, confirming Decision 5 of the second Implementation Task).

## 13. Product Owner Questions

None currently open. Revision 1's Q2 (Referral Partner), Q3 (Partner Attribution), Q4 (Commission recipient), and Q5 (Partner Roles) were resolved by Revision 2's Decisions 6, 3, 1–2, and 5. Revision 4 resolves the final two, via two Product Owner Implementation Tasks (2026-07-31): Q1 (Partner Lifecycle/Status: Onboarding/Active/Inactive/Terminated) confirmed as written; Q2 (permission set: `partner.view`/`create`/`update`/`export`, no delete) confirmed as written — with role→permission grants explicitly left unseeded rather than hardcoded.

---

# Part B — Current Implementation Notes

*Informational only — describes what the code does today, for engineering awareness. Does not influence Part A.*

- **No Partner Center code exists anywhere in the codebase** — no service, repository, table, UI component, or type definition. This module is entirely greenfield.
- **No Order field exists today for Partner Attribution** (§7, Decision 3) — confirmed by reviewing `docs/03_ORDER_SPEC.md`'s own field list. The concept is now confirmed by this revision; the field itself remains unbuilt and would require Order's own future Field-approval process.
- **`docs/06_COMMISSION_SPEC.md`'s live-code counterpart (`types/commission.ts`) only has `salesperson`/`salesperson_id` fields** — no field of any kind exists for a non-Staff recipient. This is now moot for Partner Center's own design (Decisions 1–2 reframed away from Commission specifically), but remains an accurate fact about Commission's own current code.

---

# Part C — Remaining Product Owner Questions

Same two questions as §13. Every other question raised in Revision 1 is resolved by this revision's Decisions 1–6.
