# Jade Intelligence Platform — Understanding Pipeline

**Package:** 5B — Understanding Pipeline
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no AI model selection, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4), `docs/PREPROCESSING_PIPELINE.md` (Package 5A) — all eight treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the eight is modified by this document. This document elaborates the remaining Understanding-producing portion of Platform Architecture §10's AI Processing Layer (Summarization, Topic Extraction, Entity Extraction), plus new stages this package introduces (Language Understanding, Relationship Extraction, Classification, Sentiment Analysis) — Trend Detection and Market Signals (also named in Platform Architecture §10) belong to a further, not-yet-designed **Reasoning Pipeline** (§12, §13).

---

## 1. Vision

Once a Canonical Document has been made AI-ready by the Preprocessing Pipeline (Package 5A), the Understanding Pipeline is what actually reads it and extracts structured meaning from it — what its content is really saying, what entities and relationships it mentions, what topic(s) and category it falls into, what tone it carries, and a concise summary of it. This is the platform's comprehension stage. Critically, Understanding stops short of drawing conclusions: it produces **Structured Understanding**, never Knowledge. Knowledge Generation, Trend Detection, and Market Signals belong to a later Reasoning Pipeline that consumes Understanding's output — not designed here.

---

## 2. Design Principles

1. **Understanding extracts, it never concludes.** The Understanding Pipeline extracts structured meaning from an AI-ready Document but does **not** generate Knowledge.
2. **Understanding consumes Preprocessing's output, never Raw Data or Canonical Documents directly.** It operates on the AI-ready Document (Preprocessing Pipeline §10) — it never reaches back to re-clean, re-validate, or re-normalize anything Preprocessing already did.
3. **Every stage's output is grounded in the platform's own shared vocabulary.** Entity Recognition (§6) and Relationship Extraction (§7) both draw exclusively from the LOCKED Taxonomy & Ontology (Package 1.6) — no entity type or relationship type is invented ad hoc by this Pipeline.
4. **Structured, not narrative, output.** This Pipeline's job is to produce structured, machine-usable facts about a document — entities found, relationships found, topics, category, sentiment, a summary — not prose interpretation or a conclusion about what any of it means for the business.
5. **Understanding hands off to Reasoning; it doesn't reason itself.** The finished Structured Understanding (§12) is delivered to a Reasoning Pipeline — a later, not-yet-designed package responsible for Trend Detection, Market Signals, Knowledge Generation, Recommendations, Confidence Scoring, and Decision Making (§13) — none of which happens here.
6. **Technology and algorithm-agnostic.** No AI model, algorithm, or technique is chosen anywhere in this document.

---

## 3. Pipeline Responsibilities

**In scope, business terms only:**
- Understanding what a document's content actually communicates at a language level (Language Understanding, §5).
- Recognizing which Taxonomy & Ontology Entity Types are mentioned in a document (Entity Recognition, §6).
- Recognizing which Taxonomy & Ontology Relationships connect entities within a document (Relationship Extraction, §7).
- Recognizing what subject(s) a document is about (Topic Detection, §8).
- Placing a document into the platform's Category structure (Classification, §9).
- Recognizing the tone expressed in a document (Sentiment Analysis, §10).
- Producing a concise summary of a document (Summarization, §11).
- Assembling all of the above into one Structured Understanding output and handing it to the Reasoning Pipeline (§12).

**Out of scope**, restated fully in §13 — most importantly: Trend Detection, Market Signals, Knowledge Generation, Recommendations, Confidence Scoring, and Decision Making are never this Pipeline's job.

---

## 4. Pipeline Lifecycle

```
AI-ready Document
   ↓
Language Understanding
   ↓
Entity Recognition
   ↓
Relationship Extraction
   ↓
Topic Detection
   ↓
Classification
   ↓
Sentiment Analysis
   ↓
Summarization
   ↓
Structured Understanding
```

Each stage's business meaning is detailed in its own section below (§5–§11); the finished result is described in §12.

---

## 5. Language Understanding

**Business meaning only.** Preprocessing's Language Detection (Preprocessing Pipeline §7) only identifies *which language* a document is written in. Language Understanding goes further — comprehending what the document's content actually communicates, in that language. This is the semantic groundwork every later Understanding stage (Entity Recognition, Relationship Extraction, Topic Detection, Classification, Sentiment Analysis, Summarization) depends on. Business-level distinction: Language Detection answers "what language is this"; Language Understanding answers "what is this actually saying."

---

## 6. Entity Recognition

**Business meaning only — uses the LOCKED Taxonomy & Ontology.** Entity Recognition identifies mentions of the platform's defined Entity Types (`docs/TAXONOMY_AND_ONTOLOGY.md` §4 — Product, Material, Origin, Mine, Supplier, Market, Color, Transparency, Texture, Species, Treatment, Certificate, Laboratory, Customer, Company, Country, Province, Auction, Price Event, Trend, Event, Risk, Knowledge) within a document's content. Where the content uses a Synonym rather than a canonical name (Taxonomy & Ontology §6 — e.g. "Táo xanh" for the Apple Green Color concept), Entity Recognition resolves it to the correct canonical concept.

Entity Recognition never invents a new Entity Type on the fly — anything a document mentions that doesn't fit an existing Entity Type is simply not tagged as one. Adding a genuinely new Entity Type is governed by Taxonomy & Ontology §10's Future Extension process, not by this Pipeline.

---

## 7. Relationship Extraction

**Business meaning only — uses the LOCKED Ontology.** Relationship Extraction identifies when a document's content expresses one of the platform's defined Relationships (`docs/TAXONOMY_AND_ONTOLOGY.md` §7 — e.g. Product *belongs to* Origin, Mine *produces* Material, Supplier *sells* Product, Trend *affects* Price) between two entities that Entity Recognition (§6) already found in that same document.

Relationship Extraction never invents a new Relationship type — it only recognizes instances of relationship types the Ontology already defines, and it depends directly on Entity Recognition's output (it never runs independently of it — see §14 Open Question #3 on what happens when Entity Recognition finds nothing).

---

## 8. Topic Detection

**Business meaning only.** Topic Detection identifies the subject(s) a document's content is about — the fuller business elaboration of the Topic Extraction concept Platform Architecture §10 already named. Topic Detection answers *"what is this document generally discussing,"* which may be broader or more informal than a specific Taxonomy Entity Type (§6) or a formal Category placement (§9).

---

## 9. Classification

**Business meaning only.** Classification places a document into the platform's Category structure (Taxonomy & Ontology §5, and §8's Product/Knowledge → Category hierarchy) — a more formal, structured placement than Topic Detection's (§8) general subject identification. Classification answers *"which specific Category does this belong to,"* using the same Category taxonomy Product and Knowledge entities are already classified into.

---

## 10. Sentiment Analysis

**Business meaning only.** Sentiment Analysis recognizes the tone or attitude expressed in a document's content — for example, whether market discussion about a Material, Supplier, or Trend reads as positive, negative, or neutral. This is a business signal about *how something is being talked about* — the Pipeline does not judge whether that sentiment is justified or accurate.

---

## 11. Summarization

**Business meaning only.** Summarization produces a concise, human-readable condensation of a document's content — directly fulfilling the "Summary (future)" field `docs/CANONICAL_DATA_MODEL.md` §3 named but explicitly deferred. This is the point in the platform where that deferred field is actually populated.

---

## 12. Structured Understanding

**Business meaning of the structured output delivered to the Reasoning Pipeline.** Structured Understanding is the combined result of every stage above (§5–§11) for one AI-ready Document: its understood meaning, its recognized Entities, its recognized Relationships, its Topic(s), its Classification, its Sentiment, and its Summary — assembled into one structured package and handed off to the **Reasoning Pipeline**, a later, not-yet-designed package named here only as the next recipient.

Structured Understanding is **not** Knowledge — it is the fully-understood, structured input that Knowledge Generation (a Reasoning Pipeline responsibility, §13) will eventually draw on, the same way an AI-ready Document was this Pipeline's own input.

---

## 13. Out of Scope

- **Trend Detection** — Reasoning-phase, not Understanding.
- **Market Signals** — Reasoning-phase, not Understanding.
- **Knowledge Generation** — never this Pipeline's job, anywhere (Design Principle 1).
- **Recommendations** — Reasoning-phase, not Understanding.
- **Confidence Scoring** — Reasoning-phase, not Understanding (also see Evidence & Provenance Model §7, which already named Confidence as a concept without an algorithm).
- **Decision Making** — Reasoning-phase, not Understanding.
- Any AI model, algorithm, or technique selection.
- Any SQL, database schema, or code.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, or `docs/PREPROCESSING_PIPELINE.md` — all eight referenced only, none modified.
- Any CRM code, schema, or module change.
- Designing the Reasoning Pipeline itself — named here only as Structured Understanding's recipient, not designed.
- **Translation** — flagged, not resolved (§14 Open Question #1): Platform Architecture §10 named Translation as an optional AI Processing Layer stage, but neither the Preprocessing Pipeline (5A) nor this Understanding Pipeline (5B) names a home for it.

---

## 14. Open Questions

1. **Where does Translation live?** Platform Architecture §10 named Translation as an optional AI Processing Layer stage, but it doesn't appear in either the Preprocessing Pipeline (5A) or this Understanding Pipeline (5B). Does it belong inside Language Understanding (§5), run as its own stage somewhere in this sequence, or is it a separate concern entirely? Not decided.
2. **Unmatched mentions.** If a document mentions something that doesn't cleanly match any Taxonomy & Ontology Entity Type or Relationship, is it simply left untagged, or is there a mechanism to flag it as a candidate for a future Taxonomy revision (Taxonomy & Ontology §10)? Not decided.
3. **Stage dependency failure.** Relationship Extraction (§7) explicitly depends on Entity Recognition's output — if Entity Recognition finds nothing in a document, do the remaining stages (Topic Detection, Classification, Sentiment Analysis, Summarization) still run, or does Structured Understanding end up genuinely empty for that document? Not decided.
4. **Topic Detection vs. Classification overlap.** §8 and §9 are related but distinct (general subject vs. formal Category placement) — could a document's Topic Detection and Classification results meaningfully disagree, and if so what does that mean? Not decided.
5. **Sentiment target.** Does Sentiment Analysis (§10) produce one sentiment for the whole document, or separate readings per Entity mentioned (e.g. positive about a Supplier, negative about a Trend, in the same document)? Not decided.
6. **Scope of one Structured Understanding.** Does Structured Understanding (§12) ever synthesize across multiple AI-ready Documents at once, or is it always scoped to exactly one document at a time? Not decided — relevant groundwork for how a future Reasoning Pipeline would ever detect a Trend across many documents.
7. **Re-understanding.** Consistent with the same versioning questions already raised in Collector Framework, Raw Data Storage, and Preprocessing Pipeline — if Entity Recognition, Classification, or another stage's logic changes later, does a document's existing Structured Understanding get regenerated, or does the updated logic only apply to newly-processed documents? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
