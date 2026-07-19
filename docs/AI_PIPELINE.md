# Jade Intelligence Platform — AI Pipeline (Technical Design)

**Package:** T5 — Technical Design, AI Pipeline
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Technical Design only. Contracts and pipeline shape only — no implementation, no working code, no chosen programming language, no chosen library/framework, no algorithm bodies, **no AI model or vendor selection**. Signatures below are language-agnostic pseudocode used only to state a contract's shape (names, inputs, outputs) — not source code, the same convention `docs/COLLECTOR_SDK.md` (T3) and `docs/CANONICAL_ENGINE.md` (T4) established.

**Supersedes an earlier, incomplete attempt at this package.** A prior session produced `docs/AI_PIPELINE_TECHNICAL_DESIGN.md` for this same Package T5 before `docs/CANONICAL_ENGINE.md` (T4) existed — it placed this Engine chain's upstream boundary one layer too early (directly at a Collector's `normalize()` output) and used a narrower 8-item structure. That file is left untouched (not a LOCKED document, so no rule requires preserving it, but nothing here requires deleting it either) — this document, at the path the Product Owner explicitly named, is the current draft of Package T5.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (1), `docs/CANONICAL_DATA_MODEL.md` (1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (1.7), `docs/COLLECTOR_FRAMEWORK.md` (2), `docs/SOURCE_REGISTRY.md` (3), `docs/RAW_DATA_STORAGE.md` (4), `docs/PREPROCESSING_PIPELINE.md` (5A), `docs/UNDERSTANDING_PIPELINE.md` (5B), `docs/REASONING_PIPELINE.md` (5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (5D), `docs/KNOWLEDGE_GRAPH.md` (6), `docs/KNOWLEDGE_STORE.md` (7), `docs/CRM_INTEGRATION.md` (8), `docs/MONITORING.md` (9), `docs/DEPLOYMENT.md` (10). None of the sixteen is modified by this document.

**Based on — Technical Design:**
- **System Architecture (T1) still does not exist anywhere in this repository.** Same gap `docs/DATABASE_DESIGN.md` (T2), `docs/COLLECTOR_SDK.md` (T3), and `docs/CANONICAL_ENGINE.md` (T4) already recorded in their own headers. Per the precedent all three established, this document does not re-block a fourth time. Carried forward as Open Question #1.
- **`docs/DATABASE_DESIGN.md` (Package T2) — LOCKED.** Not modified; every object referenced in this document (`CanonicalDocument`, `Evidence`, `Knowledge`, `Attachment`, `MetadataEntry`) reuses T2 §1.5's record shapes exactly.
- **`docs/COLLECTOR_SDK.md` (Package T3) — LOCKED.** Not modified; referenced for the Collector Lifecycle's Hand-off step (T3 §1.3, step 5) and the `FailureRecord` shape (T3 §1.7) this document's own Error Handling (§1.9) layers on top of.
- **`docs/CANONICAL_ENGINE.md` (Package T4) — LOCKED.** Not modified. **This corrects the prior draft's boundary placement:** the Preprocessing Engine's actual input (§1.2) is not a Collector's raw `normalize()` output — it is the **Hand-off-ready Canonical Document** T4 §8's Processing Pipeline produces, already Validated, Mapped, Metadata-attached, Attachment-attached, and Identity-Resolved, with `lifecycle_status` already set to `Normalized` (T4 §2). This document's Engine chain begins exactly where T4's own Processing Pipeline ends.

---

## 1. AI Pipeline

### 1.1 AI Pipeline Principles

Technical-level principles governing this document's four Engines specifically — additive to, not a replacement for, Platform Architecture §3's business-level Architecture Principles and each of 5A–5D's own Design Principles, and consistent in form with SDK Principles (T3 §1.1) and Engine Principles (T4 §1):

1. **One Engine chain, four Engines, one direction.** Preprocessing → Understanding → Reasoning → Knowledge Generation, matching 5A→5B→5C→5D exactly (Platform Architecture §6). No Engine is skipped, reordered, or reachable out of sequence.
2. **Each Engine enforces its Pipeline's already-locked business boundary; it does not reinterpret it.** Nothing in §1.2–1.5 adds, removes, or renames a business-level stage 5A–5D already defined — mirrors T4 Engine Principle 2 for this document's own scope.
3. **No AI-capable operation is bound to a technique anywhere in this document.** Every stage in §1.2–1.5 states *what* it produces, never *how* — no model, vendor, or algorithm (this task's own "no model selection" instruction). This differs from T3/T4's "no AI-capable operation at all" stance: Collectors and the Canonical Engine must never interpret content, but these four Engines are exactly where interpretation is supposed to happen — the constraint here is that the interpretive step is named as an open contract slot, never implemented or bound.
4. **Single-document Engines are stateless; cross-document Engines are not, and must say so explicitly.** Preprocessing and Understanding operate on one Canonical Document at a time; Reasoning's second phase and everything downstream of it operate on an accumulated set (§1.8) — this distinction is a first-class fact of this design, not an implementation detail deferred to later.
5. **Knowledge Generation is the platform's only writer of Knowledge.** Restates Knowledge Generation Pipeline Design Principle 1 as an access-control boundary — no other Engine in this chain, and no part of the Canonical Engine (T4), may ever write a `Knowledge` record (T2 §1.5).
6. **Every object crossing an Engine boundary must already satisfy its layer's Traceability Rules.** Evidence & Provenance Model §9, extended structurally to every Pipeline Contract (§1.6) — a contract violation, not merely an incomplete result, if it doesn't.
7. **One unit of work's failure never blocks another's.** The same "independent, isolated failure" principle T4 Engine Principle 6 and T3 §1.7 already established, carried forward here (§1.9).
8. **No storage technology, orchestration technology, or AI model/vendor is chosen anywhere in this document.** Consistent with Database Design §1.4, Collector SDK, and Canonical Engine's shared technology-agnostic stance.

---

### 1.2 Preprocessing Engine

Technical realization of the Preprocessing Pipeline (5A): Validation → Cleaning → Language Detection → Normalization → Duplicate Detection, matching 5A §4 exactly.

```
PreprocessingEngine
  process(document: CanonicalDocument) -> CanonicalDocument | ValidationFailure
```

- **Input.** The **Hand-off-ready** `CanonicalDocument` produced by the Canonical Engine's own Processing Pipeline (T4 §8) — already structurally Valid, Mapped, Metadata-attached, Attachment-attached, and Identity-Resolved, with `lifecycle_status = Normalized` (T4 §2). This Engine never receives a Collector's raw `normalize()` output directly, and never re-does any of T4's own work.
- **`Validate` is a different, later concern than T4's Validation Engine.** T4 §3 validates *structural contract conformance* (required fields present, correct types) before Hand-off. This Engine's `Validate` (5A §5) checks *readiness for AI processing* — Content present, a resolvable Provenance chain (Evidence & Provenance Model §9) — a distinct scope at a distinct layer, not a duplicate check.
- **Internal sequence.** `Validate → Clean → DetectLanguage → Normalize(content) → DetectDuplicate`, matching 5A §4. A `ValidationFailure` return stops the sequence before `Clean` runs (§1.9).
- **`DetectDuplicate` is the fuzzy complement to T4's exact Identity Resolution.** T4 §7's Identity Resolution already performs exact-match, structural duplicate/re-collection detection (same-Source re-collection, exact content hash match) *before* Hand-off. This Engine's `DetectDuplicate` (5A §9) is understood to catch what T4 §7 does not — near-duplicate, fuzzy matches (e.g. the same story paraphrased across two unrelated sites). T4 §11 Open Question #3 already flagged that this division was never explicitly confirmed by any Business Design document; this document does not resolve it either, only restates the same open boundary at this Engine's own doorstep (carried forward, §2 OQ#10).
- **Statelessness.** `Clean`, `DetectLanguage`, and content-level `Normalize` are stateless per invocation. `DetectDuplicate` depends on a lookup against previously-processed documents that this Engine does not own the storage of (§2 OQ#2).
- **Output identity.** `process()` returns the same `CanonicalDocument` it received (5A Design Principle 5) — "AI-ready" is a state, not a new record type.
- **Lifecycle checkpoint gap, still open.** T4 §2 already sets `lifecycle_status = Normalized` at Hand-off; Canonical Data Model §4's next value is `AI Processed`, which only applies once the *entire* Understanding stage (not just Preprocessing) has run. There remains no `lifecycle_status` value distinguishing "passed this Engine" from "not yet started AI Processing at all" (§2 OQ#3).

---

### 1.3 Understanding Engine

Technical realization of the Understanding Pipeline (5B): Language Understanding → Entity Recognition → Relationship Extraction → Topic Detection → Classification → Sentiment Analysis → Summarization, matching 5B §4 exactly.

```
UnderstandingEngine
  process(document: CanonicalDocument) -> StructuredUnderstanding
```

- **Input.** The same `CanonicalDocument` the Preprocessing Engine returned (§1.2) — this Engine never re-reads Raw Data or re-runs Preprocessing's or the Canonical Engine's own stages (5B Design Principle 2).
- **Internal dependency.** `RecognizeEntities` runs before `ExtractRelationships`; if `RecognizeEntities` returns an empty set, `ExtractRelationships` is technically skipped while `DetectTopics`, `Classify`, `AnalyzeSentiment`, and `Summarize` all still run — none of them declares a dependency on Entity Recognition (5B §7, resolving 5B Open Question #3 at the technical level only).
- **Vocabulary binding.** `RecognizeEntities` and `ExtractRelationships` each read from the Taxonomy & Ontology Store (T2 §1.3) — the `Entity Type`, `Entity Instance`, `Synonym`, and `Relationship Type` records (T2 §1.5) — as a fixed lookup, never as data this Engine writes to.
- **Output is a hand-off, not a table.** `StructuredUnderstanding` is not a T2 record type — T2 §1.2 explicitly excludes it from persistence. This Engine's output exists only long enough to reach the Reasoning Engine's `linkEvidence` step (§1.4).

---

### 1.4 Reasoning Engine

Technical realization of the Reasoning Pipeline (5C): Evidence Linking → Cross-document Analysis → Relationship Discovery → Trend Detection → Market Signal Detection → Risk Detection → Opportunity Detection, matching 5C §4 exactly. This Engine technically splits into two phases with different units of work.

```
ReasoningEngine
  linkEvidence(understanding: StructuredUnderstanding) -> Evidence
  analyze(workingSet: EvidenceSet) -> ReasoningOutput
```

- **Phase 1 — `linkEvidence`, per-document.** Evidence Linking (5C §5) operates on a single Understanding Engine output at a time — chainable immediately after the Understanding Engine, exactly like §1.2 → §1.3. Its output is a persisted `Evidence` record (T2 §1.5) — the durable form of Structured Understanding's content, since T2 never persists Structured Understanding itself.
- **Phase 2 — `analyze`, cross-document.** Cross-document Analysis through Opportunity Detection (5C §6–11) require an `EvidenceSet` spanning many already-persisted `Evidence` records (T2's Evidence Store, T2 §1.3), not just the one `linkEvidence` just produced. This phase needs its own trigger, separate from Phase 1's per-document cadence (§1.7).
- **Detection independence.** `DetectTrends`, `DetectMarketSignals`, `DetectRisks`, and `DetectOpportunities` are modeled as four independent reads over the same `EvidenceSet` — no stage's output feeds another by default (5C §14 Open Question #7 is not resolved, only given a technical starting position).
- **Output.** `ReasoningOutput` is, like `StructuredUnderstanding`, a hand-off, not a T2 record type (T2 §1.2) — it exists only long enough to reach the Knowledge Generation Engine's Candidate step (§1.5).

---

### 1.5 Knowledge Generation Engine

Technical realization of the Knowledge Generation Pipeline (5D): Knowledge Candidate → Evidence Validation → Confidence Assignment → Conflict Review → Knowledge Creation → Knowledge Versioning → Knowledge Publication, matching 5D §4 exactly.

```
KnowledgeGenerationEngine
  propose(finding: ReasoningFinding) -> KnowledgeCandidate
  process(candidate: KnowledgeCandidate) -> Knowledge | HeldCandidate
```

- **Sole write authority.** This is the only Engine — anywhere in the platform, including the Canonical Engine (T4) — with write access to a `Knowledge` record (T2 §1.5).
- **`KnowledgeCandidate` is not a new record type.** It is a `Knowledge` record (T2 §1.5) whose `lifecycle_status` is `Candidate` (T2 §1.9). `propose()` is the technical fan-out point: one `ReasoningOutput` (§1.4) can yield zero, one, or many `KnowledgeCandidate`s, each processed independently through `process()`.
- **`process()` internal sequence.** `ValidateEvidence → AssignConfidence → ReviewConflicts → Create/Version → Publish`, matching 5D §6–11. `ValidateEvidence` and `ReviewConflicts` are hard gates (§1.9); `AssignConfidence` is a decision point with no formula defined anywhere upstream or here (5D §7, this document's own "no model selection" instruction).
- **Versioning enforcement.** `Create/Version` must check for an existing `Knowledge` record's identity before writing (via `previous_version_id`, T2 §1.5/§1.9) — every write either creates a new Knowledge item or a new version linked to its predecessor, which moves to `Superseded`. No `Knowledge` row is ever updated in place.
- **Publication is a separate call from Creation** (5D §11; T2 §1.9's "current is a query, not a stored flag") — `Publish` only ever changes `lifecycle_status` to `Published`; it never performs the write itself.

---

### 1.6 Pipeline Contracts

Every boundary below crosses exactly one object already named by Business Design, T2, T3, or T4 — no new object type is introduced by this document.

| Boundary | Object | Contract guarantee |
|---|---|---|
| Canonical Engine (T4) → Preprocessing Engine | `CanonicalDocument` (T2 §1.5, T4 §2) | Matches T4 §2's Contract exactly; `lifecycle_status = Normalized`; already Validated/Mapped/Metadata-attached/Attachment-attached/Identity-Resolved. |
| Preprocessing Engine → Understanding Engine | `CanonicalDocument` (same identity, §1.2) | `language` populated; duplicate-flag present (possibly empty); Content unchanged in meaning (5A Design Principle 4). |
| Understanding Engine → Reasoning Engine (`linkEvidence`) | `StructuredUnderstanding` (hand-off only, not persisted — T2 §1.2) | Always traceable back to exactly one `CanonicalDocument.id`; consumed immediately, never queued indefinitely (§1.8). |
| Reasoning Engine (`linkEvidence`) → Evidence Store | `Evidence` (T2 §1.5) | Carries `canonical_document_id`; the point Structured Understanding's content becomes durable and queryable. |
| Reasoning Engine (`analyze`) → Knowledge Generation Engine | `ReasoningOutput` / `ReasoningFinding` (hand-off only, not persisted — T2 §1.2) | Every finding carries at least one `evidence_id` reference (5C §5) — nothing evidence-less crosses this boundary. |
| Knowledge Generation Engine → Knowledge Store | `Knowledge` (T2 §1.5) | Only written after `ValidateEvidence`, `AssignConfidence`, and `ReviewConflicts` all complete (§1.5). |

**Rules applying to every boundary above:**

1. **One-directional only** — no downstream Engine writes back into an upstream object (Platform Architecture §6).
2. **Traceability is a contract condition** (AI Pipeline Principle 6) — an object failing Evidence & Provenance Model §9's Traceability Rules for its layer is a contract violation, not an incomplete result.
3. **Contracts are storage-shape-aware but technology-agnostic** — every object above reuses a T2 §1.5 shape by reference (T3 SDK Principle 4 / T4 Engine Principle 2's own convention, carried forward); no boundary requires either side to know which AI model or vendor produced or will consume it.
4. **Contract changes need their own revision discipline** — an Engine on either side of a boundary is not assumed to update in lockstep with a contract change (§2 OQ#6).

---

### 1.7 Pipeline Orchestration

The technical mechanism that decides *when* each Engine in §1.2–1.5 actually runs — distinct from Pipeline State Management (§1.8), which covers *what* persists between those runs.

```
PipelineOrchestrator
  onCanonicalDocumentReady(document: CanonicalDocument) -> void
    // chains: Preprocessing Engine -> Understanding Engine -> Reasoning Engine.linkEvidence
  triggerReasoningAnalysis(trigger: ScheduleTrigger | ThresholdTrigger | ManualTrigger) -> ExecutionHandle
    // invokes Reasoning Engine.analyze() over the current EvidenceSet
  triggerKnowledgeGeneration(finding: ReasoningFinding) -> ExecutionHandle
    // invokes Knowledge Generation Engine.propose() then .process()
```

**Per-document chain (Engines 1.2 → 1.3 → Reasoning Phase 1):**

```
CanonicalDocument (Hand-off from Canonical Engine, T4 §8)
   → [Preprocessing Engine .process()]
   → CanonicalDocument (AI-ready)
   → [Understanding Engine .process()]
   → StructuredUnderstanding
   → [Reasoning Engine .linkEvidence()]
   → Evidence (persisted, T2 Evidence Store)
```

`onCanonicalDocumentReady` fires this entire chain for one document without waiting on any other — nothing here requires batching, mirroring how T3 §1.3's Collector Lifecycle already treats each `DiscoveredItem` independently.

**Cross-document, triggered (Reasoning Phase 2 → Knowledge Generation):**

```
EvidenceSet (accumulated in T2 Evidence Store)
   → [Reasoning Engine .analyze()]   ← triggerReasoningAnalysis(), own cadence
   → ReasoningOutput
   → [Knowledge Generation Engine .propose() then .process()]   ← triggerKnowledgeGeneration(), per Candidate
   → Knowledge (Created → Versioned → Published)
```

`triggerReasoningAnalysis()`'s actual trigger source (a `ScheduleTrigger`, a `ThresholdTrigger` on `Evidence` volume, or a `ManualTrigger`) is named as a contract slot, not chosen (§2 OQ#4) — mirrors T3 §1.5's Scheduler Interface leaving `scheduleParameters`/`eventType` similarly unresolved for Collectors.

**Independence and scaling:** Preprocessing and Understanding Engines scale horizontally per document, independently of Reasoning/Knowledge Generation (Platform Architecture §13; T2 §1.11). Reasoning's Phase 1 shares Understanding's per-document profile; Phase 2 scales with `EvidenceSet` size, not document arrival rate. Knowledge Generation processes Candidates independently except where two Candidates could version the same existing `Knowledge` item (§2 OQ#5).

---

### 1.8 Pipeline State Management

What state exists between one Engine call and the next, and where it actually lives.

- **Durable state — lives in T2's stores, survives any Engine restart:** the `CanonicalDocument` (Canonical Document Store), `Evidence` (Evidence Store), and `Knowledge` (Knowledge Store, including its full version chain) — all T2 §1.5 record types. Every Engine boundary in §1.6 that ends at one of these three objects is a durability checkpoint.
- **Ephemeral state — exists only in flight, never checkpointed:** `StructuredUnderstanding` (Understanding Engine's output) and `ReasoningOutput`/`ReasoningFinding` (Reasoning Engine Phase 2's output) — both explicitly excluded from persistence by T2 §1.2. If an Orchestrator invocation fails after the Understanding Engine returns but before `linkEvidence` converts that result into a persisted `Evidence` record, the `StructuredUnderstanding` is lost outright — recovering it means re-running the Understanding Engine against the same, still-durable `CanonicalDocument`, not resuming from a saved intermediate state. The same is true of `ReasoningOutput` before `propose()` runs. Whether the Orchestrator (§1.7) is expected to guarantee this kind of re-delivery automatically, or whether losing unconverted ephemeral output is an accepted risk, is not decided (§2 OQ#11).
- **`EvidenceSet` computation is not decided as incremental or recomputed.** Each `analyze()` run (§1.4 Phase 2) needs a working set of `Evidence` — whether that set is queried fresh from the Evidence Store on every run, or maintained as some cached/incremental state carried between runs, is not decided here (§2 OQ#12).
- **`ExecutionHandle` correlates state across Orchestration, Error Handling, and Testing** — the same correlating-reference concept T3 §1.5 already introduced for Collector executions, reused here at the Engine-chain level, without redefining its shape.
- **"Current" state for Knowledge is a query, not a flag** — restates T2 §1.9 unchanged: finding a Knowledge item's current Published version means finding the latest version in its chain whose status is Published, never a boolean the Knowledge Generation Engine maintains separately.

---

### 1.9 Error Handling

**Failure layering across the technical track so far.** A failure inside this document's Engine chain is the third layer in an already-established chain: T3 §1.7's `FailureRecord` covers Collector-level failure (Collection/Normalization/Unavailable Source); T4 §9's `CanonicalEngineFailure` covers Canonical Engine failure and is itself reported upward as a `NormalizationFailure` on T3's own `FailureRecord`; this section defines the next, later layer — failure inside Preprocessing, Understanding, Reasoning, or Knowledge Generation, all of which only ever run *after* a `CanonicalDocument` has already successfully cleared both prior layers.

**Cross-cutting principle.** No Engine failure silently corrupts or drops the object it received (AI Pipeline Principle 7) — an object either completes an Engine's full internal sequence, or its failure is surfaced with enough information to retry or route it for review.

- **Preprocessing Engine.** A `ValidationFailure` (§1.2) is a hard gate — the Engine returns `ValidationFailure` rather than retrying indefinitely on its own (extends 5A Open Question #1). A failure partway through the remaining stages (e.g. `Clean` succeeds but `DetectLanguage` cannot determine a language) is treated as a degraded-state `CanonicalDocument`, not a hard failure — it still proceeds to the Understanding Engine by default (extends 5A Open Question #5).
- **Understanding Engine.** When `RecognizeEntities` returns empty, only `ExtractRelationships` is skipped (§1.3); every other stage still runs.
- **Reasoning Engine.** In Phase 1, a `linkEvidence` failure for one document never blocks another document's Evidence Linking (item-level isolation, mirroring T3 §1.7). In Phase 2, one malformed or missing `Evidence` record inside the working set does not fail the whole `analyze()` run — the Engine excludes it and proceeds, logging the exclusion; a failure to assemble the `EvidenceSet` at all blocks that run's `ReasoningOutput` entirely.
- **Knowledge Generation Engine.** A `ValidateEvidence` failure halts that Candidate before `AssignConfidence` (mirrors 5D §6). A `ReviewConflicts` finding is never auto-resolved (5D Design Principle 5) — the technical default is `HeldCandidate`, never an automatic Create or discard. A failure during `Create/Version` itself must never leave a `Knowledge` row partially written.
- **Retries.** Conceptually safe at the Preprocessing and Understanding boundaries (stateless, single-document). Retry safety for Reasoning's `analyze()` (working-set-scoped) and Knowledge Generation's `process()` (the platform's only writer) is not established here (§2 OQ#7). No retry count, backoff strategy, or dead-letter mechanism is chosen.

---

### 1.10 Testing Strategy

Business/technical-level testing concepts only — no test framework, tool, or test code is named or written here, mirroring T3 §1.10 and T4 §10's own boundary.

- **Contract conformance, not live-pipeline testing.** Each Engine (§1.2–1.5) should be verifiable against its own contract using fixture inputs — a fixture `CanonicalDocument` for Preprocessing/Understanding, a fixture `StructuredUnderstanding` for `linkEvidence`, a fixture `EvidenceSet` for `analyze()`, a fixture `ReasoningFinding` for Knowledge Generation — never requiring a live Canonical Engine, Collector run, or Orchestrator.
- **Pipeline Contract conformance (§1.6) is the one guarantee every Engine's tests must prove**, regardless of which Engine produced the input — the same cross-cutting guarantee T3 §1.10 and T4 §10 already state one layer earlier in this same chain.
- **Stage-dependency behavior is directly testable.** Understanding Engine's `ExtractRelationships`-skipped-on-empty-`RecognizeEntities` behavior (§1.3) and Reasoning Engine's excluded-bad-item behavior (§1.9) are both concrete, fixture-provable branches.
- **Reasoning Engine's two phases are testable independently.** `linkEvidence()` needs only a fixture `StructuredUnderstanding`; `analyze()` needs only a fixture `EvidenceSet` — neither requires the other to have actually run first, consistent with §1.4's own phase split.
- **Knowledge Generation's gates are each independently testable.** Fixture `KnowledgeCandidate`s crafted to fail `ValidateEvidence`, to trigger `ReviewConflicts`, and to pass cleanly through to `Publish` should each be provable in isolation (§1.5, §1.9).
- **AI-technique correctness stays explicitly out of scope.** Since no model, vendor, or algorithm is chosen anywhere in this document (AI Pipeline Principle 3), there is nothing at that level to test yet — this Testing Strategy covers only the contracts and control flow defined here.

---

## 2. Open Questions

1. **System Architecture (T1) still does not exist.** Same gap Database Design (T2), Collector SDK (T3), and Canonical Engine (T4) already recorded — not re-blocked a fourth time; carried forward unchanged.
2. **Duplicate Detection's lookup dependency.** Preprocessing Engine's `DetectDuplicate` (§1.2) needs to compare against previously-processed documents — what it looks up against and via which mechanism is not decided.
3. **Missing lifecycle checkpoint.** T2's `lifecycle_status` enum has no value between `Normalized` (already set at T4's Hand-off) and `AI Processed` to represent "passed the Preprocessing Engine but not yet through Understanding." Not decided (§1.2).
4. **Reasoning Engine `analyze()` trigger.** What actually fires `triggerReasoningAnalysis()` — a schedule, an Evidence volume threshold, or a manual action? Not decided (§1.7).
5. **Knowledge Candidate concurrency.** When two `KnowledgeCandidate`s could both version the same existing `Knowledge` item, how does the Knowledge Generation Engine coordinate between them? Not decided (§1.7).
6. **Contract versioning process.** §1.6 states a Pipeline Contract's shape must evolve without silently breaking the Engine on the other side, but does not define how a contract change is proposed, reviewed, or rolled out across independently-deployed Engines. Not decided.
7. **Retry safety for `analyze()` and `process()`.** Whether Reasoning's cross-document `analyze()` and Knowledge Generation's write-performing `process()` can be safely retried without duplicate effects is not decided (§1.9).
8. **Engine deployment granularity.** Is each Engine one deployable unit, or can an individual stage within one be scaled or deployed independently of the rest of its own Engine? Not decided.
9. **Orchestration technology.** No specific tool, queue, scheduler, or infrastructure choice is made anywhere in §1.7's `PipelineOrchestrator` — that remains a future implementation decision, consistent with every prior package's stance.
10. **Identity Resolution (T4) vs. Preprocessing Engine's Duplicate Detection boundary.** §1.2 restates T4 §11 Open Question #3's still-unconfirmed division between T4's exact/structural Identity Resolution and this Engine's own fuzzy Duplicate Detection — not resolved here either.
11. **In-flight hand-off durability.** §1.8 flags that `StructuredUnderstanding` and `ReasoningOutput` are ephemeral by T2 §1.2's own design — if an Orchestrator invocation fails after one of these is produced but before it's converted into durable state, is re-derivation from the last durable checkpoint (the `CanonicalDocument` or `Evidence` record) automatic, or an accepted gap? Not decided.
12. **`EvidenceSet` computation model.** Recomputed fresh per `analyze()` run, or maintained incrementally between runs? Not decided (§1.8).

---

Technical Design only. No AI model or vendor selected. No database schema changed. No code written. No CRM code, schema, or module touched. No change to any of the twenty referenced documents (16 Business Design + T2 + T3 + T4). Stopping — waiting for Product Owner Review.
