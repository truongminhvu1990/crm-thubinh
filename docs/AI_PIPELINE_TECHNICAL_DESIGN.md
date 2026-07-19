# Jade Intelligence Platform — AI Pipeline (Technical Design)

**Package:** T5 — Technical Design, AI Pipeline
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Technical Design only. Interfaces and contracts only — no implementation, no working code, no chosen programming language, no chosen library/framework, no algorithm bodies, **no AI model or vendor selection**. Signatures below are language-agnostic pseudocode used only to state a contract's shape (names, inputs, outputs) — not source code, the same convention Collector SDK (T3) established.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (1), `docs/CANONICAL_DATA_MODEL.md` (1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (1.7), `docs/COLLECTOR_FRAMEWORK.md` (2), `docs/SOURCE_REGISTRY.md` (3), `docs/RAW_DATA_STORAGE.md` (4), `docs/PREPROCESSING_PIPELINE.md` (5A), `docs/UNDERSTANDING_PIPELINE.md` (5B), `docs/REASONING_PIPELINE.md` (5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (5D), `docs/KNOWLEDGE_GRAPH.md` (6), `docs/KNOWLEDGE_STORE.md` (7), `docs/CRM_INTEGRATION.md` (8), `docs/MONITORING.md` (9), `docs/DEPLOYMENT.md` (10). None of the sixteen is modified by this document.

**Based on — Technical Design:**
- **"System Architecture (T1)" does not exist anywhere in this repository.** Same gap Database Design (T2) and Collector SDK (T3) both already flagged in their own headers. Per their established precedent — an `AskUserQuestion` was tried once for this exact class of gap during T2 and declined — this document does not re-block on it a second time. It proceeds grounded in the 16 Business Design documents plus T2 and T3 below. Carried forward as Open Question #1.
- **`docs/DATABASE_DESIGN.md` (Package T2) — exists, treated as LOCKED** (header stays "Draft," unedited, same convention). This document's four Engines are grounded directly in T2 §1.5's record types — no new persisted object is invented where T2 already defines one, and where T2 explicitly decided *not* to persist something (§1.2 there: Structured Understanding and Reasoning Output are hand-offs, not durable tables), that decision is honored here rather than silently re-opened.
- **`docs/COLLECTOR_SDK.md` (Package T3, Revision 2) — exists, treated as LOCKED.** This Engine chain's actual upstream input is T3 §1.2's `normalize()` return value — a `CanonicalDocument` matching T2 §1.5's shape exactly. The Preprocessing Engine (§1.1) is the direct technical consumer of Collector SDK's Hand-off step (T3 §1.3, step 5).
- **Package T4 was not named in this task and no file matching it exists.** Same treatment as the T1 gap above: flagged, not blocking (Open Question #1). This document does not assume or guess T4's subject.

---

## 1. AI Pipeline Technical Design

### 1.1 Preprocessing Engine

Technical realization of the Preprocessing Pipeline (5A): Validation → Cleaning → Language Detection → Normalization → Duplicate Detection, matching 5A §4 exactly.

```
PreprocessingEngine
  process(document: CanonicalDocument) -> CanonicalDocument | ValidationFailure
```

- **Input.** Exactly one `CanonicalDocument`, matching T2 §1.5's record shape — the same object T3 §1.2's `normalize()` produces and T3 §1.3 step 5 hands off. This Engine never receives a Raw Data Item directly (5A Design Principle 3).
- **Internal sequence.** `Validate → Clean → DetectLanguage → Normalize(content) → DetectDuplicate`, run in order, matching 5A §4. `Validate` is a hard gate: a `ValidationFailure` return stops the sequence before `Clean` runs (§1.7).
- **Statelessness.** `Clean`, `DetectLanguage`, and content-level `Normalize` are stateless per invocation. `DetectDuplicate` is the one exception — it necessarily compares the incoming document against previously-processed ones, so it depends on a lookup the Engine itself does not own the storage of (Open Question #2).
- **Output identity.** `process()` returns the **same** `CanonicalDocument` it received, never a new object (5A Design Principle 5) — "AI-ready" is a state, not a new record type.
- **A genuine gap with T2, flagged not resolved:** Canonical Data Model §4's `lifecycle_status` values (Collected / Normalized / AI Processed / Knowledge Created / Archived, as persisted in T2 §1.5's Canonical Document record) have no value distinguishing "has passed this Engine" from "has not yet started AI Processing at all" — `Normalized` already means "Collector produced a Canonical Document" (T3's `normalize()`), and `AI Processed` is the *next* value after this whole Engine chain finishes. Whether Preprocessing completing needs its own persisted checkpoint, or is represented only in-flight between two existing `lifecycle_status` values, is not decided by T2 or by this document (Open Question #3).

---

### 1.2 Understanding Engine

Technical realization of the Understanding Pipeline (5B): Language Understanding → Entity Recognition → Relationship Extraction → Topic Detection → Classification → Sentiment Analysis → Summarization, matching 5B §4 exactly.

```
UnderstandingEngine
  process(document: CanonicalDocument) -> StructuredUnderstanding
```

- **Input.** The same `CanonicalDocument` the Preprocessing Engine returned (§1.1) — this Engine never re-reads Raw Data or re-runs Preprocessing's own stages (5B Design Principle 2).
- **Internal dependency.** `RecognizeEntities` runs before `ExtractRelationships`; if `RecognizeEntities` returns an empty set, `ExtractRelationships` is technically skipped (nothing to connect) while `DetectTopics`, `Classify`, `AnalyzeSentiment`, and `Summarize` all still run — none of them declares a dependency on Entity Recognition (5B §7, resolving 5B Open Question #3 at the technical level only).
- **Vocabulary binding.** `RecognizeEntities` and `ExtractRelationships` each read from the Taxonomy & Ontology Store (T2 §1.3) — specifically the `Entity Type`, `Entity Instance`, `Synonym`, and `Relationship Type` records (T2 §1.5) — as a fixed lookup, never as data this Engine writes to.
- **Output is a hand-off, not a table.** `StructuredUnderstanding` is **not** a T2 record type — T2 §1.2 explicitly excludes it from persistence ("a hand-off... not a business object anything downstream is designed to query independently"). This Engine's output exists only long enough to reach the Reasoning Engine's `LinkEvidence` step (§1.3), where its content becomes a persisted `Evidence` record.

---

### 1.3 Reasoning Engine

Technical realization of the Reasoning Pipeline (5C): Evidence Linking → Cross-document Analysis → Relationship Discovery → Trend Detection → Market Signal Detection → Risk Detection → Opportunity Detection, matching 5C §4 exactly. **This Engine technically splits into two phases with different units of work — a distinction the Business Design named only implicitly.**

```
ReasoningEngine
  linkEvidence(understanding: StructuredUnderstanding) -> Evidence
  analyze(workingSet: EvidenceSet) -> ReasoningOutput
```

- **Phase 1 — `linkEvidence`, per-document.** Evidence Linking (5C §5) is the one Reasoning stage that operates on a single Understanding Engine output at a time — technically, it is chainable immediately after the Understanding Engine, exactly like §1.1 → §1.2. Its output is a persisted `Evidence` record (T2 §1.5), the durable form of Structured Understanding's content — this is *how* Structured Understanding's hand-off (§1.2) becomes queryable at all, since T2 §1.2 does not persist Structured Understanding itself.
- **Phase 2 — `analyze`, cross-document.** Cross-document Analysis through Opportunity Detection (5C §6–11) all require an `EvidenceSet` — a working set spanning many `Evidence` records already sitting in T2's Evidence Store (T2 §1.3), not just the one `linkEvidence` just produced. This phase cannot start until enough Evidence has accumulated to be worth analyzing, so it cannot share Phase 1's per-document cadence (§1.6, Open Question #4).
- **Detection independence.** `DetectTrends`, `DetectMarketSignals`, `DetectRisks`, and `DetectOpportunities` are technically modeled as four independent reads over the same `EvidenceSet` — no stage's output feeds another by default (5C §14 Open Question #7 is not resolved, only given a technical starting position).
- **Output.** `ReasoningOutput` is, like `StructuredUnderstanding`, a hand-off — not a T2 record type (T2 §1.2). It exists only long enough to reach the Knowledge Generation Engine's Candidate step (§1.4).

---

### 1.4 Knowledge Generation Engine

Technical realization of the Knowledge Generation Pipeline (5D): Knowledge Candidate → Evidence Validation → Confidence Assignment → Conflict Review → Knowledge Creation → Knowledge Versioning → Knowledge Publication, matching 5D §4 exactly.

```
KnowledgeGenerationEngine
  propose(finding: ReasoningFinding) -> KnowledgeCandidate
  process(candidate: KnowledgeCandidate) -> Knowledge | HeldCandidate
```

- **Sole write authority.** This is the only Engine with write access to a `Knowledge` record (T2 §1.5) — restating 5D Design Principle 1 as a technical access boundary. Engines §1.1–1.3 are read/derive-only with respect to the Knowledge Store.
- **`KnowledgeCandidate` is not a new record type.** It is a `Knowledge` record (T2 §1.5) whose `lifecycle_status` is `Candidate` — the same field T2 §1.9 already uses to represent Knowledge Store's Candidate → Published → Updated → Superseded → Archived lifecycle. `propose()` is the technical fan-out point: one `ReasoningOutput` (§1.3) can yield zero, one, or many `KnowledgeCandidate`s, each then processed independently through `process()`.
- **`process()` internal sequence.** `ValidateEvidence → AssignConfidence → ReviewConflicts → Create/Version → Publish`, matching 5D §6–11. `ValidateEvidence` and `ReviewConflicts` are both hard gates (§1.7); `AssignConfidence` is a decision point with no formula defined here or upstream (5D §7, this document's own "no model selection" instruction).
- **Versioning enforcement.** `Create/Version` must check for an existing `Knowledge` record's identity before writing (via `previous_version_id`, T2 §1.5/§1.9) — a blind insert is never valid; every write either creates a new Knowledge item or a new version linked to its predecessor, which moves to `Superseded` (T2 §1.9). No `Knowledge` row is ever updated in place.
- **Publication is a separate call from Creation**, matching 5D §11 and T2 §1.9's "current is a query, not a stored flag" — `Publish` only ever changes `lifecycle_status` from `Candidate`/newly-`Created` to `Published`; it never performs the write itself.

---

### 1.5 Pipeline Contracts

Every boundary below crosses exactly one object already named by Business Design or T2 — no new object type is introduced here.

| Boundary | Object | Contract guarantee |
|---|---|---|
| Collector SDK (T3) → Preprocessing Engine | `CanonicalDocument` (T2 §1.5) | Structurally complete per T2 §1.5; matches T3 §1.2's `normalize()` output exactly. |
| Preprocessing Engine → Understanding Engine | `CanonicalDocument` (same identity, §1.1) | `language` populated; duplicate-flag present (possibly empty); Content unchanged in meaning (5A Design Principle 4). |
| Understanding Engine → Reasoning Engine (`linkEvidence`) | `StructuredUnderstanding` (hand-off only, not persisted — T2 §1.2) | Always traceable back to exactly one `CanonicalDocument.id`; consumed immediately, never queued indefinitely. |
| Reasoning Engine (`linkEvidence`) → Evidence Store | `Evidence` (T2 §1.5) | Carries `canonical_document_id`; this is the point Structured Understanding's content becomes durable and queryable. |
| Reasoning Engine (`analyze`) → Knowledge Generation Engine | `ReasoningOutput` / `ReasoningFinding` (hand-off only, not persisted — T2 §1.2) | Every finding carries at least one `evidence_id` reference (5C §5) — nothing evidence-less crosses this boundary. |
| Knowledge Generation Engine → Knowledge Store | `Knowledge` (T2 §1.5) | Only written after `ValidateEvidence`, `AssignConfidence`, and `ReviewConflicts` all complete (§1.4). |

**Rules applying to every boundary above:**

1. **One-directional only** — no downstream Engine writes back into an upstream object (Platform Architecture §6).
2. **Traceability is a contract condition.** An object failing Evidence & Provenance Model §9's Traceability Rules for its layer is a contract violation, not an incomplete result.
3. **Contracts are storage-shape-aware but technology-agnostic** — every object above reuses a T2 §1.5 shape by reference; no boundary requires either side to know which AI model or vendor produced or will consume it (SDK Principle 4 of T3, carried forward here).
4. **Contract changes need their own revision discipline** — an Engine on either side of a boundary is not assumed to update in lockstep with a contract change (Open Question #6).

---

### 1.6 Processing Sequence

Two sequencing regimes, driven by the unit-of-work split already named in §1.1–1.4:

**Per-document chain (Engines 1.1 → 1.2 → Reasoning Phase 1):**

```
CanonicalDocument (from Collector SDK T3, normalize() + Hand-off)
   → [Preprocessing Engine .process()]
   → CanonicalDocument (AI-ready)
   → [Understanding Engine .process()]
   → StructuredUnderstanding
   → [Reasoning Engine .linkEvidence()]
   → Evidence (persisted, T2 Evidence Store)
```

Every document that clears Preprocessing's `Validate` gate can flow through this entire chain without waiting on any other document — nothing here requires batching.

**Cross-document, triggered (Reasoning Phase 2 → Knowledge Generation):**

```
EvidenceSet (accumulated in T2 Evidence Store)
   → [Reasoning Engine .analyze()]   ← own trigger, not per-document
   → ReasoningOutput
   → [Knowledge Generation Engine .propose() then .process()]   ← per Candidate
   → Knowledge (Created → Versioned → Published)
```

`analyze()` cannot start the moment one new `Evidence` record appears — it needs a working set. What actually triggers a run (schedule, volume threshold, manual action) is not decided here (Open Question #4).

**Independence and scaling:**
- Preprocessing Engine and Understanding Engine scale horizontally per document, independently of each other and of Reasoning/Knowledge Generation (Platform Architecture §13; T2 §1.11's "write throughput matters most for the pipeline stages").
- Reasoning Engine's Phase 1 (`linkEvidence`) shares Understanding's per-document scaling profile; Phase 2 (`analyze`) does not — it scales with `EvidenceSet` size, not document arrival rate.
- Knowledge Generation Engine processes Candidates independently except where two Candidates could version the same existing `Knowledge` item — a coordination question this document does not resolve (Open Question #5).

---

### 1.7 Error Handling

**Cross-cutting principle.** No Engine failure silently corrupts or drops the object it received — an object either completes an Engine's full internal sequence, or its failure is surfaced with enough information to retry or route it for review.

- **Preprocessing Engine.** A `ValidationFailure` (§1.1) is a hard gate — the document does not proceed to `Clean`, and the Engine returns `ValidationFailure` rather than retrying indefinitely on its own (extends 5A Open Question #1, without resolving what happens to a rejected document next). A failure partway through the remaining stages (e.g. `Clean` succeeds but `DetectLanguage` cannot determine a language) is technically treated as a degraded-state `CanonicalDocument`, not a hard failure — it still proceeds to the Understanding Engine by default (extends 5A Open Question #5).
- **Understanding Engine.** When `RecognizeEntities` returns empty, only `ExtractRelationships` is skipped (§1.2); every other stage still runs, so `StructuredUnderstanding` is not automatically empty.
- **Reasoning Engine.** In Phase 1, a `linkEvidence` failure for one document does not block any other document's Evidence Linking (each call is independent, mirroring T3 §1.3's item-level isolation). In Phase 2, one malformed or missing `Evidence` record inside the working set does not fail the whole `analyze()` run — the Engine excludes it and proceeds, logging the exclusion; a failure to assemble the `EvidenceSet` at all blocks that run's `ReasoningOutput` entirely — no partial output is produced from an unassembled working set.
- **Knowledge Generation Engine.** A `ValidateEvidence` failure halts that Candidate before `AssignConfidence` (mirrors 5D §6). A `ReviewConflicts` finding is never auto-resolved (5D Design Principle 5) — the technical default is `HeldCandidate`, never an automatic Create or discard (5D Open Question #1's ultimate resolution stays open; only "held, not auto-decided" is fixed here). Because this Engine is the platform's sole writer (§1.4), a failure during `Create/Version` itself must never leave a `Knowledge` row partially written — the write either fully completes as a valid new version, or the Candidate remains un-promoted.
- **Retries.** Conceptually safe at the Preprocessing and Understanding boundaries (stateless, single-document). Retry safety for Reasoning's `analyze()` (working-set-scoped) and Knowledge Generation's `process()` (the platform's only writer) is not established here (Open Question #7). No retry count, backoff strategy, or dead-letter mechanism is chosen — implementation decisions.

---

## 2. Open Questions

1. **System Architecture (T1) and Package T4 do not exist.** T1 was already flagged as missing by Database Design (T2) and Collector SDK (T3); this task additionally jumps from T3 directly to T5, and no file matching a "T4" package exists either. Both gaps are carried forward, not blocking, per the established precedent (§header). If either is produced later, this document should be checked against it for consistency.
2. **Duplicate Detection's lookup dependency.** §1.1's `DetectDuplicate` step needs to compare against previously-processed documents — what it looks up against (recent documents only, or the full Canonical Document Store) and via which T2 index (T2 §1.7 already names `Canonical Document — by hash` as a candidate) is not decided here.
3. **Missing lifecycle checkpoint between Preprocessing and Understanding.** §1.1 flags that T2 §1.5's `lifecycle_status` enum has no value distinguishing "Preprocessing complete" from "not yet AI Processed at all." Does this need a new `lifecycle_status` value (a T2 schema change) or does the platform accept that this state is never durably observable? Not decided.
4. **Reasoning Engine `analyze()` trigger.** What starts a Phase 2 run — a fixed schedule, an `Evidence` volume threshold, or a manual action? Not decided (§1.6).
5. **Knowledge Candidate concurrency.** When two `KnowledgeCandidate`s could both version the same existing `Knowledge` item, how does the Knowledge Generation Engine coordinate between them? Not decided (§1.6).
6. **Contract versioning process.** §1.5 states a Pipeline Contract's shape must be able to evolve without silently breaking the Engine on the other side, but does not define how a contract change is proposed, reviewed, or rolled out across independently-deployed Engines. Not decided.
7. **Retry safety for `analyze()` and `process()`.** Preprocessing and Understanding are safe to retry as stateless, single-document work; whether Reasoning's cross-document `analyze()` and Knowledge Generation's write-performing `process()` can be retried without duplicate effects (e.g. duplicate `Evidence` reads, duplicate `Knowledge` versions) is not decided (§1.7).
8. **Engine deployment granularity.** Is each Engine one deployable unit, or can an individual stage within one (e.g. `DetectDuplicate` alone, inside Preprocessing) be scaled or deployed independently of the rest of its own Engine? Relevant to T2 §1.11's "each storage layer scales independently" carried up to the Engine level. Not decided.
9. **Orchestration technology.** As with T2 and T3, no specific tool, queue, scheduler, or infrastructure choice is made anywhere in §1.6's sequencing or §1.1–1.4's method invocation — that remains a future implementation decision.

---

Technical Design only. No AI model or vendor selected. No database schema changed. No code written. No CRM code, schema, or module touched. No change to any of the eighteen referenced documents (16 Business Design + T2 + T3). Stopping — waiting for Product Owner Review.
