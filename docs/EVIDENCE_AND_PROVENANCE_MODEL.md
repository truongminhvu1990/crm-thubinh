# Jade Intelligence Platform — Evidence & Provenance Model

**Package:** 1.7 — Evidence & Provenance Model
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no JSON schema, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6) — all three treated as **LOCKED** per this task's instruction. (Note: their own file headers still read "Draft," unedited, the same convention already established for Package 1 in the previous task — the lock is tracked by this Product Owner Decision, not a header edit.) None of the three is modified by this document.

---

## 1. Vision

The platform must always be able to answer one question: **"Why did the AI reach this conclusion?"** Every Knowledge item is never a bare assertion — it is always backed by identifiable Evidence, and every piece of Evidence always carries a traceable Provenance back to where it really came from. This is what makes the platform's summaries, trends, and market signals auditable and trustworthy rather than opaque AI output — the same commitment Canonical Data Model §8 already made for Canonical Documents, extended here to cover the Knowledge built on top of them.

---

## 2. Design Principles

1. **No Knowledge without Evidence.** A Knowledge item cannot exist without at least one Evidence item supporting it.
2. **Evidence is not Knowledge.** Evidence is the supporting material; Knowledge is the AI-derived conclusion drawn from it. Keeping the two distinct is what makes "why did the AI reach this conclusion" answerable — the Evidence can always be pointed at separately from the Knowledge it supports.
3. **Many-to-many, not one-to-one.** One Knowledge item can be supported by multiple Evidence items, and one Evidence item can support multiple Knowledge items (§10). Evidence is a reusable, shared resource, not a single-use citation.
4. **Provenance is inherited, not re-derived.** An Evidence item's Provenance is fixed at the moment the Evidence is created and traces back through the Canonical Data Model's own chain (§4, §5) — Evidence never invents a separate origin story of its own.
5. **Conflicting Evidence is preserved, not resolved.** The model represents disagreement between Evidence items honestly rather than silently picking a winner (§8). This document does not decide how conflicts get resolved.
6. **Confidence is descriptive here, not computed.** Confidence (§7) is named as a business concept for expressing trust in Evidence or Knowledge — this document does not specify how it is calculated.
7. **Traceability is transitive and complete.** Tracing from any Knowledge item must always be able to walk all the way back to the original raw source, with no broken link anywhere in the chain (§9).

---

## 3. Evidence

**Business meaning:** Evidence is a discrete, identifiable piece of supporting material that grounds a Knowledge item's conclusion in something real and traceable — a specific Canonical Document, a specific external reference, a specific market observation, or a specific piece of prior Knowledge (§6). Evidence answers *"what specific thing led to this conclusion,"* as distinct from Knowledge, which answers *"what did we conclude."* Evidence does not draw conclusions on its own — it is the raw material a conclusion is built from.

---

## 4. Provenance

**Business meaning:** Provenance is the record of where a given piece of Evidence — and, transitively, any Knowledge it supports — actually originated: which Canonical Document, which Raw Source, which Collector, and when it was collected (directly reusing the fields and chain already defined in `docs/CANONICAL_DATA_MODEL.md` §3, §8). Provenance is what makes Evidence trustworthy *as* evidence — Evidence without Provenance is just an unverified assertion.

---

## 5. Evidence Chain

```
Raw Source
   ↓
Canonical Document
   ↓
Evidence
   ↓
Knowledge
```

This refines Canonical Data Model §8's traceability chain by naming Evidence as the explicit layer between a Canonical Document and the Knowledge built from it. The AI Processing Layer (Platform Architecture §10) does not derive a Knowledge item directly from a raw Canonical Document — it draws one or more Evidence items *from* Canonical Document(s), and it is the Evidence, not the Canonical Document itself, that a Knowledge item directly cites. This is a business-level refinement of the existing chain, not a change to Canonical Data Model §3 or §8 — neither document is edited.

---

## 6. Evidence Types

Business meaning only — no schema, no storage format.

| Evidence Type | Business Meaning |
|---|---|
| **Raw Document** | The unprocessed raw item exactly as originally collected (Platform Architecture §9's Raw Data Layer). Used as Evidence when the literal original wording or appearance matters more than its normalized form. |
| **Canonical Document** | The normalized universal object (Canonical Data Model §3) — the most common form of Evidence, since most AI Processing Layer stages work from Canonical Documents rather than raw items. |
| **External Reference** | A pointer to supporting material that lives outside this platform's own collected data — narrower and lighter-weight than a full Collector-sourced item (§12 Open Question #6 on how it's verified). |
| **Market Observation** | A specific, concrete fact about the market observed at a point in time (e.g. a specific Price Event, `docs/TAXONOMY_AND_ONTOLOGY.md` §4) — Evidence that is itself a structured fact rather than a document. |
| **Historical Knowledge** | An existing, previously-created Knowledge item used as Evidence for a *new* Knowledge item (e.g. a previously detected Trend supporting a new Market Signal). This is how Knowledge can build on Knowledge over time while staying traceable — Historical Knowledge already carries its own complete Evidence Chain (§5). |
| **Future Evidence Types** | This list is not closed — new Evidence Types can be added without changing how Evidence, Knowledge, and Provenance relate to each other (same additive-extensibility principle as Canonical Data Model §9). |

---

## 7. Confidence

**Business meaning, no algorithm, no scoring formula.** Confidence is a business concept expressing how strongly a piece of Evidence — or a Knowledge item built from it — should be trusted. A single ambiguous social-media mention would typically warrant a different level of trust than a well-corroborated Market Observation backed by several independent Evidence items. This document states only that Confidence exists as a concept attached to Evidence and/or Knowledge, meant to help a person (or a future downstream module) judge how much weight to give a conclusion. It does not define how Confidence is calculated, how it combines across multiple Evidence items supporting one Knowledge item, or whether it is expressed numerically or qualitatively (§12 Open Questions #1–2).

---

## 8. Conflicting Evidence

**How conflicts are represented — not resolved.** When two or more Evidence items disagree about the same underlying fact (e.g. one source says a Mine has closed, another says it is still operating), the platform represents **both pieces of Evidence side by side**, each keeping its own Provenance (§4) and Confidence (§7), rather than silently discarding one or merging them into a single "resolved" fact. A Knowledge item built while conflicting Evidence exists must itself be able to reflect that a conflict exists — by remaining linked to Evidence items that disagree — rather than presenting a false sense of certainty.

This document explicitly does **not** decide how, whether, or by whom such conflicts are ever resolved — that is Out of Scope (§11) and left open (§12 Open Question #3) for a future package.

---

## 9. Traceability Rules

Every Knowledge item must trace back to:

- **Evidence** (§3) — the specific supporting material the conclusion was drawn from.
- **Canonical Document** (Canonical Data Model §3) — the normalized source that Evidence was drawn from.
- **Raw Source** (Platform Architecture §9) — the original, unprocessed collected item.
- **Collector** (Platform Architecture §8) — the component that produced the Raw Source.
- **Collection Time** — when the Raw Source was actually captured.

No Knowledge item may exist without a complete, unbroken path through all five. This is the definitive rule of this document, extending Canonical Data Model §8's chain by inserting Evidence explicitly (§5).

---

## 10. Business Examples

**One Knowledge supported by multiple Evidence items.** A Market Signal — "rising demand for Apple Green jade" — is supported by three independent Evidence items: a Canonical Document from a Facebook group post discussing the color, a Market Observation recording a specific Price Event with an above-average sale price, and a piece of Historical Knowledge — a Trend detected the previous quarter showing the same direction. All three independently point toward the same conclusion, and the Knowledge item cites all three.

**One Evidence supporting multiple Knowledge items.** A single Canonical Document — an industry website article about a specific Mine's supply conditions — serves as Evidence for two separate Knowledge items at once: a Risk signal about that Mine's Origin, and a separate Trend about Material availability tied to that Mine. The same Evidence is reused, not duplicated, across both (Design Principle 3).

**Conflicting Evidence.** Evidence A (a Facebook post) claims a specific Mine has closed. Evidence B (an RSS item from an industry news source, collected the same week) claims the same Mine is still operating at reduced capacity. Both are retained as Evidence, each with its own Provenance and Confidence (§4, §7); any Knowledge item drawn from this material must reflect that the underlying Evidence disagrees (§8), rather than silently choosing one side.

---

## 11. Out of Scope

- Any SQL, database schema, JSON schema, or code — business meaning only.
- Any Confidence scoring algorithm or formula (§7).
- Any conflict-resolution mechanism, process, or authority (§8) — representation only; resolution is undecided and left for a future package.
- Any UI or visualization of Evidence, Provenance, or Confidence.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, or `docs/TAXONOMY_AND_ONTOLOGY.md` — all three referenced only, none modified, per explicit instruction.
- Any CRM code, schema, or module change.
- Designing how the AI Processing Layer actually selects or weighs Evidence when producing a Knowledge item — this document defines the model Evidence, Knowledge, and Provenance must fit, not the algorithm that populates it.

---

## 12. Open Questions

1. **Confidence representation.** Qualitative (e.g. Low/Medium/High) or numeric — not decided (§7 explicitly excludes deciding this, but the choice itself remains open for a future package).
2. **Confidence aggregation.** When multiple Evidence items with different individual Confidence levels support one Knowledge item, does the Knowledge item get its own separate Confidence — and if so, how is it derived from its Evidence's confidences? Not decided.
3. **Conflict-resolution ownership.** §8 explicitly does not resolve conflicts — but who (a person, a future automated process, a specific Future Module) is ever expected to, and when? Not decided.
4. **Evidence lifecycle.** Does Evidence share the same Document Lifecycle as a Canonical Document (Canonical Data Model §4), or does it have its own — e.g. can Evidence be "Archived" independently of the Canonical Document it was drawn from? Not decided.
5. **Historical Knowledge depth.** When Historical Knowledge is used as Evidence (§6), is there a limit to how many "generations" of Knowledge-built-on-Knowledge are allowed before requiring fresh primary Evidence? Not decided — relevant to keeping conclusions from drifting too far from real source material over time.
6. **External Reference verification.** Since External Reference (§6) is lighter-weight than a full Collector-sourced Canonical Document, what verification (if any) applies before it's trusted as Evidence? Not decided.
7. **Boundary with the Attachment Model.** Is an Attachment (Canonical Data Model §5) ever itself directly usable as Evidence, or must it always be represented as part of its parent Canonical Document? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
