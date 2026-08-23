# Inventory Management — Product Specification

**Status:** REVISION 4 — Product Owner Decision applied 2026-08-23 ("Link Customer / Order / Invoice context for reserved or deposit-held products"); continues Revision 3's Decisions 1–3 (Revision 2's Decisions 1–7 before that).

**Revision 4 (Product Owner Decision, 2026-08-23):** Narrowly overrides §9's "no write relationship with Orders... observational only" framing as it was read to forbid *display* linkage — see §9's own note below for the precise scope. A Product held against an open (Draft/Reserved) Order is not merely isolated inventory: Inventory Management's Visibility capability (§1) now includes, display-only, that Order's Customer, Order code, existing Payments, and Order Status when the Product Detail Drawer is open for a currently-held Product (`docs/INVENTORY_UI.md` Revision 4, §1.6). This is presentation of already-existing Order/Customer/Payment data (no new field, no new entity, no write) — it does not reopen Reservation ownership (§5, still Orders'), does not add a write path (§9's first sentence, "no write relationship with Orders," is unchanged), and does not introduce Inventory Detail's own routed page (still Drawer-only, §6/UI §1.6).
**Prepared by:** Claude (Engineering Lead), per Product Owner instruction 2026-07-30, Module: Inventory Management.
**Architecture:** Specification-First, business-first. Architecture only — no implementation, no SQL, no API. Same structure as `docs/01_CUSTOMER_SPEC.md`, `docs/02_PRODUCT_SPEC.md`, `docs/03_ORDER_SPEC.md`, `docs/04_PAYMENT_SPEC.md`: Part A states Business Rules; Part B is implementation-only context; Part C lists open questions.

**Basis:** Not a from-scratch design. This document cross-checks against, and does not contradict, the five documents named in the task's Requirements — `docs/EVENT_CATALOG.md`, `docs/BUSINESS_SPEC_INDEX.md`, `docs/02_PRODUCT_SPEC.md` (LOCKED), `docs/03_ORDER_SPEC.md` (LOCKED, now Revision 4 — see §5), `docs/04_PAYMENT_SPEC.md` (Revision 3) — plus `docs/INVENTORY_SPEC.md` (Phase 1, read-only), **LEGACY BUSINESS DESIGN** per Revision 2 Decision 2, consolidated here the same way `docs/03_ORDER_SPEC.md` consolidated `docs/ORDERS_SPEC.md`.

**Business Rule (Revision 2, Decision 1, LOCKED into this document; extended by Revision 3, Decision 2):** Inventory is **not** the owner of Product Status. Inventory Management provides exactly six capabilities: **Aggregation, Visibility, Audit, Adjustment, Reporting, and Physical Stock Take** (§12, new this revision) — it must not redefine Product Lifecycle. Product Status itself remains owned by `docs/02_PRODUCT_SPEC.md` §7 (LOCKED, "governing precedence"); the Reservation mechanism remains owned by `docs/03_ORDER_SPEC.md` §6/§12 (LOCKED). This mirrors the precedent already set for Payment Management (`docs/04_PAYMENT_SPEC.md` Decision 1).

---

# Part A — Inventory Specification

## 1. Purpose

Inventory Management exists to answer "what do we actually have in stock right now," and "what do we do when the record and physical reality disagree." Per Decision 1 (Revision 2) and Decision 2 (Revision 3), it provides exactly six capabilities — **Aggregation** (stock counts/breakdowns), **Visibility** (availability display), **Audit** (§13's six event types), **Adjustment** (§11's corrective write), **Reporting** (§17), and **Physical Stock Take** (§12's discovery process) — over Product and Batch data. It is not the owner of Product Status and must not redefine Product Lifecycle. `docs/02_PRODUCT_SPEC.md` §7 (LOCKED) explicitly delegates one piece of this: *"There is no 'Lost' status — lost inventory is handled by Inventory Adjustment and Audit, not a Product Status value."* This document is that delegation, formalized, without overstepping it.

## 2. Scope

**In scope:** stock visibility/aggregation, the Inventory Lifecycle as a read/derive layer over Product Status, Inventory Adjustments (the corrective-write capability), Physical Stock Take (the discovery capability, §12), and the Audit trail covering both; Inventory's relationships to Product, Orders, and Payments; permissions, AI readiness, and reporting needs specific to inventory data.

**Out of scope:** Product Status's own definition and transition rules (`docs/02_PRODUCT_SPEC.md` §7, LOCKED), the Reservation mechanism itself (`docs/03_ORDER_SPEC.md` §6, LOCKED), Order or Payment lifecycle (their own specs), Batch as its own owned entity (Batch's own module, unaffected), and multi-warehouse/multi-location stock levels or unit-quantity tracking (no "quantity on hand" concept exists in this business).

## 3. Inventory Lifecycle

**Business Rule:** Inventory Management has no lifecycle of its own distinct from Product's. A "unit of inventory" *is* a Product record, and its lifecycle *is* Product Status's lifecycle (`docs/02_PRODUCT_SPEC.md` §4/§7): it enters as Available, may become Reserved, then Sold, or at any point Archived via an Inventory Adjustment. Inventory Management does not introduce a parallel or competing lifecycle model.

**Business Rule:** The one addition this document makes to that lifecycle is the **Adjustment path** (§11): a Product may move to Archived via an Inventory Adjustment when it is confirmed lost, damaged, or otherwise no longer part of sellable stock. **This is a one-way transition** — Revision 2 Decision 5 removed the "Found" reversal capability Revision 1 had proposed. There is no path back from an Adjustment-caused Archived state to Available in this document.

## 4. Inventory Status

**Business Rule:** Inventory Management has no Inventory Status field of its own. It reads Product Status (`docs/02_PRODUCT_SPEC.md` §7, LOCKED, four fixed values: Available, Reserved, Sold, Archived) as the sole stock-position signal, exactly as `docs/INVENTORY_SPEC.md` Phase 1 already locked. This document extends that same principle from a read-only view into a corrective (Adjustment) and discovery (Physical Stock Take, §12) capability — it does not introduce a fifth status value or a shadow status field.

## 5. Reservation Rules

**Business Rule:** Inventory Management does not reserve products and has no reservation rules of its own to define. Reservation is entirely owned by Order Management (`docs/03_ORDER_SPEC.md` §6, LOCKED): adding a Product to an Order Item sets that Product's Status to Reserved, and a Product may belong to at most one open Order Item at a time. Inventory's only relationship to reservation is to **display** it accurately (§6) and to **respect it** when an Adjustment is attempted (§11 — Adjustments are unconditionally forbidden on Reserved products, Revision 2 Decision 4).

**Applied this revision (Decision 1):** Revision 2 flagged that `docs/03_ORDER_SPEC.md` §12 (LOCKED) states Orders "never writes Product Status directly," while live code writes it directly with stale vocabulary. Per Decision 1, `docs/03_ORDER_PRODUCT_STATUS_REVISION_PROPOSAL.md` has now been applied — **as an update to `docs/03_ORDER_SPEC.md`'s Part B (architectural/implementation description) only; its Part A Business Rules, including §12's rule that Orders never writes Product Status directly, were maintained unchanged**, since that rule was already correct — the violation was in the code, not in the locked business rule. See `docs/03_ORDER_SPEC.md` Part B (now Revision 4) for the applied description. This resolves Revision 2's §18 Q1.

## 6. Availability Rules

**Business Rule:** A Product's Availability, as Inventory Management presents it, is `products.status` read directly — Available means offerable, Reserved means held against an open Order, Sold and Archived mean not offerable. This restates `docs/02_PRODUCT_SPEC.md` §7/§13 (LOCKED): Status is the sole source of truth, never the legacy `available`/`reserved`/`sold` counter fields.

**Business Rule (restates already-live behavior):** Where a discrepancy exists between a Product's recorded Status and its actual Order history, Inventory Management surfaces this as an informational flag — never a silent correction. This formalizes `lib/inventory.service.ts`'s already-live `deriveAvailability()`/`verifyProduct()` behavior as a Business Rule. Per Revision 2 Decision 7, these sightings (Reservation Mismatch, Product Status Mismatch) are now durably audit-logged (§13), not merely computed fresh on read.

## 7. Stock Movement

**Business Rule:** "Stock movement" in this business means a Product's Status changing — there is no separate quantity or unit-count concept to move. The movements Inventory Management observes (never causes) are: Available → Reserved (an Order Item is added, owned by Orders), Reserved → Sold (an Order completes) or Reserved → Available (an Order is marked Lost), and Available → Archived (an Inventory Adjustment, §11, owned by Inventory Management — one-way, §3).

**Business Rule:** Every stock movement must be attributable to exactly one of two causes: an Order Business Event (Orders' own domain) or an Inventory Adjustment (this document's own domain, §11). Physical Stock Take (§12) does not itself move stock — it only **discovers** discrepancies for Audit to record (§13) and, where warranted, for a subsequent Inventory Adjustment to correct.

## 8. Relationship with Products

**Business Rule:** Every Inventory concept in this document is a Product concept read or, for Adjustments, written — Inventory Management introduces no new product-identity or product-profile field. Product Status (`docs/02_PRODUCT_SPEC.md` §7) remains the single, authoritative model; this document's Adjustment capability (§11) is the one exception explicitly delegated to it by Product Spec itself.

**Business Rule:** Inventory Management also reads Batch data (`product_batches`, per `docs/CRM_DATABASE_SPECIFICATION.md` §5) for aggregation (by-Batch stock counts, §17) exactly as the existing Phase 1 spec already does — it does not modify Batch, and Batch remains its own LOCKED module.

## 9. Relationship with Orders

**Business Rule:** Inventory Management has no write relationship with Orders and does not participate in the Reservation mechanism (§5). Its only relationship is observational: it reads the same Product Status that Orders' actions ultimately affect, and it reads Order history directly (via `order_items`/`orders`, already live in `lib/inventory.service.ts`) solely to power the discrepancy-detection behavior in §6 — never to trigger, block, or alter an Order's own lifecycle.

**Business Rule (Revision 4, Product Owner Decision, 2026-08-23, narrow override):** The same observational Order read this document already performs (previous paragraph) may also be **displayed** in the Product Detail Drawer, for exactly one relationship: the Product's currently-open (Draft/Reserved) Order, if one exists — its Customer, Order code, existing Payments, and Order Status, each linking to Customer/Order's own existing detail routes (`docs/INVENTORY_UI.md` Revision 4, §1.6). Historical Completed/Lost Order links are never shown this way (§5's "at most one open `order_item` at a time" guarantee makes the current hold unambiguous). This remains read-only and non-triggering exactly as the paragraph above requires — display is not a write, and following a Customer/Order link out of Inventory is not Inventory altering that Order's lifecycle.

**Business Rule (Revision 2, Decision 4, LOCKED into this document):** An Inventory Adjustment **must not be allowed** for a Product whose Status is Reserved — no exception, no "resolve the order first and then adjust" path. If a Reserved product genuinely needs correction, the attached Order must move it out of Reserved through Orders' own lifecycle (Completed or Lost) before any Inventory Adjustment can apply.

## 10. Relationship with Payments

**Business Rule:** Inventory Management has **no relationship with Payments** — stock movement is driven entirely by Order Status transitions, never by Payment Status. This follows directly from `docs/03_ORDER_SPEC.md` §4 (LOCKED): "Order Status and Payment Status are completely independent."

## 11. Inventory Adjustments

**Business Rule:** An Inventory Adjustment is a staff-initiated, reasoned correction to a Product's Status, used when the recorded Status no longer matches physical reality. It exists because Product Status (`docs/02_PRODUCT_SPEC.md` §7, LOCKED) has exactly four values and deliberately has no "Lost," "Damaged," or "Miscounted" value of its own — those facts are captured as an Adjustment Reason, not a Product Status value. An Adjustment may be triggered by a staff observation at any time, or by a finding from Physical Stock Take (§12).

**Business Rule (Revision 3, Decision 3, FINAL — "Adjustment Reasons"):** Adjustment Reason is a required field, selected from a Settings-managed master-data category (`inventory_adjustment_reason`), following the same master-data-reference pattern already established for Lost Reason and Payment Method. The final list, replacing Revision 2's proposed candidate set, is exactly:

- **Lost**
- **Damaged**
- **Miscount Correction**
- **Administrative Correction**
- **Other**

**Reason remains metadata only** (Revision 2, Decision 6, unchanged) — it never drives a different system outcome. Every Inventory Adjustment produces exactly the same Status transition (below) regardless of which Reason is selected; Reason exists purely to classify *why*, for Audit (§13) and Reporting (§17) purposes, never to branch business logic. This resolves Revision 2's §18 Q3.

**Business Rule:** An Adjustment applied to an eligible Product (Available only — see the Reserved prohibition, §9, and the Sold prohibition below) sets its Status to **Archived** — the only existing status value meaning "historical, never sellable again." This document does not introduce a new Product Status value to represent "lost" or "damaged" distinctly. There is no reversal mechanism — this transition is one-way (§3).

**Business Rule:** An Adjustment cannot be applied to a Product currently Sold — a completed sale is not reversible by an Adjustment (that would be a Return/Refund concern, out of scope per `docs/03_ORDER_SPEC.md` §18/`docs/04_PAYMENT_SPEC.md` §9). **Nor may an Adjustment ever be applied to a Reserved product** (Decision 4, unconditional — §9). In practice this means an Inventory Adjustment can only ever apply to a Product whose Status is Available.

**Business Rule:** Recording an Inventory Adjustment is a candidate future Business Event (proposed name, following `docs/EVENT_CATALOG.md` §5's Past-Tense/PascalCase standard: `InventoryAdjusted`) — this document does **not** register it, per `docs/EVENT_CATALOG.md` §7 Decision 1 (an event is only Registered once its owning module has an approved database design).

## 12. Physical Stock Take

**Business Rule (Revision 3, Decision 2, new Business Capability):** Physical Stock Take is the process by which staff reconcile recorded Product data against the actual physical items on hand. It is Inventory Management's **discovery** mechanism — Physical Stock Take finds discrepancies; Inventory Audit (§13) is where those findings are permanently recorded. The two are deliberately separated: Physical Stock Take is the act of looking, Audit is the durable record of what was found.

**Business Rule:** Physical Stock Take exists specifically to detect the three discrepancy types Decision 2 names:
- **Missing Product** — a Product recorded as physically present (Available or Reserved) cannot be physically located during the Stock Take.
- **Unexpected Product** — a physical item is found that does not correspond to any Product expected to be present, or does not match its recorded data.
- **Product Status Mismatch** — a physical finding contradicts the recorded Status in a way not already covered by the other two (e.g., an item recorded as Archived is found back in active storage).

**Business Rule:** Every finding a Physical Stock Take produces is recorded as one of the corresponding Audit event types (§13) — a Missing Product finding becomes a Missing Product audit record, and so on. Physical Stock Take does not itself change any Product's Status; a finding that warrants a correction is resolved through a separate Inventory Adjustment (§11), subject to that section's own rules (e.g., a Missing Product finding on a Reserved product still cannot be Adjusted until the Reserved condition clears, §9).

**Business Rule:** This document defines Physical Stock Take's *purpose and relationship to Audit and Adjustment* only. It does not design the mechanics of how a count is scheduled, conducted, scoped (whole-inventory vs. by-Batch vs. by-Category), or who performs it — those are process/workflow details this business-first document does not prescribe, consistent with this task's "no implementation" scope. A future revision or a dedicated workflow document would define the mechanics; this document only establishes that the capability exists and where its outputs go.

## 13. Audit Requirements

**Business Rule (Revision 2, Decision 7, LOCKED into this document):** Inventory Audit must include exactly six event types — every one permanently logged (who/when/which Product/detail), never edited or deleted once created, mirroring the append-only principle already LOCKED for `order_events` and Customer's Timeline:

| # | Audit Event Type | Definition | Discovered by |
|---|---|---|---|
| 1 | **Inventory Adjustment** | A staff-initiated corrective Status change (§11): Product, Status before/after, Reason, actor, timestamp, optional note. | The Adjustment action itself (§11). |
| 2 | **Inventory Discrepancy** | A general/other mismatch between recorded data and physical or system reality, not already covered by #3–#6. | Staff observation, or Physical Stock Take (§12) as a residual/other category. |
| 3 | **Reservation Mismatch** | An open (Draft/Reserved) Order references a Product whose Status is not Reserved. | Already-live logic (§6, `verifyProduct()`'s `hasOpenOrder` check) — now durably logged, not just computed fresh on read. |
| 4 | **Product Status Mismatch** | A Completed Order references a Product whose Status is not Sold, or a physical finding contradicts recorded Status. | Already-live logic (§6, `verifyProduct()`'s `hasCompleted` check) for the Order-history case; **Physical Stock Take (§12)** for the physical-finding case. |
| 5 | **Missing Product** | A Product expected to be physically present cannot be located. | **Physical Stock Take (§12)** — resolves Revision 2's open question; this is no longer a named-but-undesigned category. |
| 6 | **Unexpected Product** | A physical item found does not match any expected/recorded Product. | **Physical Stock Take (§12)** — same resolution as above. |

**Business Rule:** An audit record, once created, is never edited or deleted — correcting a mistaken entry is itself a new audit-logged action, never a rewrite of the original record.

**Business Rule:** Discrepancy sightings (types #2–#6) all require a durable audit trail, not an ephemeral, computed-on-read flag — this was settled in Revision 2 (Decision 7) and now has, per Revision 3 (Decision 2), a named discovery mechanism (Physical Stock Take) for the three types that previously had none.

## 14. Business Rules (Summary)

1. Inventory is not the owner of Product Status — it provides Aggregation, Visibility, Audit, Adjustment, Reporting, and Physical Stock Take only, never redefining Product Lifecycle (§1, Revision 2 Decision 1; Revision 3 Decision 2).
2. Inventory has no lifecycle, status, or reservation model of its own — it reads Product's (§3, §4, §5).
3. Availability is `products.status`, never the legacy counters; discrepancy detection is durably audit-logged, never a silent correction (§6, §13).
4. Stock movement has exactly two legitimate causes: Order Business Events, or Inventory Adjustments — Physical Stock Take discovers but never itself moves stock (§7, §12).
5. Inventory reads Batch data for aggregation; it does not modify Batch or Product identity (§8).
6. Inventory has no relationship with Payments — stock movement never depends on Payment Status (§10).
7. An Inventory Adjustment corrects Status when reality and record disagree; Reason (Lost/Damaged/Miscount Correction/Administrative Correction/Other) is required, master-data-backed, and metadata only — it never drives a different outcome (§11, Decision 6, Decision 3 final list).
8. Every eligible Adjustment sets Status to Archived, uniformly; this is a one-way transition — no reversal capability exists (§3, §11).
9. Adjustments cannot target a Sold product, and can never target a Reserved product, unconditionally (§9, §11).
10. Physical Stock Take discovers Missing Product, Unexpected Product, and Product Status Mismatch; Inventory Audit records all six event types permanently (§12, §13).
11. `docs/03_ORDER_PRODUCT_STATUS_REVISION_PROPOSAL.md` has been applied to `docs/03_ORDER_SPEC.md` Part B — Part A's Business Rules were maintained unchanged (§5).
12. `InventoryAdjusted` is a proposed future Business Event name, not yet Registered (§11).

## 15. Permissions

**Business Rule (PROPOSED):** Inventory Management uses its own namespace, following the `resource.action` standard (`docs/PERMISSION_SPEC.md` Decision 3, LOCKED):

- `inventory.view` — stock visibility (stats, breakdowns, discrepancy flags).
- `inventory.adjust` — recording an Inventory Adjustment.

**No `inventory.delete`** — an Adjustment is a corrective action, never a deletion. No permission is proposed here specifically for Physical Stock Take (§12) or export — since this document defines Physical Stock Take's purpose only, not its workflow (§12), a permission for it is premature; if one is wanted once the workflow is designed, it should be added explicitly then.

## 16. AI Readiness

| Field | AI-learnable? | Why |
|---|---|---|
| Adjustment Reason | Yes | Loss/damage-rate modeling by category, batch, supplier, or time period. |
| Adjustment frequency (by Product, Batch, Category) | Yes | Shrinkage-pattern detection, supplier-quality signal. |
| Discrepancy-flag occurrences (§6, §13) | Yes | Durably logged per Decision 7 — pattern-of-mismatch modeling by product/staff/time period. |
| Physical Stock Take findings (Missing/Unexpected Product, §12) | Yes | Shrinkage and data-accuracy modeling by location/batch/category, once a Stock Take mechanism exists. |
| Note (free text) | Caveat | NLP-only, same caveat every other spec's free-text field carries. |
| Stock counts/breakdowns (§17) | Already covered | Aggregations of Product's own AI-learnable fields (`docs/02_PRODUCT_SPEC.md` §17) — not re-enumerated here. |

## 17. Reporting

**Business Rule:** Reports/BI reads Inventory data (stock counts, breakdowns) exactly as the existing Phase 1 statistics already provide — Total Products, By Status, By Origin, By Category, By Batch, By Sales Owner.

**Business Rule:** Adjustment and Audit data should additionally support a shrinkage/loss-rate report — Adjustment count and Reason breakdown, plus Physical Stock Take finding counts (Missing/Unexpected Product), over a date range, by Category and by Batch. This document supplies the requirement; building the report remains Reports/BI's own responsibility.

## 18. Assumptions

Revision 2's Assumptions are resolved by this revision's decisions: Assumption 1 (Order/Product status-write discrepancy) via Decision 1 (applied to `docs/03_ORDER_SPEC.md` Part B); Assumption 4 (Missing/Unexpected Product detection) via Decision 2 (Physical Stock Take); Assumption 5 (Adjustment Reason list) via Decision 3 (final list). Remaining:

1. **`docs/INVENTORY_SPEC.md`'s five carried-forward Open Questions (Batch View placement, Product Detail placement, Filter set, Batch search, Product Detail "Price" field) remain UI/implementation-flavored**, out of scope for this business-first document.

2. **No multi-warehouse, multi-location stock level, or unit-quantity concept is assumed to exist or be wanted.**

3. **Physical Stock Take's own mechanics (scheduling, scope, who performs it) are explicitly not designed here** (§12) — this document establishes the capability's purpose and its relationship to Audit/Adjustment only. This is a deliberate scope boundary, not an oversight — a full workflow design is future scope.

## 19. Product Owner Questions

Revision 2's Q1 (Order/Product Status proposal), Q2 (Missing/Unexpected Product detection), and Q3 (Adjustment Reason list) are resolved by this revision's Decisions 1, 2, and 3 respectively. Remaining:

| # | Question | Why it needs a decision |
|---|---|---|
| Q1 | Physical Stock Take's mechanics (§12) — how a count is scheduled, its scope, and who performs it — are not designed in this document. Should a follow-on specification or workflow document be commissioned for this, and if so, when? | Without it, Physical Stock Take exists as a named capability with a defined *purpose* but no way to actually be carried out. |

---

# Part B — Current Implementation Notes

*Informational only — describes what the code does today, for engineering awareness. Does not influence Part A; where the two disagree, Part A governs and this section marks the gap.*

- **Inventory Phase 1 is genuinely live**, contrary to `docs/INVENTORY_SPEC.md`'s own stale "Draft, awaiting review" header: `lib/inventory.service.ts`, `app/inventory`, and `components/inventory/InventoryBatchTable.tsx` / `InventoryProductTable.tsx` / `InventoryStatsCards.tsx` all exist and implement the locked Phase 1 statistics exactly.
- **The live code already goes beyond Phase 1's own stated scope.** `lib/inventory.service.ts`'s `getProductOrderLinks()`/`deriveAvailability()`/`verifyProduct()` functions read `order_items`/`orders` directly, joined against `products.status`, to detect and flag discrepancies — undocumented in any Business Spec prior to Revision 1 of this document.
- **Live status vocabulary is still the old, superseded five-value model.** `deriveAvailability()` checks `product.status === "Active"`, not `"Available"`.
- **The Orders/Product Status architecture violation (Revision 2 Assumption 1) has now been addressed at the documentation level** via `docs/03_ORDER_PRODUCT_STATUS_REVISION_PROPOSAL.md`, applied to `docs/03_ORDER_SPEC.md` Part B (Revision 4) per this revision's Decision 1. **The underlying code (`lib/orders/order.repository.ts`'s direct `products.status` writes) has not been changed** — this revision applies the proposal's documentation/architectural-description update only, not an engineering fix. The gap between LOCKED business rule and live code therefore still exists in the codebase; only the written record of it has changed, from "undocumented violation" to "documented, known gap awaiting an engineering fix."
- **No Inventory Adjustment, Audit, `inventory_adjustment_reason` master data, or Physical Stock Take mechanism exists anywhere in the codebase today.** §11/§12/§13 are entirely new engineering scope.
- **No `inventory.*` permission is seeded anywhere today** — consistent with every other module's not-yet-enforced permission set.

---

# Part C — Remaining Product Owner Questions

Same one question as §19: whether and when to commission Physical Stock Take's own workflow mechanics as a follow-on piece of work. Everything else raised across Revisions 1 and 2 of this document is now resolved.
