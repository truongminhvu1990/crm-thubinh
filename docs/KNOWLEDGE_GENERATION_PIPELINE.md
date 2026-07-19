# Jade Intelligence Platform — Knowledge Generation Pipeline

**Package:** 5D — Knowledge Generation Pipeline
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no AI model selection, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4), `docs/PREPROCESSING_PIPELINE.md` (Package 5A), `docs/UNDERSTANDING_PIPELINE.md` (Package 5B), `docs/REASONING_PIPELINE.md` (Package 5C) — all ten treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the ten is modified by this document. This is the final stage of the AI pipeline chain: Collector Framework → Preprocessing → Understanding → Reasoning → **Knowledge Generation**.

---

## 1. Vision

Knowledge Generation is the final, and only, stage in the whole platform allowed to actually create or update a Knowledge item. Everything before it — Collectors, Raw Data Storage, Preprocessing, Understanding, Reasoning — exists to produce well-grounded, well-understood, well-reasoned-about material. Knowledge Generation is where that material finally becomes the platform's actual, persistent, queryable Knowledge (Taxonomy & Ontology §4's Knowledge Entity Type; Platform Architecture §11's Knowledge Store). Every other pipeline in this platform explicitly stopped short of this exact step — Knowledge Generation is where that boundary ends.

---

## 2. Design Principles

1. **Knowledge Generation is the ONLY pipeline allowed to create or update Knowledge.** No Collector, no Preprocessing stage, no Understanding stage, and no Reasoning stage is ever permitted to do this.
2. **Nothing becomes Knowledge without surviving the full lifecycle first.** Knowledge Creation (§9) only happens after a Knowledge Candidate (§5) has passed through Evidence Validation, Confidence Assignment, and Conflict Review (§4) — there is no shortcut path.
3. **Reasoning Output is material, not a mandate.** Not every Reasoning Output automatically becomes Knowledge — Knowledge Generation exercises real judgment before committing anything.
4. **Knowledge is never silently overwritten.** Knowledge Versioning (§10) means Knowledge evolves through tracked versions — updating a Knowledge item never erases what it previously said.
5. **Conflicts are reviewed, never auto-resolved.** Conflict Review (§8) extends Evidence & Provenance Model §8's "preserve, don't silently resolve" stance into an active workflow step — this document does not grant Knowledge Generation the authority to automatically pick a winner between conflicting Evidence.
6. **Publication is a deliberate, separate step from Creation.** A Knowledge item can exist (be Created, §9) before it's Published (§11) — becoming available to downstream consumers is its own gated step, not an automatic side effect of Creation.
7. **Technology and algorithm-agnostic.** No AI model, algorithm, scoring formula, or automatic conflict-resolution mechanism is chosen anywhere in this document.

---

## 3. Pipeline Responsibilities

**In scope, business terms only:**
- Identifying which parts of a Reasoning Output are worth considering as new or updated Knowledge (Knowledge Candidate, §5).
- Confirming a Knowledge Candidate's supporting Evidence actually holds up (Evidence Validation, §6).
- Assigning a Confidence level to a Knowledge Candidate (Confidence Assignment, §7).
- Reviewing whether a Knowledge Candidate's Evidence conflicts with existing Knowledge or other Evidence (Conflict Review, §8).
- Actually creating or updating a Knowledge record — the one and only place in the platform this happens (Knowledge Creation, §9).
- Tracking how a Knowledge item changes over time without losing its history (Knowledge Versioning, §10).
- Deciding when a Knowledge item becomes available to downstream consumers (Knowledge Publication, §11).

**Out of scope**, restated fully in §13 — most importantly: CRM Actions, Automation, Notifications, Reporting, and UI are never this Pipeline's job.

---

## 4. Pipeline Lifecycle

```
Reasoning Output
   ↓
Knowledge Candidate
   ↓
Evidence Validation
   ↓
Confidence Assignment
   ↓
Conflict Review
   ↓
Knowledge Creation
   ↓
Knowledge Versioning
   ↓
Knowledge Publication
```

Each stage's business meaning is detailed in its own section below (§5–§11).

---

## 5. Knowledge Candidate

**Business meaning only.** A Knowledge Candidate is a specific piece of Reasoning Output (a discovered Relationship, a detected Trend, Market Signal, Risk, or Opportunity — Reasoning Pipeline §7–11) being considered for promotion into actual, persistent Knowledge. Not every Reasoning Output automatically becomes a Knowledge Candidate, and not every Knowledge Candidate automatically becomes Knowledge — this is the first checkpoint in a deliberate, multi-step promotion path (§4), not an automatic pass-through.

---

## 6. Evidence Validation

**Uses the LOCKED Evidence & Provenance Model. Business meaning only.** Evidence Validation confirms that a Knowledge Candidate's supporting Evidence (linked back in Reasoning Pipeline §5's Evidence Linking) is actually sufficient and sound enough to justify creating Knowledge from it — checking that the Evidence Chain (`docs/EVIDENCE_AND_PROVENANCE_MODEL.md` §5) is genuinely complete and unbroken, and that the Traceability Rules (Evidence & Provenance Model §9) are satisfied, before proceeding. A Knowledge Candidate whose Evidence doesn't validate does not proceed to Confidence Assignment or beyond (§14 Open Question #6).

---

## 7. Confidence Assignment

**Business meaning only — no algorithm, no scoring formula.** Confidence Assignment assigns a Confidence level to a Knowledge Candidate that has passed Evidence Validation. This is the confirmed home for Confidence, across the whole platform: Evidence & Provenance Model §7 first named the concept without a formula; Understanding Pipeline §13 and Reasoning Pipeline §14 both left its home unplaced. It happens here, in Knowledge Generation — not in Reasoning, not in Understanding. No calculation method, scale, or formula is defined in this document — only that Confidence is assigned as part of the path to becoming Knowledge.

---

## 8. Conflict Review

**Business meaning only — do not automatically resolve conflicts.** Conflict Review checks whether a Knowledge Candidate's Evidence conflicts with other Evidence supporting it, or with existing published Knowledge (Evidence & Provenance Model §8's Conflicting Evidence). This is the first point in the whole platform where conflicts are actively reviewed as part of a workflow step — but this document does **not** grant Knowledge Generation the authority to automatically pick a winner between conflicting Evidence.

What actually happens to a Knowledge Candidate found to have unresolved conflicting Evidence — proceeding as flagged/conflicted Knowledge, being held, or requiring a decision from elsewhere — is not defined here (§14 Open Question #1).

---

## 9. Knowledge Creation

**Business meaning only — Knowledge is created only here.** Once a Knowledge Candidate has passed Evidence Validation (§6), received a Confidence Assignment (§7), and been through Conflict Review (§8), it becomes an actual Knowledge item (Taxonomy & Ontology §4's Knowledge Entity Type) — the platform's persistent, structured record of a conclusion.

This is the one and only place, across every package designed so far, where a Knowledge record is actually created or updated. Restating Design Principle 1: no Collector, no Preprocessing stage, no Understanding stage, and no Reasoning stage is ever permitted to do this.

---

## 10. Knowledge Versioning

**Business meaning only — Knowledge evolves through versions; historical versions remain traceable.** A Knowledge item is not static — new Evidence, a Conflict Review outcome, or simply the passage of time may lead to an existing Knowledge item being updated. When that happens, the update becomes a **new version** of that Knowledge item, and the prior version remains retained and traceable — never silently overwritten or lost.

This mirrors the same "never break Traceability" discipline already established for Raw Data Storage (§9 there) and Canonical Data Model (Design Principle 6), now applied to Knowledge itself.

---

## 11. Knowledge Publication

**When Knowledge becomes available to the Knowledge Store, Knowledge Graph, and CRM Integration.** Publication is the deliberate step where a newly-Created (or newly-versioned) Knowledge item becomes available to be read by downstream consumers:

- The **Knowledge Store** (Platform Architecture §11).
- A **Knowledge Graph** — an implied structural view over Knowledge's Relationships (Taxonomy & Ontology §7) — not separately designed before this document (§14 Open Question #3).
- **CRM Integration** (Platform Architecture §12), if it is ever built.

Creation (§9) and Publication are distinct: a Knowledge item can exist without yet being Published. This document leaves room for a Knowledge Candidate to be Created but held back from general visibility — the exact criteria for that gap, and who decides it, are not defined here (§14 Open Question #2).

---

## 12. Business Examples

**New Market Trend.** Reasoning Output includes a newly-detected Trend (Reasoning Pipeline §8) with no prior related Knowledge existing yet. It becomes a Knowledge Candidate; its Evidence validates; it receives a Confidence Assignment; Conflict Review finds nothing to conflict with; Knowledge Creation produces a brand-new Knowledge item (version 1); it is Published — now visible in the Knowledge Store/Graph.

**Updated Price Trend.** Reasoning Output includes new Evidence reinforcing (or shifting) a Trend that already exists as published Knowledge. The new material becomes a Knowledge Candidate tied to the existing Knowledge item; its Evidence validates; a fresh Confidence Assignment is made; Conflict Review confirms it's a legitimate evolution of the existing Knowledge; Knowledge Creation produces a new version of the same Knowledge item (§10) — the prior version remains retained, the new version is Published.

**Conflicting Market Information.** Reasoning Output includes a Knowledge Candidate whose Evidence directly conflicts with Evidence behind an already-published Knowledge item (the same scenario Evidence & Provenance Model §10 used — one source says a Mine closed, published Knowledge already says it's operating). Evidence Validation and Confidence Assignment still proceed independently for the new Candidate, but Conflict Review flags the conflict explicitly — per Design Principle 5, it is not automatically resolved; the Candidate does not silently overwrite or get silently discarded against the existing Knowledge (§14 Open Question #1 on what happens next).

**Supplier Status Change.** Reasoning Output includes a Relationship Discovery finding (Reasoning Pipeline §7) that a Supplier's relationship to a Product or Market has changed. It becomes a Knowledge Candidate, validates, receives a Confidence Assignment, passes Conflict Review, and either creates new Knowledge or versions an existing Supplier-related Knowledge item, then Publishes — showing that Knowledge Generation handles relationship-type findings the same way it handles Trend/Signal-type findings, not only market-trend-shaped Knowledge.

---

## 13. Out of Scope

- **CRM Actions** — no write, no action, no integration with the CRM happens here.
- **Automation** — Knowledge Generation produces Knowledge; it does not trigger any automated business process.
- **Notifications** — alerting anyone that new Knowledge exists is out of scope.
- **Reporting** — presenting Knowledge to a person is out of scope here.
- **UI** — no interface of any kind is designed here.
- Any AI model, algorithm, scoring formula, or automatic conflict-resolution mechanism.
- Any SQL, database schema, or code.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, `docs/UNDERSTANDING_PIPELINE.md`, or `docs/REASONING_PIPELINE.md` — all ten referenced only, none modified.
- Any CRM code, schema, or module change — CRM Integration (§11) is named only as a downstream consumer of Publication, not designed here (Platform Architecture §12 already named it as a future, separate task).
- Designing the Knowledge Graph structure itself (§11) — named only as a consumer of Published Knowledge, not designed.
- Defining exactly what happens to a Knowledge Candidate that fails Conflict Review (§8) — flagged, not decided (§14 Open Question #1).

---

## 14. Open Questions

1. **Conflict Review outcome.** §8 explicitly does not auto-resolve conflicts, but doesn't say what actually happens to a Knowledge Candidate found to conflict — created as flagged/conflicted Knowledge, held for a person to decide, or held indefinitely? Not decided.
2. **Publication gap.** §11 allows a Knowledge item to be Created without yet being Published — what criteria, or who, decides when (or whether) a Created-but-unpublished Knowledge item is actually released? Not decided.
3. **Knowledge Graph definition.** §11 names a "Knowledge Graph" as one of three things Knowledge becomes available to, alongside the Knowledge Store and CRM Integration — but no prior package formally designed a Knowledge Graph as distinct from the Knowledge Store (Platform Architecture §11). Is it a separate structure, or another view of the same Knowledge Store? Not decided.
4. **Confidence Assignment inputs.** Now that Confidence Assignment (§7) is confirmed to happen here, what does it actually draw on — Evidence's own Confidence (Evidence & Provenance Model §7), the Source's Trust Level (Source Registry §7), some combination, or something else? Still no formula, per instruction, but even the inputs aren't named. Not decided.
5. **Versioning granularity.** §10 states Knowledge evolves through versions — does every single update (e.g. one new piece of corroborating Evidence) create a new version, or only sufficiently material changes? Not decided.
6. **Knowledge Candidate rejection.** What happens to a Knowledge Candidate that fails Evidence Validation (§6) outright — discarded, held, or does its underlying Reasoning Output get flagged for review? Not decided.
7. **Re-triggering Knowledge Generation.** Consistent with the versioning/re-processing questions raised in every prior pipeline package — if an earlier stage is re-run with updated logic and produces a different Reasoning Output for material that already generated Knowledge, does that automatically create a new Knowledge Candidate, or does it require a separate trigger? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
