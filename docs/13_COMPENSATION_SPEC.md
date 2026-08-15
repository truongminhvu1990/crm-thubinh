# Compensation — Product Specification

**Status:** REVISION 4 — Product Owner Decisions 1–6 applied 2026-07-30 (Revision 2). Revision 3 (2026-07-30) applies a consequential change from `docs/16_BUSINESS_EVENTS_SPEC.md` Revision 2, Decision 3: Compensation's relationship with Order (§11) is corrected from a generic Read-Model query to a confirmed **Event Subscription** — Compensation is a Business Event Subscriber to Order, it does not poll, and it does not query Order directly. **Revision 4 (2026-07-31, Product Owner Implementation/Revision Tasks) resolves §16 Q1 and pins down §11's Order relationship precisely:** the Business Event Compensation subscribes to for record *creation* is **OrderConfirmed** (Draft→Reserved), never OrderCompleted — Eligibility (§8) may delay when a Compensation can be Confirmed, but must never change the creation trigger itself. Status (§5) is now a full 5-value model: Draft, Pending, Confirmed, Cancelled, Handed Off.
**Prepared by:** Claude (Engineering Lead), per Product Owner instruction 2026-07-30, Module: Compensation.
**Architecture:** Specification-First, business-first. Architecture only — no implementation, no SQL, no API. Part A states Business Rules exactly as the 16 requested sections; Part B is implementation-only context; Part C lists open questions.

**Basis:** confirmed via direct search that **no Compensation or Settlement code exists anywhere in the codebase** — this is a from-scratch design. It builds on `docs/06_COMMISSION_SPEC.md` (Revision 2, LOCKED), which is one example Compensation Type under this new umbrella, **not redesigned, absorbed, or retroactively revised by this document** — Commission remains its own, fully independent specification (Decision 3, 2026-07-30).

**Resolved this revision (Decisions 1–2, 2026-07-30):** Revision 1 flagged an ambiguity about whether Compensation was Partner-scoped or general. **It is now confirmed general: Compensation is not Partner-specific — it applies to any eligible Compensation Recipient, an abstract Business Concept, with no fixed list of concrete recipient types enumerated.** Every prior reference to "Partner Compensation" is replaced with **Compensation Recipient** throughout this document.

**Foundation alignment check performed before writing:** cross-checked against every LOCKED Business Specification (`docs/01_CUSTOMER_SPEC.md` through `docs/12_PARTNER_CENTER_SPEC.md`), `database/foundation/01_DATABASE_PRINCIPLES.md`, and `docs/PERMISSION_SPEC.md`. No rule below contradicts any of them.

---

# Part A — Compensation Specification

## 1. Purpose

Compensation is a **generic** Business Capability responsible for defining and managing every type of business compensation that may be earned by any eligible **Compensation Recipient** — an abstract Business Concept, not a fixed or enumerated list of concrete actor types (Decision 1). It defines *what* kinds of compensation exist (Type, §6), *when* they apply (Policy, §7), *who* qualifies (Eligibility, §8), and *what determines the amount* (Basis and Method, §9–§10). It does **not** perform Settlement — actually paying compensation out is a separate Business Capability, reserved as the next Planned Specification (§11) — and it does not own Customer, Product, Order, or Payment data. Commission (`docs/06_COMMISSION_SPEC.md`) is one already-built example of a Compensation Type, described as such and never redesigned (Decision 3); Compensation is architected so that Bonus, Referral Fee, Incentive, Rebate, or any future type can be added without changing this specification.

## 2. Scope

**In scope:** Compensation Principles (§3), Lifecycle and Status (§4, §5), Compensation Type/Policy/Eligibility/Basis/Method as business concepts (§6–§10), and Compensation's relationship to Partner Center, Product, Order, Payment, and Settlement (§11).

**Owns:** the Compensation record itself, and the business concepts that define it (Type, Policy, Eligibility determination, Basis, Method, Recipient as an abstract concept) — nothing else.

**Does not own:** Customer (`docs/01_CUSTOMER_SPEC.md`), Product (`docs/02_PRODUCT_SPEC.md`), Order (`docs/03_ORDER_SPEC.md`), Payment (`docs/04_PAYMENT_SPEC.md`), or Partner Center (`docs/12_PARTNER_CENTER_SPEC.md`) data — all read-only references, and none is the definition of Recipient itself (Recipient is Compensation's own abstract concept, not owned by any of the modules a Recipient might happen to correspond to). Also out of scope: Settlement itself (a separate, reserved Business Capability, §11, Decision 5), Commission's own already-LOCKED business rules (not redesigned here), and the calculation formula or workflow for any specific Compensation Type (named only, §6, §9, §10).

## 3. Compensation Principles

**Business Rule:** Compensation operates on five principles, architecture only:

- **Flexibility** — Compensation supports diverse compensation shapes (percentage-based, fixed, manual) without assuming one calculation model fits every Type.
- **Extensibility** — new Compensation Types, Bases, and Methods can be added as business-configurable data without requiring a revision to this specification (the direct instruction: "the architecture must support future compensation types without changing this specification").
- **Separation of Responsibility** — Compensation defines eligibility, policy, basis, and method; Settlement performs the actual payout. Neither capability absorbs the other's job (§11).
- **Traceability** — every Compensation record is traceable back to the transaction or event that generated it (an Order, a referral, a policy period) and to the Policy/Type that determined it, consistent with `database/foundation/01_DATABASE_PRINCIPLES.md` §3's Traceability principle.
- **Business Configurability** — Types, Bases, Methods, and Policies are business-configurable data, never hardcoded, consistent with the same Foundation Document's Extensibility principle.

## 4. Compensation Lifecycle

**Business Rule (business lifecycle only, no implementation):** A Compensation record moves through: **Determined** (Policy and Eligibility have been evaluated and an amount computed per Basis/Method) → **Confirmed** (reviewed and approved as correct) → **Handed Off** (passed to Settlement for actual payout). Compensation's own lifecycle ends at Handed Off — whatever Settlement does afterward (scheduling, executing, recording the payout) belongs entirely to Settlement's own, separate lifecycle, not designed here.

## 5. Compensation Status

**Business Rule (Revision 4, 2026-07-31 — resolves §16 Q1, supersedes the 3-value model below):** Every Compensation record has exactly one Status, from a full 5-value model:

| Status | Business meaning |
|---|---|
| Draft | Created (§11's OrderConfirmed trigger) but not yet Eligibility-evaluated. |
| Pending | Eligibility evaluated (§8); ready to be reviewed and Confirmed. |
| Confirmed | Reviewed and approved; ready to hand to Settlement. Read-only from this point on. |
| Cancelled | The transaction that would have generated this Compensation did not, in fact, occur (e.g., its Order was marked Lost) — only reachable from Draft or Pending, never from Confirmed or Handed Off. |
| Handed Off | Passed to Settlement. Terminal from Compensation's own perspective — Settlement's own status model (not designed here) governs what happens next. |

**Superseded (Revision 4):** the prior 3-value model (Pending/Confirmed/Handed Off only) is replaced by the table above. §16 Q1 (whether a 4th Rejected/Voided value was needed) is resolved: yes, and the business chose Draft *and* Cancelled specifically, not the Rejected/Voided naming this document's own Revision 3 had proposed.

## 6. Compensation Type

**Business Rule (business concepts only, not final, none designed):** Starting Compensation Types:

- Commission — already fully designed elsewhere, `docs/06_COMMISSION_SPEC.md` (Revision 2, LOCKED). Compensation references it as one Type instance; it does not redefine any of Commission's own rules.
- Bonus
- Referral Fee
- Incentive
- Rebate

None of the four new types is designed here — no Workflow, Calculation, or Lifecycle beyond what §4/§5 already state generically for any Compensation record.

## 7. Compensation Policy

**Business Rule (business concepts only):** A Policy is a business rule set that determines **when** a given Compensation Type applies — e.g., "a Referral Fee applies when a Referral Partner introduces a Customer who completes a first purchase within 90 days." Policies are business-configurable and specific to a Compensation Type; a Policy determines *applicability*, never the calculated amount (that is Basis/Method, §9–§10). No workflow or implementation is described.

## 8. Compensation Eligibility

**Business Rule (Decision 4, 2026-07-30, LOCKED into this document):** Eligibility determines whether a specific Compensation Recipient qualifies for a given Compensation under a given Policy (§7) at a given moment. **Compensation Eligibility is owned only by Compensation** — no other module, including Partner Center, may define it. `docs/12_PARTNER_CENTER_SPEC.md` §8 previously introduced its own "Partner Compensation Eligibility" concept; that content is now marked for a future Revision on Partner Center's own side (applied directly to that document — see its own updated §8), since Partner Center must not itself define Eligibility. This resolves Revision 1's §16 Q4.

## 9. Compensation Basis

**Business Rule (business concepts only, not final, no formulas):** Starting candidate Bases — the transaction figure a compensation amount is calculated *from*:

- Sale Price — an Order Item's own Line Total (`docs/03_ORDER_SPEC.md` §7).
- Received Amount — the actual amount collected via Payment (`docs/04_PAYMENT_SPEC.md`), distinct from Sale Price whenever an Order is only partially paid.
- Profit — would require Product's own Cost Price (`docs/02_PRODUCT_SPEC.md` §11, a Sensitive Field per `docs/PERMISSION_SPEC.md` Decision 6) offset against Sale Price.
- Fixed Value — a flat amount independent of any transaction figure.

No calculation formula is designed for any Basis.

## 10. Compensation Method

**Business Rule (business concepts only, not final):** Starting candidate Methods — how a Basis (§9) becomes a compensation amount:

- Percentage — a rate applied against a chosen Basis.
- Fixed Amount — a flat number, independent of any Basis.
- Manual — a human enters the amount directly, bypassing Basis/Method calculation entirely.

**This specification must support future Methods without requiring a revision** (Extensibility, §3) — Method, like Type and Basis, is treated as business-configurable data, not a fixed enum.

## 11. Relationship with Partner Center, Product, Order, Payment, Settlement

**Business Rule:** Compensation may reference each of the following, but never owns their data:

- **Partner Center** (`docs/12_PARTNER_CENTER_SPEC.md`, Revision 3) — Partner Center is one possible source of a Compensation Recipient (a Partner may be a Recipient), but Compensation's own Recipient concept is not defined in terms of Partner Center specifically (Decisions 1–2) — Partner Center is a reference, not a definitional dependency. Compensation Eligibility itself is owned exclusively by Compensation (§8, Decision 4); Partner Center no longer defines its own version of that concept.
- **Product** (`docs/02_PRODUCT_SPEC.md`, LOCKED) — Compensation may read Cost Price when Basis = Profit (§9) — read-only.
- **Order** (`docs/03_ORDER_SPEC.md`, LOCKED) — **Business Rule (Decision 3, 2026-07-30, per `docs/16_BUSINESS_EVENTS_SPEC.md` Revision 2 — LOCKED into this document):** Compensation is a **Business Event Subscriber** to Order — the same architecture Commission already follows. **Compensation does not poll, and does not query Order directly.** Whatever data Compensation needs for Basis (e.g., an Order Item's Line Total, §9) or Policy/Eligibility gating (e.g., Order Status) arrives via the payload of the Business Event it subscribes to, defined and owned entirely by Order as Publisher (`docs/EVENT_CATALOG.md` §10) — Compensation never separately queries Order's own tables for anything not already in that payload. **Revision 4 note (2026-07-31):** the specific event is **OrderConfirmed** (Draft→Reserved) — record *creation* happens exactly there, never at OrderCompleted. Eligibility (§8) is a distinct, later step (Draft→Pending, at OrderCompleted; Pending→Confirmed, gated on Payment Status = Paid) that determines whether/when a created record can be Confirmed — it never determines whether the record gets created in the first place, and it never moves the creation trigger itself.
- **Payment** (`docs/04_PAYMENT_SPEC.md`, LOCKED) — Compensation may read Received Amount (basis) and Payment Status (Eligibility gating, mirroring Commission's own BR-001 gate, `docs/06_COMMISSION_SPEC.md` §8/§9) — read-only, consistent with the "may reference Payment Status when required by another Business Capability" rule `docs/12_PARTNER_CENTER_SPEC.md`'s own Decision 4 already established.
- **Settlement** (Decision 5, 2026-07-30) — Compensation hands off a Confirmed record to Settlement for actual payout (§4). Compensation never performs Settlement itself. **Settlement is now formally reserved as the next Planned Specification** (`docs/14_SETTLEMENT_SPEC.md`) — this document does not describe Settlement's own behavior, consistent with the reservation being a placeholder only. This resolves Revision 1's §16 Q3.

**Business Rule:** Compensation reads Product, Payment, and Partner Center via its own Read Model, never by calling another module's service code directly. Order is the one exception, per Decision 3 above: Compensation reaches Order exclusively via Business Event Subscription, never a Read Model query — the same architecture discipline Commission already follows for Order.

## 12. Business Rules (Summary)

1. Compensation is generic, not Partner-specific — it applies to any eligible Compensation Recipient, an abstract concept with no enumerated actor types (§1, Decisions 1–2).
2. Compensation owns Compensation records, Types, Policies, and Eligibility rules only — it never owns Customer, Product, Order, Payment, or Partner Center data (§2).
3. Compensation never performs Settlement — Settlement is now formally reserved as the next Planned Specification (§4, §11, Decision 5).
4. Commission must be described as one Compensation Type — never redesigned, never modified (§1, §6, Decision 3).
5. Compensation Lifecycle is Determined → Confirmed → Handed Off; Status is now Draft/Pending/Confirmed/Cancelled/Handed Off (§4, §5, Revision 4).
6. Five starting Compensation Types exist, none newly designed beyond Commission (already designed elsewhere) (§6).
7. Policy determines applicability; Eligibility determines qualification; neither describes a calculation (§7, §8).
8. Basis and Method together determine a compensation amount conceptually; no formula is designed (§9, §10).
9. Compensation must support future Types/Bases/Methods without a specification revision (§3, §10).
10. Compensation Eligibility is owned only by Compensation — Partner Center must not, and no longer does, define it (§8, Decision 4).
11. Permissions are approved: `compensation.view`, `compensation.manage` (§13, Decision 6).
12. Compensation is a confirmed Business Event Subscriber to Order — never polling, never querying Order directly (§11, Revision 3, per `docs/16_BUSINESS_EVENTS_SPEC.md` Decision 3). The subscribed event is OrderConfirmed specifically; Eligibility delays Confirmation, never the creation trigger (§11, Revision 4).

## 13. Permissions

**Business Rule (Decision 6, 2026-07-30, APPROVED):** Following the `resource.action` standard (`docs/PERMISSION_SPEC.md` Decision 3, LOCKED):

- `compensation.view`
- `compensation.manage` — configuring Policies/Types/Bases/Methods, and confirming a Compensation record (Pending → Confirmed).

**No `compensation.delete`** — consistent with this project's established pattern of using a Status value (Rejected/Voided, if adopted — §5) rather than physical deletion.

## 14. AI Readiness

**Business Rule:** Compensation data is a plausible future input for three distinct AI-supported use cases, named only, not designed:

- **Compensation analysis** — patterns in payout volume/amount across Types, Partners, and time periods.
- **Policy recommendation** — suggesting new or adjusted Policy configurations based on historical Compensation outcomes.
- **Anomaly detection** — flagging unusual compensation amounts or frequency relative to a Partner's or Type's own history.

No AI implementation is designed here, consistent with how every other spec in this project treats AI Readiness.

## 15. Assumptions

Revision 1's Assumptions 1–4 and 6 are resolved by this revision's Decisions 1–6: Compensation confirmed generic, not Partner-specific (Decisions 1–2); Commission confirmed as one Type, untouched (Decision 3); Compensation Eligibility confirmed exclusively Compensation's own, Partner Center marked for future revision (Decision 4); Settlement formally reserved (Decision 5); permissions approved (Decision 6). Revision 4 resolves the one remaining assumption (Status model) — see §16. No open assumptions remain.

## 16. Product Owner Questions

None currently open. Revision 1's Q1–Q4 and Q6 were resolved by Revision 2's Decisions 1–6. Revision 4 (2026-07-31) resolves the final one: Q1 (whether the Status model needed a 4th value) — yes, and a 5-value model (Draft/Pending/Confirmed/Cancelled/Handed Off) was chosen, not the Rejected/Voided naming this document had proposed as a candidate.

---

# Part B — Current Implementation Notes

*Informational only — describes what the code does today, for engineering awareness. Does not influence Part A.*

- **No Compensation or Settlement code exists anywhere in the codebase** — confirmed by direct search. This module is entirely greenfield.
- **`docs/06_COMMISSION_SPEC.md`'s live code (`lib/commission/*`, `sales_commissions` table) is the only related, real precedent** — it operates entirely independently of any Compensation concept, exactly as Decision framing requires ("independent from Commission").

---

# Part C — Remaining Product Owner Questions

Same one question as §16: whether a Rejected/Voided Status is needed alongside Pending/Confirmed/Handed Off. Every other question raised in Revision 1 is resolved by this revision's Decisions 1–6.
