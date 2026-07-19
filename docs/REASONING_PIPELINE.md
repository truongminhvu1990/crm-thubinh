# Jade Intelligence Platform — Reasoning Pipeline

**Package:** 5C — Reasoning Pipeline
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no AI model selection, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4), `docs/PREPROCESSING_PIPELINE.md` (Package 5A), `docs/UNDERSTANDING_PIPELINE.md` (Package 5B) — all nine treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the nine is modified by this document. This document elaborates the Trend Detection and Market Signals concepts Platform Architecture §10 originally named, now as their own Pipeline — **Reasoning still does not create Knowledge records; that is Package 5D's (Knowledge Generation Pipeline) exclusive responsibility, not designed here.**

---

## 1. Vision

Structured Understanding (Understanding Pipeline §12) tells the platform what a single document says. Reasoning is where the platform starts connecting documents to each other — linking Structured Understanding to Evidence, analyzing patterns across many documents at once, discovering relationships, and detecting Trends, Market Signals, Risks, and Opportunities. Reasoning is the platform's first stage that looks *across* documents rather than at one at a time. But Reasoning still stops short of the final step: it produces a **Reasoning Output**, never a Knowledge record — turning Reasoning's findings into actual, stored Knowledge belongs to Package 5D.

---

## 2. Design Principles

1. **Reasoning discovers, it does not record.** Reasoning finds patterns, relationships, and signals across Structured Understanding and Evidence, but does **not** create Knowledge records — that remains Package 5D's exclusive responsibility.
2. **Reasoning is where the platform first looks across documents, not just at one.** Preprocessing and Understanding are both scoped to one document at a time; Reasoning's defining trait is drawing on many Structured Understanding results and many pieces of Evidence at once (§6).
3. **Every finding must be Evidence-linked.** Nothing Reasoning discovers is presented as a bare pattern — it is always connected back to the specific Evidence (Evidence & Provenance Model §3) that supports it, starting from the very first stage (Evidence Linking, §5).
4. **Reasoning respects the Ontology, it doesn't reinterpret it.** Relationship Discovery (§7) finds new instances of relationships the LOCKED Taxonomy & Ontology already defines — it never invents new relationship types, the same discipline Understanding Pipeline's Relationship Extraction already followed for single documents.
5. **Detection is not judgment.** Trend Detection, Market Signal Detection, Risk Detection, and Opportunity Detection (§8–11) each recognize and surface a pattern — none of them decides what the business should do about it.
6. **Reasoning hands off to Knowledge Generation; it doesn't generate Knowledge itself.** The finished Reasoning Output (§12) is delivered to the Knowledge Generation Pipeline (Package 5D, not designed here).
7. **Technology and algorithm-agnostic.** No AI model, algorithm, or technique is chosen anywhere in this document.

---

## 3. Pipeline Responsibilities

**In scope, business terms only:**
- Linking a document's Structured Understanding to the Evidence it's grounded in (Evidence Linking, §5).
- Analyzing patterns across multiple documents rather than just one (Cross-document Analysis, §6).
- Discovering new instances of Taxonomy & Ontology relationships across documents (Relationship Discovery, §7).
- Detecting Trends emerging across many documents over time (Trend Detection, §8).
- Detecting Market Signals worth surfacing to the business (Market Signal Detection, §9).
- Detecting Risk patterns (Risk Detection, §10).
- Detecting Opportunity patterns (Opportunity Detection, §11).
- Assembling all of the above into a Reasoning Output and handing it to the Knowledge Generation Pipeline (§12).

**Out of scope**, restated fully in §13 — most importantly: Creating Knowledge, Recommendations, CRM Actions, Automation, and Reporting are never Reasoning's job.

---

## 4. Pipeline Lifecycle

```
Structured Understanding
   ↓
Evidence Linking
   ↓
Cross-document Analysis
   ↓
Relationship Discovery
   ↓
Trend Detection
   ↓
Market Signal Detection
   ↓
Risk Detection
   ↓
Opportunity Detection
   ↓
Reasoning Output
```

Each stage's business meaning is detailed in its own section below (§5–§11); the finished result is described in §12.

---

## 5. Evidence Linking

**Uses the LOCKED Evidence & Provenance Model.** Evidence Linking takes a document's Structured Understanding (Understanding Pipeline §12) and connects its findings — recognized entities, relationships, topics, and so on — to formal Evidence items (`docs/EVIDENCE_AND_PROVENANCE_MODEL.md` §3). This turns "this document said X" into "there is now an Evidence item, with Provenance, saying X." Evidence Linking is the entry point where Reasoning starts building on the Evidence Chain (Evidence & Provenance Model §5: Raw Source → Canonical Document → Evidence → Knowledge) rather than working with an ungrounded document. Every later Reasoning stage (§6–11) works with Evidence-linked material, never raw Structured Understanding directly, so that everything Reasoning eventually surfaces stays traceable per Evidence & Provenance Model §9's Traceability Rules.

---

## 6. Cross-document Analysis

**Business meaning only.** Cross-document Analysis examines Evidence — and the Structured Understanding behind it — across many documents at once, not just one, to notice things a single document could never reveal on its own: the same Entity mentioned across a growing number of independent documents, or a pattern only visible when comparing documents collected over time. This is the defining shift from Understanding (always scoped to one document) to Reasoning (necessarily scoped to many).

---

## 7. Relationship Discovery

**Uses the LOCKED Taxonomy & Ontology. Business meaning only.** Relationship Discovery finds new instances of the Ontology's defined Relationships (`docs/TAXONOMY_AND_ONTOLOGY.md` §7) that only become visible when looking across multiple documents or Evidence items together — distinct from Understanding Pipeline §7's Relationship Extraction, which finds relationships expressed *within* a single document.

For example: Understanding might extract "this document says Supplier X sells Product Y" from one post. Relationship Discovery might instead notice, across many separate Evidence items, that "Mine A produces Material B" — even though no single document stated that connection outright; the connection only emerges from combining several pieces of Evidence. Like Understanding's Relationship Extraction, this stage never invents a new Relationship type — it only recognizes new instances of relationship types the Ontology already defines.

---

## 8. Trend Detection

**Business meaning only.** Trend Detection recognizes a pattern emerging across many Evidence items over time — the full business elaboration of the Trend Detection concept Platform Architecture §10 originally named, producing instances of the **Trend** Entity Type Taxonomy & Ontology §4 already defined. A Trend detected here is a *finding*, not yet a stored Knowledge record — turning it into one is Package 5D's job.

---

## 9. Market Signal Detection

**Business meaning only.** Market Signal Detection recognizes when a Trend, or a sufficiently notable cluster of Evidence, rises to the level of a concrete, business-facing signal worth surfacing — the full elaboration of Platform Architecture §10's Market Signals concept. Like Trend Detection, a detected Market Signal here is a finding Reasoning surfaces, not yet a stored Knowledge record.

---

## 10. Risk Detection

**Business meaning only.** Risk Detection recognizes patterns in Evidence that suggest a market-relevant Risk (Taxonomy & Ontology §4's **Risk** Entity Type — supply risk, authenticity risk, regulatory risk) associated with an Origin, Mine, Supplier, or Material. Risk Detection surfaces the pattern; it does not judge how severe the risk is or what the business should do about it (Design Principle 5).

---

## 11. Opportunity Detection

**Business meaning only.** Opportunity Detection recognizes patterns in Evidence that suggest a favorable market condition or opening worth the business's attention — the positive-signal counterpart to Risk Detection (§10).

**Flag:** neither Taxonomy & Ontology's Entity Types (Package 1.6) nor Platform Architecture §10 named an "Opportunity" concept before this task. It is introduced here for the first time. Worth reconciling with Taxonomy & Ontology in a future revision, the same way Risk is already a formal Entity Type there (§14 Open Question #1).

---

## 12. Reasoning Output

**Business meaning of the output delivered to the Knowledge Generation Pipeline.** Reasoning Output is the combined result of Evidence Linking, Cross-document Analysis, Relationship Discovery, and the four Detection stages (§8–11): a structured collection of discovered relationships, Trends, Market Signals, Risks, and Opportunities — each still connected back through Evidence Linking (§5) to its supporting Evidence and, transitively, to the full Evidence Chain (Evidence & Provenance Model §5).

Reasoning Output is handed to the **Knowledge Generation Pipeline** (Package 5D, not designed here). Reasoning Output is not itself a Knowledge record — it is the fully-reasoned-about material Knowledge Generation will eventually turn into one.

---

## 13. Out of Scope

- **Creating Knowledge** — never this Pipeline's job, anywhere (Design Principle 1); belongs entirely to Package 5D.
- **Recommendations** — a Knowledge-Generation-or-later concern, not Reasoning's.
- **CRM Actions** — no write, no action, no integration with the CRM happens here (consistent with every prior package's independence from the CRM).
- **Automation** — Reasoning surfaces findings; it does not trigger any automated business process.
- **Reporting** — presenting Reasoning's (or later, Knowledge's) findings to a person is out of scope here.
- Any AI model, algorithm, or technique selection.
- Any SQL, database schema, or code.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, or `docs/UNDERSTANDING_PIPELINE.md` — all nine referenced only, none modified.
- Any CRM code, schema, or module change.
- Designing the Knowledge Generation Pipeline (Package 5D) itself — named here only as Reasoning Output's recipient, not designed.
- **Confidence Scoring** — already flagged as out of scope in Understanding Pipeline §13; this document doesn't resolve it either. Confidence remains a business concept named in Evidence & Provenance Model §7 without a formula, and this Pipeline doesn't decide where in the Reasoning → Knowledge Generation boundary it gets applied (§14 Open Question #2).

---

## 14. Open Questions

1. **"Opportunity" as a new concept.** Neither Taxonomy & Ontology's Entity Types nor Platform Architecture §10 named "Opportunity" before this task (§11). Should it be added as a formal Entity Type in a future Taxonomy & Ontology revision, the way Risk already is one, or does it stay a Reasoning-Pipeline-only concept? Not decided.
2. **Where does Confidence Scoring actually happen?** Evidence & Provenance Model §7 named Confidence as a concept with no formula; Understanding Pipeline §13 listed Confidence Scoring as out of scope there too. Does it belong inside Reasoning (e.g. as part of each Detection stage, §8–11), or inside the future Knowledge Generation Pipeline (5D)? Not decided.
3. **Cross-document Analysis scope/scale.** Does Cross-document Analysis (§6) run across the platform's entire historical Evidence set every time, or some bounded/recent window? Not decided — echoes Preprocessing Pipeline's own Open Question #3 about Duplicate Detection scope, and ties to Platform Architecture §13's scalability concerns.
4. **Relationship Discovery reliability.** When Relationship Discovery (§7) infers a connection across multiple Evidence items that no single document stated outright, how reliable is that inference expected to be, relative to a relationship Understanding's Relationship Extraction found stated directly in one document? Not decided.
5. **Conflicting Reasoning findings.** If Cross-document Analysis or Relationship Discovery draws on Evidence items that conflict with each other (Evidence & Provenance Model §8's Conflicting Evidence), does Reasoning surface a correspondingly flagged/conflicted finding, or does it require non-conflicting Evidence to produce a finding at all? Not decided.
6. **Reasoning re-run scope.** Consistent with the same versioning/re-processing questions raised in every prior pipeline package — if new Evidence arrives that's relevant to an already-detected Trend/Signal/Risk/Opportunity, does Reasoning update the existing finding, or only generate new findings going forward? Not decided.
7. **Detection stage ordering/independence.** §4 lists Trend Detection, Market Signal Detection, Risk Detection, and Opportunity Detection as a sequence — are they actually independent analyses that could run in any order or in parallel, or does a later Detection stage depend on an earlier one's findings (the way Relationship Extraction depended on Entity Recognition in Understanding Pipeline §7)? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
