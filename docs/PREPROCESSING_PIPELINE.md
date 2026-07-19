# Jade Intelligence Platform — Preprocessing Pipeline

**Package:** 5A — Preprocessing Pipeline
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no AI model selection, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4) — all seven treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the seven is modified by this document. This document elaborates the earlier portion of Platform Architecture §10's AI Processing Layer (Cleaning, Language Detection, Duplicate Detection) as its own business-designed Pipeline; the later Understanding-producing stages (Translation, Summarization, Topic Extraction, Entity Extraction, Trend Detection, Market Signals) remain out of scope here (§11).

---

## 1. Vision

Before any AI Processing Layer stage that produces Understanding ever runs, every Canonical Document must first pass through a Preprocessing Pipeline that gets it into a clean, consistent, AI-ready state. Preprocessing's job is entirely preparatory — it makes documents ready to be understood, but it never itself produces Knowledge. This keeps a clean boundary: Preprocessing is about getting the input right; Understanding is about drawing conclusions from that input.

---

## 2. Design Principles

1. **Preprocessing prepares, it never concludes.** Preprocessing never creates Knowledge — its only output is an AI-ready Document (§10), never a Knowledge item, a Trend, or a Market Signal.
2. **Every Canonical Document passes through the same Pipeline.** Regardless of Source Type or Collector (Collector Framework §5), every Canonical Document goes through the same Validation → Cleaning → Language Detection → Normalization → Duplicate Detection sequence before it's considered AI-ready.
3. **Preprocessing operates on Canonical Documents, never on Raw Data directly.** Consistent with Raw Data Storage §7–8 — Preprocessing reads Canonical Documents (already normalized from Raw Data by a Collector); it never reaches back into Raw Data Storage itself.
4. **Meaning preservation over transformation.** Cleaning (§6) and this Pipeline's own Normalization (§8) refine a document's presentation, never its substance — the goal is a cleaner, more consistent version of the same meaning, not a reinterpretation of it.
5. **This Pipeline's Normalization does not redefine the Canonical Document.** It operates within the Canonical Document's existing fields (chiefly Content) — it never changes the Canonical Document's fields, shape, or identity already fixed by Canonical Data Model §3.
6. **Duplicate Detection here recognizes, it does not resolve.** Preprocessing flags likely duplicates (§9) but does not decide what happens to them — a related but distinct idea from Evidence & Provenance Model §8's "represent, don't resolve" stance on conflicting Evidence.
7. **Technology and algorithm-agnostic.** No AI model, algorithm, or similarity threshold is chosen anywhere in this document.

---

## 3. Pipeline Responsibilities

**In scope, business terms only:**
- Confirming a Canonical Document is structurally valid and complete enough to proceed (Validation, §5).
- Removing technical noise and standardizing presentation without altering meaning (Cleaning, §6).
- Determining what language a document's content is written in (Language Detection, §7).
- Standardizing the document's content presentation consistently across all documents (Normalization, §8).
- Recognizing likely duplicate documents (Duplicate Detection, §9).
- Producing a finished AI-ready Document (§10) and handing it off.

**Out of scope**, restated fully in §11 — most importantly: Entity Recognition, Classification, Topic Detection, Sentiment, Summarization, and Knowledge Creation are never Preprocessing's job. Translation also stays outside this Pipeline, remaining the later, optional AI Processing Layer step Platform Architecture §10 already defined it as.

---

## 4. Pipeline Lifecycle

```
Canonical Document
   ↓
Validation
   ↓
Cleaning
   ↓
Language Detection
   ↓
Normalization
   ↓
Duplicate Detection
   ↓
AI-ready Document
```

Each stage's business meaning is detailed in its own section below (§5–§9); the finished result is described in §10.

---

## 5. Validation

**Business meaning:** Validation confirms a Canonical Document is structurally sound and complete enough to be usefully processed further — it has the minimum a document needs to mean anything (some Content, a resolvable Provenance chain per Evidence & Provenance Model §9) — before any time is spent cleaning or analyzing something that's fundamentally broken or empty. Validation is a gate, not a correction: it decides whether a document is fit to continue, it does not fix it.

---

## 6. Cleaning

**Business meaning:** Cleaning removes presentation-level noise from a Canonical Document's Content without changing what it actually says.

- **Remove technical noise** — stripping formatting artifacts, boilerplate, navigation text, ads, or other non-substantive content that isn't part of the document's real message (the same Cleaning concept Platform Architecture §10 already named, given fuller business treatment here).
- **Normalize whitespace** — standardizing spacing, line breaks, and formatting inconsistencies that don't carry meaning, so every later stage sees a consistent presentation.
- **Preserve original meaning** — the overriding constraint on everything Cleaning does. It may change how a document looks; it must never change what it actually says (Design Principle 4).

---

## 7. Language Detection

**Business meaning only.** Language Detection determines which language a Canonical Document's Content is written in. This is a discovered fact recorded on the document (Canonical Data Model §3's Language field) — never something the Collector or Source dictates.

Because this platform's market spans multiple languages (Vietnamese, English, and likely Chinese among others — Taxonomy & Ontology §9), Language Detection must be able to recognize and correctly tag documents in any of them, and must not assume a single default language platform-wide. Whether a single document can carry more than one detected language is not settled here (§12 Open Question #2 — this echoes Taxonomy & Ontology's own unresolved Open Question #2 on the same point).

---

## 8. Normalization

**Business meaning only — do not redefine Canonical Document.** This Pipeline's Normalization standardizes a document's content *presentation* — consistent casing, consistent punctuation/spacing conventions, consistent representation of the same underlying terminology — entirely within the Canonical Document's existing Content field. It never changes the Canonical Document's fields, shape, or identity, all of which remain exactly as fixed by Canonical Data Model §3.

**Naming note:** this is a different concept from Collector Framework §4's Normalization, which transforms Raw Data into a Canonical Document's *structure* in the first place. This Pipeline's Normalization instead refines a Canonical Document's content *presentation* after that structure already exists. Flagged explicitly here to avoid confusion between the two — the same kind of naming echo already flagged elsewhere in this platform (Package 1's "Jade Intelligence," Package 1.6's "Knowledge") — see §12 Open Question #7.

---

## 9. Duplicate Detection

**Business meaning only — no algorithm, no similarity threshold.** Duplicate Detection recognizes when two or more Canonical Documents likely represent substantially the same underlying content — restating the business rule already established in Canonical Data Model §7's Identity Rules and named in Platform Architecture §10 — for example, a document cross-posted to multiple Facebook groups, or the same RSS item appearing on two different feeds.

This Pipeline's Duplicate Detection **recognizes and flags** such likely duplicates as part of getting a document AI-ready. It does **not** decide what to do about a flagged duplicate (merge, discard, keep both) — that determination, if it happens at all, belongs to a later stage or to the Knowledge Store, never to Preprocessing (Design Principle 6, §12 Open Question #4).

---

## 10. AI-ready Document

**Business meaning:** the result of a Canonical Document successfully passing through Validation, Cleaning, Language Detection, Normalization, and Duplicate Detection — a document whose presentation is clean and consistent, whose language is known, and whose duplicate status (if any) has been flagged. It is ready to be handed to the Understanding phase of the AI Processing Layer (Platform Architecture §10's remaining stages: Translation, Summarization, Topic Extraction, Entity Extraction, Trend Detection, Market Signals).

An AI-ready Document is still, in every structural sense, the same Canonical Document it started as (Design Principle 5) — "AI-ready" describes its *state*, not a new kind of object.

---

## 11. Out of Scope

- **Entity Recognition** — Understanding-phase, not Preprocessing.
- **Classification** — Understanding-phase, not Preprocessing.
- **Topic Detection** — Understanding-phase, not Preprocessing.
- **Sentiment** — Understanding-phase, not Preprocessing.
- **Summarization** — Understanding-phase, not Preprocessing.
- **Knowledge Creation** — never Preprocessing's job, anywhere (Design Principle 1).
- **Translation** — remains the later, optional AI Processing Layer step Platform Architecture §10 already defined; not part of this mandatory Preprocessing sequence.
- **Trend Detection and Market Signals** (Platform Architecture §10) — Understanding-phase, not Preprocessing.
- Any AI model, algorithm, or similarity threshold selection (§9).
- Any SQL, database schema, or code.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, or `docs/RAW_DATA_STORAGE.md` — all seven referenced only, none modified.
- Any CRM code, schema, or module change.

---

## 12. Open Questions

1. **Validation failure handling.** If a Canonical Document fails Validation (§5), what happens to it — rejected outright, held for review, or sent back to Collector Framework for re-normalization? Not decided.
2. **Multi-language documents.** Does Language Detection (§7) ever tag more than one Language on a single document? Not decided — echoes Taxonomy & Ontology's own unresolved Open Question #2.
3. **Duplicate Detection scope.** Does Duplicate Detection (§9) compare a new document only against recently-processed documents, or against the platform's entire historical set? Not decided — a real question given Platform Architecture §13's scalability concerns.
4. **Duplicate flag consumer.** §9 states this Pipeline flags likely duplicates but doesn't resolve them — which later stage or component is expected to actually read and act on that flag? Not decided.
5. **Partial Preprocessing completion.** If a document fails partway through the Pipeline (e.g. Cleaning succeeds but Language Detection can't determine a language), does it still become an AI-ready Document in a degraded state, or does it stop short entirely? Not decided — mirrors Collector Framework §8's Partial Collection concept, but for this Pipeline.
6. **Re-preprocessing.** If Cleaning/Normalization logic changes later, does a previously AI-ready Document get reprocessed? Not decided — the same open question already raised for Collector normalization (Collector Framework Open Question #7) and Canonical Document creation (Raw Data Storage Open Question #2).
7. **Naming overlap with Collector Framework's Normalization.** §8 flags that this Pipeline's Normalization and Collector Framework §4's Normalization are different concepts sharing one name. Should one be renamed to avoid confusion, given this platform already carries other naming echoes ("Jade Intelligence," "Knowledge")? Not decided, flagged for Product Owner awareness.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
