# Money & Debt Ledger — Business Specification

**Status:** DRAFT — Revision 1, 2026-08-15. Business model and architecture LOCKED per Product Owner decisions D1–D11 below. Schema is PROPOSED ONLY. No open Product Owner Questions block drafting; several decisions are explicitly deferred (§31) and are not open questions against this document — they are scoped out until a future authorized phase.
**Prepared by:** Claude (Engineering Lead), per Product Owner Final Specification instruction, 2026-08-15, following a four-stage read-only repository audit (current-state audit → design-direction audit → design-feasibility validation → decision validation), no code/SQL/schema/master-data/UI touched at any stage.
**Architecture:** Business-first, architecture only — no implementation, no code, no SQL. Per `docs/BUSINESS_SPEC_INDEX.md` §3, this stage precedes drafting; it does not itself change any table, permission, or UI.

---

## 1. Executive Summary

The CRM currently has no way to answer "how much VND is a Money Changer currently holding on our behalf" or "how much CNY does Supplier A still owe us / how much have we already given them." Customer payments made through the `TECH_H` channel disappear from traceability the moment they leave `payments` — there is no structure recording that the money then sits with a Money Changer, gets converted to CNY, and eventually reaches a Supplier.

This specification defines **MONEY_DEBT_LEDGER**: a single, generic, append-only ledger of money movements — VND and CNY, held by Money Changers and Suppliers — that lets every such balance be derived by summing IN/OUT movements per (party, currency), without introducing a new accounting subsystem, a new counterparty entity, or a duplicate payment record.

## 2. Scope

- Recording money movements (VND and CNY) into and out of Money Changer and Supplier counterparties.
- Reconciling `TECH_H` customer payments to the downstream money movement they represent.
- Representing the two-currency `BUY_CNY` exchange as one logical business transaction.
- Deriving VND and CNY balances per counterparty from ledger movements.
- Correcting historical ledger movements only through new `ADJUSTMENT` movements, never edits.

## 3. Non-Goals

Per D11 and this project's repository-audit findings, this specification explicitly does **not**:

- Create a `TECH_H` entity of any kind (D1). `TECH_H` remains solely a `payments.payment_method` value.
- Add `Money Changer` / `Supplier` values to `partners.partner_type` now (D2). That is a future, separately authorized implementation step.
- Build an accounting journal, chart of accounts, receivable module, payable module, wallet module, or double-entry accounting layer (D11).
- Replace, duplicate, or restructure `Payment`, `Order`, `Compensation`, `Settlement`, `Compensation Ledger`, or `Sales Ledger` (all confirmed live, owned structures — see §5).
- Classify money-held balances as debt/payable, or resolve Asset vs. Payable accounting semantics — see §19 and §31.
- Introduce multi-currency support anywhere outside this ledger (no repository-wide currency infrastructure is proposed).

## 4. Locked Business Rules

The following are Product Owner decisions, locked for this specification (2026-08-15):

| # | Rule |
|---|---|
| D1 | `TECH_H` is only a `payment_method` value — identifies customer payments transferred through the TECH_H channel. Not a Partner, Supplier, Money Changer, Wallet, or Financial Account. |
| D2 | The existing `partners` table is the counterparty registry. Existing sales-side partner types are unaffected. `Money Changer` and `Supplier` are the future semantic types — not added by this specification. |
| D3 | Every physical `MONEY_DEBT_LEDGER` row represents exactly one currency movement (one party, one currency, one amount, one direction). No row mixes VND and CNY. |
| D4 | A `BUY_CNY` business transaction is two physical rows sharing one logical transaction group/reference. One business transaction = one logical transaction group, not necessarily one physical row. FX rate belongs to the group, not to either row alone. |
| D5 | Balance = `SUM(IN) − SUM(OUT)` per (party, currency). No balance table. CNY balance is never converted to VND as a source of truth. |
| D6 | The ledger supports authorized, application-controlled (staff-initiated) writes for real-world movements — it cannot depend exclusively on a database trigger the way Compensation Ledger does. |
| D7 | After creation, ledger rows are immutable: UPDATE and DELETE are prohibited. Corrections are new `ADJUSTMENT` rows. Enforcement follows the Compensation Ledger precedent (SELECT-only RLS for ordinary roles, controlled writer, `SECURITY DEFINER` where required) adapted for an authorized creation path rather than a trigger-only one. |
| D8 | No balance table and no stored `running_balance` initially — balance is computed live via `SUM`, matching the Loyalty Ledger precedent. |
| D9 | Payment remains the source of truth for the customer's payment. The ledger does not replace Payment. A Payment may link to zero, one, or many ledger movements — 1:1 is not assumed. |
| D10 | No `ON DELETE CASCADE` from the ledger to Order, Payment, Partner, or any other parent financial/business record. A restrictive or protective FK relationship is used instead, so ledger history cannot disappear via parent deletion. |
| D11 | No accounting journal, chart of accounts, receivable module, payable module, wallet module, or accounting-entry system. Scope is strictly: money movement + VND + CNY + debt/deposit tracking + TECH_H reconciliation, using the movement/balance model in this document. |

## 5. Existing CRM Structures Reused

Confirmed live and reused as-is, unmodified, by this specification:

| Structure | Role for Money & Debt Ledger | Evidence |
|---|---|---|
| `payments` | Source of truth for customer payment, including `payment_method = 'TECH_H'`. Linked from the ledger, never duplicated. | `supabase/migrations/2026071605_orders_database_foundation.sql:144-152` |
| `orders` | Business-origin traceability when a ledger movement relates to a specific order. | `2026071605_orders_database_foundation.sql:110-128` |
| `partners` | Counterparty registry (§6). Unmodified now; extended with new `partner_type` values only in a future authorized phase. | `2026081001_partner_center_module.sql` |
| `permissions` / `role_permissions` | Permission framework — new `money_debt_ledger.*` keys seeded ungranted, same convention as every module since Partner Center Decision 5. | `2026081001_partner_center_module.sql` (Decision 5 precedent) |
| `activity_logs` | Optional supplementary event trail (not the ledger's own immutability mechanism — see §23/§24). | `lib/activityLog.service.ts` |

Not reused (per prior audit, explicitly ruled out): Compensation Ledger, Settlement, Sales Ledger — each owns a different, non-generic financial semantic (Partner compensation, PO hand-off, sales/revenue reporting respectively) and is not extended or repurposed here.

## 6. Counterparty Model

The ledger's `party` reference targets `partners.id`. Today, every `partners` row is sales-side (Collaborator, Sales Agent, Dealer, Affiliate, Referral Partner). This specification anticipates — but does **not** create — two additional semantic `partner_type` values:

- **Money Changer** — holds VND and/or CNY on the business's behalf, converts between them.
- **Supplier** — receives CNY (deposit or direct payment) in exchange for goods.

Per the prior repository audit: `partners.partner_type` carries no DB CHECK constraint, and `Partner.partner_type` in `types/partner.ts` is already typed as plain `string`, not the narrower `PartnerType` union — so introducing these two values later requires no schema change and no code found in `partner.service.ts`, `compensation.service.ts`, or `settlement.service.ts` branches on specific `partner_type` values. This specification treats that as validated feasibility, not as authorization to add the values now.

## 7. MONEY_DEBT_LEDGER Concept

One generic, append-only table. Each row is one currency movement, for one party, in one direction, at one point in time. There is no separate table per counterparty type, per currency, or per business scenario (TECH_H, Money Changer holding, Supplier deposit, etc.) — every scenario in §11–§18 is expressed through the same row shape (§8), differentiated only by `transaction_type`, `party`, and `currency`.

## 8. Ledger Record Model

Conceptual field list — no SQL, no types, no constraints proposed here (see §28 for the schema-shape proposal):

| Field | Required | Meaning |
|---|---|---|
| id | Yes | Ledger row identity |
| transaction_date | Yes | When the movement occurred |
| transaction_type | Yes | One of the types in §9 |
| party_type | Yes | e.g. `Money Changer`, `Supplier` (semantic label, not a new entity) |
| party_id | Conditional | Reference to `partners.id`, when the party is a registered Partner |
| currency | Yes | `VND` or `CNY` — exactly one per row (D3) |
| amount | Yes | Always positive; direction carries the sign of the movement |
| direction | Yes | `IN` or `OUT` |
| transaction_group | Conditional | Shared reference tying together rows that form one logical business transaction (D4) — required for `BUY_CNY`, absent for single-row types |
| fx_rate | Conditional | Present only on rows belonging to an FX transaction group |
| linked_payment_id | No | Reference to `payments.id`, when the movement reconciles a customer payment |
| linked_order_id | No | Reference to `orders.id`, when traceable to a specific order |
| reference | No | Free-form external reference (e.g., Supplier's own document number) |
| note | No | Free text |
| status | Yes | Row lifecycle (see §23 — not a correction mechanism) |
| created_by | Yes | Staff who recorded the movement |
| created_at | Yes | Audit timestamp |

Deliberately not included, per §3/§19: `balance`, `account_id`, `wallet_id`, `payable_id`, `receivable_id`, `debt_id`, `deposit_id`, `exchange_id`, `journal_entry_id`.

## 9. Transaction Types

Each type below shows, per the modeling requirements: business meaning, party, currency, amount, direction, transaction-group requirement, linked Payment/Order, and balance effect.

| Type | Business meaning | Party | Currency | Direction | Group required? | Linked | Balance effect |
|---|---|---|---|---|---|---|---|
| `TECH_H_RECEIPT` | A customer payment (`payments.payment_method = 'TECH_H'`) is reconciled to money now held on the business's behalf via the TECH_H channel. | Money Changer (or the TECH_H-associated counterparty) | VND | IN | No | `linked_payment_id` (required), `linked_order_id` (via the Payment's own Order) | + VND held by that party |
| `VND_HELD_BY_MONEY_CHANGER` | Records VND known to be held by a Money Changer, independent of a specific TECH_H payment (e.g., a manually confirmed running balance event). | Money Changer | VND | IN / OUT | No | Optional | ± VND held by that party |
| `BUY_CNY` (Row A) | The VND leg of an exchange: VND leaves the Money Changer's held balance to fund a CNY purchase. | Money Changer | VND | OUT | **Yes** — paired with Row B | Optional | − VND held |
| `BUY_CNY` (Row B) | The CNY leg of the same exchange: CNY is now held by the Money Changer. | Money Changer | CNY | IN | **Yes** — paired with Row A | Optional | + CNY held |
| `CNY_HELD_BY_SUPPLIER` / `DEPOSIT` | CNY is transferred to a Supplier and held as a deposit/balance, not yet consumed. | Supplier | CNY | IN | No | Optional | + CNY held by Supplier |
| `DEPOSIT_CONSUMED` | A previously deposited CNY balance is drawn down to pay for goods. | Supplier | CNY | OUT | No | Optional (may reference the originating deposit via `reference`) | − CNY held by Supplier |
| `SUPPLIER_PAYMENT` | CNY is paid to a Supplier directly, not from a pre-existing deposit. | Supplier | CNY | OUT | No | Optional | − CNY held by Supplier (or, if the Supplier is only ever a destination, this row still records the outflow of CNY the business no longer holds toward that Supplier) |
| `ADJUSTMENT` | A correction to a prior movement, recorded as a new row, never a rewrite (D7). | Same party/currency as the row being corrected | Same as corrected row | Whichever direction restores the intended balance | No (unless correcting a grouped row, in which case it should reference the same group) | Should reference the corrected row via `reference` | ± restores intended balance |

## 10. Logical Transaction Group Model

`transaction_group` is a shared, non-FK reference value (not a parent table) used to tie together physical rows that together represent one business transaction (D4). Cardinality:

- Single-currency, single-movement types (`TECH_H_RECEIPT`, `VND_HELD_BY_MONEY_CHANGER`, `CNY_HELD_BY_SUPPLIER`, `DEPOSIT_CONSUMED`, `SUPPLIER_PAYMENT`, most `ADJUSTMENT`s): `transaction_group` is not required — the row stands alone as one business transaction.
- `BUY_CNY`: exactly two rows share one `transaction_group` — one VND OUT, one CNY IN, both against the same Money Changer, both carrying the same `fx_rate`.

This mirrors the only existing "shared reference" precedent in the repository — sibling rows linked by a common value rather than a formal parent table (e.g., `order_items` sharing `order_id`) — adapted here to a non-FK reference since a `BUY_CNY` group has no natural single parent row of its own.

## 11. VND Flow

General domestic flow, independent of the TECH_H channel specifically:

```
VND enters the ledger (any VND-denominated IN movement)
   → held by a Money Changer (VND_HELD_BY_MONEY_CHANGER, or accumulated via TECH_H_RECEIPT)
   → optionally consumed by BUY_CNY (VND OUT leg)
```

## 12. TECH_H Reconciliation Flow

```
Customer Payment (payments, payment_method = 'TECH_H')
   → MONEY_DEBT_LEDGER row: TECH_H_RECEIPT
        party = Money Changer, currency = VND, direction = IN
        linked_payment_id = the Payment's id
   → contributes to: Money Changer / VND balance
```

Payment is never altered or replaced (§20/D9). The ledger row is the only new artifact; `payments.amount`, `payments.payment_method`, and the Order/Customer chain above it are untouched.

## 13. Money Changer VND/CNY Flow

A Money Changer's VND and CNY balances are tracked as two entirely independent sums over the same party:

```
Money Changer H / VND = Σ(IN, party=H, currency=VND) − Σ(OUT, party=H, currency=VND)
Money Changer H / CNY = Σ(IN, party=H, currency=CNY) − Σ(OUT, party=H, currency=CNY)
```

Movements affecting each: VND — `TECH_H_RECEIPT`, `VND_HELD_BY_MONEY_CHANGER`, `BUY_CNY` Row A (OUT). CNY — `BUY_CNY` Row B (IN), and any CNY movement recorded directly against the Money Changer if the business model requires it (not precluded by this design, though §9's Supplier-facing types are the primary CNY-OUT path).

## 14. BUY_CNY Flow

```
Transaction Group: FX-<n>
  Row A: party=Money Changer H, currency=VND, amount=300,000,000, direction=OUT
  Row B: party=Money Changer H, currency=CNY, amount=80,000,       direction=IN
  Both rows: fx_rate = 3,750, same transaction_group, same transaction_date

Effect:
  Money Changer H / VND balance: − 300,000,000
  Money Changer H / CNY balance: + 80,000
```

Both rows are written together, in one application-layer operation (§25/§6 write model), so the group is never left with only one side recorded.

## 15. Supplier CNY Deposit Flow

```
MONEY_DEBT_LEDGER row: CNY_HELD_BY_SUPPLIER (or DEPOSIT)
   party = Supplier A, currency = CNY, direction = IN, amount = 100,000

Effect: Supplier A / CNY balance: + 100,000 (money now held by/with the Supplier, not yet consumed)
```

## 16. Supplier Payment Flow

```
MONEY_DEBT_LEDGER row: SUPPLIER_PAYMENT
   party = Supplier A, currency = CNY, direction = OUT

Effect: Supplier A / CNY balance decreases by the paid amount.
```

Distinct from `DEPOSIT_CONSUMED` (§17): a `SUPPLIER_PAYMENT` is a direct payment with no prior deposit being drawn down; recording which one occurred is a business-meaning choice made at entry time, not inferred by the system.

## 17. Deposit Consumed Flow

```
MONEY_DEBT_LEDGER row: DEPOSIT_CONSUMED
   party = Supplier A, currency = CNY, direction = OUT, amount = 30,000
   (may carry `reference` pointing back to the originating DEPOSIT row's id)

Effect: Supplier A / CNY balance: 100,000 − 30,000 = 70,000
```

## 18. Adjustment Flow

```
MONEY_DEBT_LEDGER row: ADJUSTMENT
   party/currency = same as the row being corrected
   direction = whichever restores the intended balance
   reference = the id (or transaction_group) of the row/group being corrected
   note = required, explaining the correction

Effect: the original row is never edited or deleted (D7); the balance reflects
the net of the original row plus this new ADJUSTMENT row.
```

No automatic reversal mechanism is proposed — an Adjustment is created the same way any other movement is created (§6 write model), by an authorized staff action.

## 19. Balance Calculation

```
Balance(party, currency) = Σ amount WHERE direction = 'IN'
                          − Σ amount WHERE direction = 'OUT'
                            AND party_id = party AND currency = currency
```

Computed live at read time (D8), never stored, never converted across currencies (D5) — `Money Changer H / VND` and `Money Changer H / CNY` are two separate numbers, never summed or converted into one.

**Explicit non-classification:** this specification does **not** state whether a positive balance is an Asset (money held on the business's behalf) or a Payable (money owed to the counterparty) — see §31, PO-D4 remains open from the prior audits. A balance produced by this formula is a **fact about money movement**, not an accounting classification. This document does not require, and does not silently assume, that classification to operate; §9 and §19 function correctly with `direction`/`amount` alone.

**Distinguishing five concepts, per the modeling requirement (do not conflate):**

1. **Payment** — a real, historical fact: the customer paid the business (`payments` table). Never re-represented by the ledger, only referenced (§20).
2. **Money movement** — a single IN or OUT event recorded in `MONEY_DEBT_LEDGER` (one row).
3. **Money held** — a derived balance (§19) for a party+currency at a point in query time; not a stored fact, not itself a row.
4. **Supplier deposit** — a specific business meaning (`CNY_HELD_BY_SUPPLIER`/`DEPOSIT` transaction_type) describing CNY given to a Supplier in advance of consumption; it is one contributor to "money held," not a separate ledger.
5. **Supplier payment** — a specific business meaning (`SUPPLIER_PAYMENT` transaction_type) describing CNY paid directly; also a contributor to the same derived balance, via a different `transaction_type`.

**Debt/payable semantics are explicitly not introduced.** No field, transaction_type, or balance formula in this specification labels a balance as a liability. If the business later needs that classification, it is a separate, future Product Owner decision (§31) layered on top of the movement facts this ledger already records — not something this specification defines now.

## 20. Payment ↔ Ledger Relationship

- Payment remains authoritative for what the customer paid (D9). The ledger's `linked_payment_id` is a reference, not a replacement.
- Cardinality: a Payment may have zero, one, or many linked ledger rows (D9) — e.g., a single large TECH_H payment might be represented as more than one downstream movement if the real-world money flow requires it; a Payment not yet reconciled has zero linked rows.
- No new column or constraint on `payments` is proposed — the relationship is expressed from the ledger side only (`linked_payment_id` on `MONEY_DEBT_LEDGER`).
- Multiple TECH_H Payments on one Order (already supported by the existing schema — no unique constraint on `payments.order_id`) each get their own independent `linked_payment_id` reference; nothing in this design requires them to share a `transaction_group`.

## 21. Order ↔ Ledger Relationship

- `linked_order_id` is optional and derivable transitively via `linked_payment_id → payments.order_id` when a Payment link exists; it is offered directly on the ledger row for movements that trace to an Order without (or in addition to) a specific Payment link.
- Order remains the existing CRM relationship (Customer → Order → Payment) — unchanged, unreplaced (§3).

## 22. Currency / FX Rules

- Every row carries exactly one `currency` (D3) — `VND` or `CNY`.
- `fx_rate` is only meaningful on rows belonging to a `BUY_CNY` transaction_group (§10); it is not a general-purpose field on every row.
- CNY balances are never converted to VND for balance reporting (D5) — `fx_rate` is used only to relate the two legs of a specific exchange, never to restate one currency's balance in terms of the other.
- Per the repository's confirmed precision (`numeric`, unconstrained, used everywhere in this schema), decimal CNY amounts and FX rates are representable at the data layer without a new precision convention — but the existing `CurrencyInput` UI component is integer-only and is not assumed suitable for CNY/FX entry (confirmed technical constraint, §32).

## 23. Immutability Rules

- After creation, a ledger row is never updated or deleted (D7).
- Corrections are always new `ADJUSTMENT` rows (§18), referencing what they correct.
- `status` (§8) reflects the row's own lifecycle (e.g., recorded/reconciled) — it is not a mechanism for altering the row's amount/direction/party after the fact, and does not substitute for an Adjustment.
- Database-level enforcement follows the Compensation Ledger precedent — SELECT-only RLS for ordinary application roles, with all writes routed through one controlled path — adapted for D6's requirement that the path be an authorized application action rather than a trigger exclusively (see §25).

## 24. Audit Requirements

- Every row's own `created_by`/`created_at` is the primary audit fact for who recorded a movement and when.
- `activity_logs` may optionally receive a supplementary entry per ledger write (matching the pattern already used by Compensation Ledger's trigger and Loyalty's `recordTransaction`), for cross-entity activity-timeline visibility — this is additive, not the ledger's own immutability mechanism (§23 already covers that at the RLS/writer layer).
- No before/after diff storage is proposed (the live, actually-used `activity_logs` table has no such column, and the generic `audit_log` draft that does remains unapplied per the prior audit) — a corrected value is visible only as the new `ADJUSTMENT` row plus the (untouched) original row, which together already show the "before" and "after" state without needing a diff column.

## 25. Permission Model

Following the established convention (Partner Center Decision 5, repeated by every module since): new permission keys are seeded **ungranted**, with no hardcoded role mapping, assigned later by an Owner/Admin via the Permission Matrix UI.

Proposed permission keys (naming only, not created by this document): `money_debt_ledger.view`, `money_debt_ledger.create`, `money_debt_ledger.export`. Deliberately **no** `money_debt_ledger.update` or `money_debt_ledger.delete` key — mirroring Compensation Ledger's own precedent of simply not defining permissions for actions the business rule (D7) prohibits outright, rather than defining and then always denying them.

## 26. FK / Deletion Rules

- No `ON DELETE CASCADE` from `MONEY_DEBT_LEDGER` to `payments`, `orders`, or `partners` (D10).
- A restrictive (blocks deletion of the parent while a ledger row references it) or protective (preserves the ledger row, nulling the reference) relationship is used instead — matching the two non-CASCADE idioms already live in this schema (`settlement_items.compensation_id` = RESTRICT; `compensations.partner_id` = SET NULL).
- **Known interaction requiring attention at implementation time (not resolved here):** `delete_order_with_reconciliation()` (`supabase/migrations/2026081702_admin_order_delete_reconciliation.sql`) currently assumes `payments` cascades cleanly on Order deletion. Once a non-CASCADE ledger FK to `payments` exists, an Order with a reconciled TECH_H payment could no longer be deleted through that function without accounting for the linked ledger row. This specification does not resolve that interaction — it is flagged for the implementation phase.

## 27. Reporting / Reconciliation Requirements

- Balance queries: `SUM(amount) WHERE party_id = X AND currency = Y AND direction = 'IN'` minus the `OUT` equivalent — the same shape every existing report in this codebase already uses (e.g., `paymentMethodReport.repository.ts`'s `findDistinctPaymentMethods`/grouped aggregation), so no new reporting idiom is required for single-row transaction types.
- `BUY_CNY` and any other grouped transaction type requires reporting logic aware of `transaction_group` to reassemble the two legs when displaying "what happened," even though each leg still contributes independently to its own party+currency balance (§14).
- Reconciliation view: `Payment → linked_payment_id → MONEY_DEBT_LEDGER row(s) → party balance` traceable in one direction; the reverse (ledger row → Payment) is a plain FK lookup.
- No specific report/page is designed by this specification — reporting requirements here describe what must be *derivable*, not a UI.

## 28. Minimal Schema Proposal

Conceptual only — no SQL, no types, no migration. Preserves: one currency per row (§8/D3), `transaction_group` for multi-row transactions (§10/D4), VND/CNY separation (§22/D3), Payment/Order traceability (§20/§21), party balance derivability (§19), immutable history (§23/D7), and adjustment history (§18/D7) — nothing beyond the field list in §8.

```
MONEY_DEBT_LEDGER
  id
  transaction_date
  transaction_type      -- §9's enum, not finalized as a DB CHECK by this document
  party_type
  party_id               -- references partners.id when applicable
  currency                -- VND | CNY
  amount                  -- always positive
  direction               -- IN | OUT
  transaction_group       -- shared reference for multi-row transactions
  fx_rate                 -- present only on transaction_group rows
  linked_payment_id        -- references payments.id
  linked_order_id           -- references orders.id
  reference
  note
  status
  created_by
  created_at
```

No `updated_at` (nothing here is ever updated, §23). No `balance`, `account_id`, `wallet_id`, `payable_id`, `receivable_id`, `debt_id`, `deposit_id`, `exchange_id`, or `journal_entry_id` (§3/§8/D11).

## 29. Reuse vs. New Structures

| Reused, unmodified | New (this specification only) |
|---|---|
| `payments`, `orders`, `partners`, `permissions`/`role_permissions` framework | `MONEY_DEBT_LEDGER` table (conceptual, §28) |
| Compensation Ledger's immutability *pattern* (SELECT-only RLS, controlled writer) | Two new `partner_type` values — **not created now** (§6, deferred) |
| Loyalty Ledger's manual-write + live-`SUM`-balance *pattern* | New permission keys (naming only, §25) |
| `activity_logs` (optional supplementary trail) | |

Not touched, not extended, not repurposed: Compensation Ledger table itself, Settlement, Sales Ledger, `CurrencyInput` component (flagged, not modified — §32).

## 30. Risks

- **Grouped-row write atomicity:** a `BUY_CNY` transaction_group must always be written as both rows together; a partial write (one leg only) would silently corrupt one party's balance without corrupting the other, and no repository precedent enforces multi-row atomicity beyond ordinary Postgres transactions.
- **Immutability enforcement gap if the wrong precedent is followed:** Loyalty Ledger's "Allow full access" RLS shape does not actually enforce D7 at the database level; if implementation copies that shape instead of Compensation Ledger's SELECT-only shape, immutability becomes convention-only despite being LOCKED as a business rule.
- **FK behavior vs. existing Admin Order Delete function:** §26's known interaction — unresolved until implementation time.
- **Partner reuse UX conflation:** Money Changer/Supplier appearing in the same `partners` list/dropdowns as sales-side types, once added, is a UX design question not addressed here.
- **No rounding/precision convention exists** in this codebase for genuinely fractional currency math (CNY, FX rate) — `commission_percent` is the only existing precedent and has no documented rounding rule either.
- **CurrencyInput UI is integer-only** — any future UI touching CNY or FX-rate values needs a different input path; using the existing component unmodified would truncate decimals.

## 31. Explicitly Deferred Decisions

Carried forward, genuinely still open — not invented for completeness:

- **PO-D4 (Asset vs. Payable classification):** whether a positive balance should ever be labeled an accounting Asset or a Payable/Debt. This specification deliberately operates without that classification (§19).
- **Trigger-based vs. fully manual write path**, and any hybrid, for specific transaction types (e.g., should `TECH_H_RECEIPT` ever be system-suggested from an unreconciled Payment, vs. always manually entered) — D6 confirms manual entry must be supported, but does not rule out a future assisted/semi-automatic entry point.
- **Exact FK behavior choice (RESTRICT vs. SET NULL)** for each of `linked_payment_id`, `linked_order_id`, and `party_id` — D10 only locks "not CASCADE," not which of the two protective alternatives applies to each reference.
- **Whether `ADJUSTMENT` rows require a stronger structural link** (a real FK to the row/group they correct) versus the free-text `reference` field proposed in §8/§18.
- **Timing and process for introducing `Money Changer`/`Supplier` `partner_type` values** (§6) — validated as feasible, not scheduled.

## 32. Implementation Preconditions

Before any implementation phase begins, per this document and the prior audits:

1. Product Owner authorization for schema/migration work (this document is not that authorization).
2. Resolution or explicit acceptance of the Admin Order Delete interaction (§26).
3. A decision on which immutability precedent (Compensation Ledger vs. Loyalty Ledger shape) to follow, per D7's intent (§23/§30).
4. A decision on FK behavior per reference (§31).
5. Confirmation of whether `CurrencyInput` needs a CNY/FX-capable variant before any UI work begins (§22/§30).

---

## Final Governance

```
BUSINESS MODEL:     LOCKED
ARCHITECTURE:       LOCKED
SCHEMA:             PROPOSED ONLY
IMPLEMENTATION:     NOT AUTHORIZED
MIGRATION:          NOT AUTHORIZED
CODE:               NOT AUTHORIZED
```

**Genuinely deferred Product Owner decisions (§31, not invented for completeness):** PO-D4 (Asset vs. Payable classification); write-path automation scope beyond "manual must be supported" (D6); per-reference FK behavior (RESTRICT vs. SET NULL) beyond "not CASCADE" (D10); ADJUSTMENT's structural link strength; timing for introducing `Money Changer`/`Supplier` partner types (D2).
