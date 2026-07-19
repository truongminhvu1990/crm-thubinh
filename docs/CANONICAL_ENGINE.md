# Jade Intelligence Platform — Canonical Engine (Technical Design)

**Package:** T4 — Technical Design, Canonical Engine
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Technical Design only. Contracts and pipeline shape only — no implementation, no working code, no chosen programming language, no chosen library/framework, no algorithm bodies (hashing, matching, mapping-rule resolution). Signatures below are language-agnostic pseudocode used only to state a contract's shape (names, inputs, outputs) — not source code, same convention `docs/COLLECTOR_SDK.md` (T3) established.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (1), `docs/CANONICAL_DATA_MODEL.md` (1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (1.7), `docs/COLLECTOR_FRAMEWORK.md` (2), `docs/SOURCE_REGISTRY.md` (3), `docs/RAW_DATA_STORAGE.md` (4), `docs/PREPROCESSING_PIPELINE.md` (5A), `docs/UNDERSTANDING_PIPELINE.md` (5B), `docs/REASONING_PIPELINE.md` (5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (5D), `docs/KNOWLEDGE_GRAPH.md` (6), `docs/KNOWLEDGE_STORE.md` (7), `docs/CRM_INTEGRATION.md` (8), `docs/MONITORING.md` (9), `docs/DEPLOYMENT.md` (10). None of the sixteen is modified by this document.

**Based on — Technical Design:**
- **System Architecture (T1) still does not exist anywhere in this repository.** This is the same gap `docs/DATABASE_DESIGN.md` (T2) and `docs/COLLECTOR_SDK.md` (T3) already recorded, and — per the pattern both of those established — this document does not re-block a third time on the same question (an `AskUserQuestion` on the adjacent "no prior Technical Design package exists" framing was raised for this task and the Product Owner's follow-up instruction confirmed T1–T3 as the correct, intentional numbering without supplying T1's content). See Open Question #1.
- **`docs/DATABASE_DESIGN.md` (Package T2) — LOCKED per this task's instruction.** Not modified; referenced throughout, especially §1.5's **Canonical Document**, **Attachment**, and **Metadata Entry** record shapes, which this document's Canonical Document Contract (§2) reuses rather than redefines.
- **`docs/COLLECTOR_SDK.md` (Package T3) — LOCKED per this task's instruction.** Not modified; referenced throughout. T3 §1.2's `normalize()` method and §1.3's Collector Lifecycle step 4 ("validated by the SDK to match Database Design §1.5's Canonical Document record shape before proceeding") named this validation step but did not design it — **this document is that design.** The Canonical Engine is the shared, Collector-Type-blind component sitting at that exact point in the Lifecycle: it receives each Collector's `normalize()` output and is responsible for everything between that output and a Hand-off-ready Canonical Document (T3 §1.3 step 5). This boundary placement is a disclosed judgment call — T3 never named a "Canonical Engine" as a separate component, only said "the SDK validates" — flagged as Open Question #2.

---

## 1. Engine Principles

Technical-level principles governing the Canonical Engine's own contracts — additive to, not a replacement for, Canonical Data Model's business-level Design Principles (§2 there) and SDK Principles (T3 §1.1), which these restate at the engine level:

1. **One Engine, every Source Type.** The Canonical Engine is a single shared component invoked identically regardless of which Collector Type (Collector Framework §5) produced the candidate document — there is no per-Source-Type variant of Validation, Metadata handling, Attachment handling, or Identity Resolution logic, only per-Source-Type *configuration* (§4's Mapping Profiles).
2. **The Engine enforces the universal shape; it does not invent it.** Canonical Data Model §3 already defines the Canonical Document's fields and their business meaning. Nothing in this document adds, removes, or renames a field — the Engine's job is to verify and finish producing a document that already conforms to that shape (§2).
3. **No AI-capable operation exists anywhere in this Engine.** Consistent with Collector Framework Design Principle 2 and SDK Principle 3 — Validation, Mapping, Metadata, Attachment, and Identity Resolution are all structural/business-rule operations. None of them classify, summarize, translate, or extract meaning from Content. That is exclusively the AI Processing Layer's job (Preprocessing/Understanding/Reasoning/Knowledge Generation, Packages 5A–5D), which begins strictly after Hand-off (T3 §1.3 step 5).
4. **Normalization happens once, enforced here.** This restates Canonical Data Model Design Principle 3 as a structural guarantee: once a candidate document passes through this Engine and is hand-off-ready, no later stage re-normalizes it. Preprocessing Pipeline's own "Normalization" step (5A) is a **different, later, Content-presentation-level concept** (already flagged as a naming collision in Preprocessing Pipeline's own header) — this Engine's normalization work ends at Hand-off and never resumes.
5. **Every sub-engine is independently verifiable.** Validation (§3), Mapping (§4), Metadata (§5), Attachment (§6), and Identity Resolution (§7) must each be exercisable and testable on their own, without requiring a live Collector run or a running Scheduler/Registry (T3 §1.4–§1.5) — this is what §10's Testing Strategy is built on, mirroring SDK Principle 7.
6. **Failure in one candidate document never blocks another.** Inherits Collector Framework Design Principle 5's "independent, isolated failure" and T3 §1.7's propagation behavior directly — this Engine processes one candidate Canonical Document at a time, and one candidate's failure at any stage (§9) never affects any other candidate in the same execution.
7. **No storage technology, hashing algorithm, or matching algorithm is chosen here.** Consistent with Database Design §1.4 and every prior package's technology-agnostic stance — this document defines contracts and business rules, never implementation.

---

## 2. Canonical Document Contract

The authoritative technical shape every candidate document must conform to before it may proceed past this Engine. Reuses Database Design §1.5's **Canonical Document** record and T3 §1.2's `normalize()` return shape exactly — this section adds structural types only; it does not add, rename, or reinterpret any field's business meaning (Canonical Data Model §3 remains the source of truth for what each field *means*).

| Field | Structural Type | Required | Notes |
|---|---|---|---|
| **id** | Identifier | Yes (assigned by the Engine, §7) | Never reassigned once set (Canonical Data Model §7). |
| **raw_data_item_id** | Reference → Raw Data Item | Yes | Assumes one-to-one Raw Data Item → Canonical Document (Database Design §1.6, itself flagged unconfirmed — carried forward, §11 OQ). |
| **source_id** | Reference → Source | Yes | |
| **source_type** | Enum (open vocabulary) | Yes | Facebook, Website, RSS, PDF, CRM, Excel, API, Manual Import, Future (Collector Framework §5) — new values addable without a contract change (Engine Principle 1). |
| **collector_id** | Reference → Collector Instance | Yes | |
| **language** | Enum (open vocabulary) | No | Business Design leaves single-vs-multi-language per document undecided (Canonical Data Model §12 OQ#2) — modeled here as a single value pending that resolution. |
| **title** | String | No | May be blank for source types without a natural title. |
| **content** | Text | Yes | The substantive body content — always present (Canonical Data Model §3). |
| **summary** | Text | No, and never populated at this stage | Explicitly future — Understanding Pipeline §11's Summarization stage populates this **after** Hand-off, never the Canonical Engine. |
| **author** | String | No | |
| **published_time** | Timestamp | No | May be unknown for some source types (Canonical Data Model §3). |
| **collected_time** | Timestamp | Yes | Always known (Canonical Data Model §3). |
| **url** | String | No | |
| **hash** | String (fingerprint, algorithm not chosen) | Yes (computed by the Engine, §7) | Business concept only per Canonical Data Model §7 — no algorithm named here either. |
| **lifecycle_status** | Enum | Yes (Engine always sets this to `Normalized` on successful Hand-off) | Collected / Normalized / AI Processed / Knowledge Created / Archived (Canonical Data Model §4). |
| **attachments** | List<Reference → Attachment> | No (empty list if none) | Related records (§6), never embedded inline — mirrors Database Design §1.6's `CANONICAL_DOCUMENT ||--o{ ATTACHMENT`. |
| **metadata** | List<Reference → Metadata Entry> | No (empty list if none) | Related records (§5), never embedded inline — mirrors Database Design §1.6's `CANONICAL_DOCUMENT ||--o{ METADATA_ENTRY`. |

A document that does not conform to this table — a required field absent, or a value of the wrong structural type — is, by definition, what the Validation Engine (§3) rejects. No document is handed off in a partially-conformant state.

---

## 3. Validation Engine

```
ValidationEngine
  validate(candidateDocument) -> ValidationResult   // Valid | Invalid(violations)
```

- `validate()` checks a candidate document strictly against the Canonical Document Contract (§2): required-field presence, structural type conformance, and that `attachments`/`metadata` (if present) reference well-formed records (§5, §6) — nothing more.
- `ValidationResult.Invalid` carries a list of `ValidationViolation { field, rule, message }` — one entry per failed check, so a single candidate can fail on more than one field at once without the Engine stopping at the first violation found.
- **Explicitly out of scope for this Validation Engine:**
  - Content quality or cleanliness (casing, punctuation, terminology) — that is Preprocessing Pipeline's own, differently-named "Normalization" step (5A), which runs later and is a distinct concept (Engine Principle 4).
  - Taxonomy/Ontology tagging correctness — Canonical Data Model §12 OQ#7 leaves whether tagging happens at Normalization or strictly after still undecided; this Validation Engine performs no tagging and validates none, taking no position on that open question.
  - Duplicate or re-collection detection — that is Identity Resolution (§7), a distinct, later step in this same pipeline (§8).
  - Any judgment about whether Content is *true*, *relevant*, or *high-quality* — purely structural conformance, never a content-quality judgment.
- An `Invalid` result stops that candidate from proceeding to Mapping (§4) — it is a hard gate, not a warning. What happens to a rejected candidate afterward (retried, discarded, queued for manual review) is Error Handling's concern (§9), not Validation's.

---

## 4. Mapping Engine

```
MappingEngine
  getMappingProfile(sourceType) -> MappingProfile
  applyMapping(rawFields, mappingProfile) -> CanonicalFieldSet
```

A **Mapping Profile** is the shared, inspectable, per-Source-Type configuration that states how that Source Type's native raw fields resolve into the Canonical Document Contract's fields (§2) — the formal, technical counterpart to Canonical Data Model §10's five worked business examples, restated here as named profiles rather than prose:

| Mapping Profile | Source Type | Restates |
|---|---|---|
| Facebook Post Profile | Facebook | Canonical Data Model §10 row 1 |
| Website Article Profile | Website | Canonical Data Model §10 row 2 |
| RSS Item Profile | RSS | Canonical Data Model §10 row 3 |
| PDF Report Profile | PDF | Canonical Data Model §10 row 4 |
| CRM Record Profile | CRM | Canonical Data Model §10 row 5 |
| Future Profile | Excel, API, Manual Import, Future Sources | Not yet defined — Canonical Data Model §10 named only five worked examples; the remaining Source Types (Collector Framework §5) still need their own profiles before their Collector Types can be built. |

- **Relationship to the Collector Interface's `normalize()` (T3 §1.2):** a Collector Type implementation is expected to apply its own Source Type's Mapping Profile when it constructs its `normalize()` return value. The Mapping Engine is what *defines and holds* those profiles as shared, versioned configuration — not private logic each Collector Type re-derives on its own. This is the direct technical form of Canonical Data Model Design Principle 5 (Additive Extensibility): adding a new Source Type is, in the common case, adding a new Mapping Profile, not changing this Engine's own code.
- `applyMapping()` is stated here as a contract the Mapping Engine exposes; whether a Collector Type implementation calls it directly, or a Collector Type's own `normalize()` independently produces an equivalent result that this Engine only later checks against the profile, is not settled — see Open Question #7.
- Source-specific detail that does not map onto any Contract (§2) field never becomes a new field — it always routes to Metadata (§5), per Canonical Data Model §6 and Design Principle 5. The Mapping Profile is explicit about which native fields become which Contract fields and which become Metadata entries.
- No fuzzy or inferred mapping is performed — a Mapping Profile is a fixed, declared correspondence, not an AI-assisted guess (Engine Principle 3).

---

## 5. Metadata Engine

```
MetadataEngine
  attachMetadata(canonicalDocumentId, contributorCollectorId, metadataEntries) -> void
  getMetadata(canonicalDocumentId) -> List<MetadataEntry>
```

- A `MetadataEntry` is the same **Metadata Entry** record Database Design §1.5 already defines — a flexible, open-ended key-value structure, owned by whichever Collector contributed it (Canonical Data Model §6). This Engine does not define a second, competing shape.
- `attachMetadata()` records which Collector contributed which entries (`contributorCollectorId`) — this is what lets Metadata stay "additive, and owned by whichever Collector contributed it" (Canonical Data Model §6) even once many Collector Types write into the same Canonical Document's metadata over its lifetime (e.g. re-collection, §7).
- The Metadata Engine validates only that entries are structurally well-formed (a key and a value are present) — it never interprets, requires, or depends on any particular key existing. The AI Processing Layer and Knowledge Store are never required to understand any Collector's Metadata content to do their own job (Canonical Data Model §6, restated unchanged here).
- **Representation is intentionally left open**, matching Database Design §2 Open Question #4 (schema-less document field vs. separate key-value table) — this contract's shape (`attachMetadata`/`getMetadata`) works identically under either representation; this document does not resolve which one is chosen.

---

## 6. Attachment Engine

```
AttachmentEngine
  attach(canonicalDocumentId, attachmentType, contentPointer) -> AttachmentId
  listAttachments(canonicalDocumentId) -> List<AttachmentRecord>
```

- An `AttachmentRecord` is the same **Attachment** record Database Design §1.5 already defines (id, canonical_document_id, attachment_type, content pointer). `attachmentType` is an open vocabulary matching Canonical Data Model §5: Image, Video, PDF, Audio, Future.
- `contentPointer` is a reference into the object/blob storage layer (Database Design §1.4) — the Attachment Engine never embeds binary content inline in the Canonical Document Contract (§2), consistent with Canonical Data Model §5's "first-class, individually addressable part" framing.
- Every Attachment remains reachable only through its parent Canonical Document in this contract — matching Canonical Data Model §5's current design exactly. Whether an Attachment should ever gain independent, directly-traceable identity (so Evidence could cite it directly) is Canonical Data Model §12 Open Question #4, still unresolved, carried forward unchanged (§11).
- The Attachment Engine performs no analysis of attachment content (no image recognition, no OCR, no transcription) — explicitly out of scope, named as such in Canonical Data Model's own Out of Scope (§11) and restated here per Engine Principle 3.

---

## 7. Identity Resolution

```
IdentityResolution
  resolve(candidateDocument) -> IdentityOutcome
  // NewDocument | SameSourceRecollection(existingDocumentId) | ContentDuplicateOf(existingDocumentId) | Ambiguous
```

Implements Canonical Data Model §7's two Identity Rules as a two-step check, in order:

1. **Same-Source check.** If a document already exists for the same `source_id` carrying the same source-provided identity (the same post, the same article, the same file — Canonical Data Model §7), the candidate is a re-collection, not a new document: `SameSourceRecollection`.
2. **Cross-Source content check.** Otherwise, if the candidate's `hash` (§2) matches an existing document's `hash` from a *different* Source or Source Type, the candidate is a content-level duplicate: `ContentDuplicateOf`. Consistent with Canonical Data Model §7, content-level identity is judged independently of Source identity — no algorithm for computing or comparing the hash is chosen here (Engine Principle 7).
3. If neither check matches, the candidate is `NewDocument` and receives a newly-assigned `id` (§2) — **an `id`, once assigned, never changes**, even if a later document is later found to duplicate this one (Canonical Data Model §7, unchanged).
4. `Ambiguous` is reserved for a case this document does not resolve — e.g. a same-Source match on source-provided identity that simultaneously fails a content-hash comparison (edited-at-source re-collection). Named as a possible outcome so the contract has a place for it; how it should actually be handled is Open Question #6.

**Boundary with Preprocessing Pipeline's Duplicate Detection (5A) — a fifth naming/scope echo, alongside "Jade Intelligence," "Knowledge," and "Normalization" already flagged elsewhere in this platform's design trail.** Identity Resolution here is **exact-match and structural**: same source-provided identity, or an exact hash match. Preprocessing Pipeline's own Duplicate Detection stage (5A, memory-noted as "recognizes/flags only") operates later, on AI-ready Documents, and is understood to be **near-duplicate / fuzzy** detection (e.g. the same story paraphrased across two unrelated websites) — a different granularity of the same general concept. This document takes the position that the two are complementary, not overlapping: Identity Resolution catches exact structural/content matches at ingestion, Preprocessing Pipeline's Duplicate Detection catches everything softer, later. **This line was never explicitly drawn in any Business Design document and is not confirmed here** — flagged as Open Question #3.

- Identity Resolution **classifies only** — it does not merge, delete, or silently drop a `SameSourceRecollection` or `ContentDuplicateOf` candidate. What happens next (does a re-collection still get stored as its own Raw Data Item with a pointer to the existing Canonical Document? does a content duplicate get linked, and by whom?) is explicitly **not** decided here — this restates, and does not resolve, Canonical Data Model §12 Open Question #3 (carried forward, §11).

---

## 8. Processing Pipeline

The Canonical Engine's own internal sequence — everything that happens between a Collector's successful `normalize()` return (T3 §1.3, step 3) and a Hand-off-ready Canonical Document (T3 §1.3, step 5). This is the technical elaboration of what T3 §1.3 step 4 named only as "validated by the SDK."

```
Candidate Canonical Document (Collector's normalize() output)
   │
   ▼
Validate (§3) ──── Invalid ──▶ reject: emit CanonicalEngineFailure (§9), do not proceed
   │ Valid
   ▼
Confirm Mapping (§4)
   │
   ▼
Attach Metadata (§5)
   │
   ▼
Attach Attachments (§6)
   │
   ▼
Resolve Identity (§7)
   │
   ▼
Finalized Canonical Document ──▶ Hand-off (T3 §1.3 step 5 — Raw Data Store / Canonical Document Store, Database Design §1.3)
```

- This pipeline runs once per successfully-normalized candidate — one execution of a Collector (T3 §1.5's `ExecutionHandle`) can produce many candidates, and each one runs this pipeline independently (Engine Principle 6).
- A candidate that fails Validation never reaches Mapping, Metadata, Attachment, or Identity Resolution — the gate is hard, not advisory (§3).
- A candidate classified `SameSourceRecollection` or `ContentDuplicateOf` by Identity Resolution (§7) still completes this pipeline and is still hand-off-ready — Identity Resolution's outcome travels with the document past Hand-off; it does not itself stop the pipeline (§7 classifies, it does not gate).
- Nothing in this pipeline performs cleaning, language detection, translation, summarization, or any other AI Processing Layer stage (Platform Architecture §10) — those all begin strictly after Hand-off (Engine Principle 3).

---

## 9. Error Handling

```
CanonicalEngineFailure
  candidateReference
  stage           // Validation | Mapping | MetadataAttachment | AttachmentHandling | IdentityResolution
  failureType     // ValidationFailure | MappingFailure | MetadataFailure | AttachmentFailure | IdentityAmbiguous
  violations?     // present for ValidationFailure — List<ValidationViolation> (§3)
  message
```

- **Relationship to T3 §1.7's `FailureRecord`.** A `CanonicalEngineFailure` raised at the Validation stage is what T3 §1.7 already names as the `NormalizationFailure` failure type on a Collector's `FailureRecord` — this document elaborates that failure type's internal shape; it does not replace or duplicate T3's own contract. A `CanonicalEngineFailure` at any other stage (Mapping, Metadata, Attachment, Identity) is likewise reported to the SDK as a `NormalizationFailure`, since from the Collector Lifecycle's point of view (T3 §1.3, step 4) this Engine's entire pipeline is one step.
- **Propagation matches T3 §1.7 exactly.** One candidate's `CanonicalEngineFailure` does not stop the Engine from processing the remaining candidates from the same Collector execution — the same item-level isolation T3 §1.7 already establishes for Collection and Normalization failures (Engine Principle 6).
- **`IdentityAmbiguous` (§7) is a `CanonicalEngineFailure`, not a silent default.** An `Ambiguous` Identity Resolution outcome is surfaced as a failure requiring attention, not quietly treated as `NewDocument` — though what "attention" means operationally is Open Question #6.
- Where `CanonicalEngineFailure` records are ultimately stored — folded into Monitoring's own store (Database Design §1.5), held by the SDK, or held by this Engine — is not decided here; this restates T3 §2 Open Question #6 unchanged (carried forward, §11).

---

## 10. Testing Strategy

Business/technical-level testing concepts only — no test framework, tool, or test code is named or written here, mirroring T3 §1.10's own boundary.

- **Contract conformance, not live-source testing.** Each sub-engine (Validation §3, Mapping §4, Metadata §5, Attachment §6, Identity Resolution §7) should be verifiable against its own contract using fixture candidate documents — never requiring a live Collector run, a live Source, or a running Registry/Scheduler (T3 §1.4–§1.5). Follows Engine Principle 5 directly.
- **Canonical Document Contract conformance (§2) is the one guarantee the whole pipeline's tests must prove**, regardless of which Source Type produced the original candidate — the same cross-cutting guarantee T3 §1.10 already states for `normalize()` output, now proven one layer deeper.
- **Each Mapping Profile (§4) is independently testable.** A fixture of native raw fields for a given Source Type, run through `applyMapping()`, should deterministically produce the expected `CanonicalFieldSet` — this is the most direct way to prove a new Source Type's profile is correct before its Collector Type is registered (T3 §1.4).
- **Identity Resolution (§7) is testable via fixtures covering all four outcomes** — `NewDocument`, `SameSourceRecollection`, `ContentDuplicateOf`, and `Ambiguous` — each constructed from fabricated existing-document state, without needing a populated live store.
- **Pipeline-level isolation (§8) is testable with a mixed batch.** A test scenario with several candidates, some Valid and some Invalid, should verify that Invalid candidates are rejected with a correctly-shaped `CanonicalEngineFailure` (§9) while Valid candidates in the same batch still complete the full pipeline unaffected.
- **AI Processing Layer correctness stays explicitly out of scope**, same as T3 §1.10 — this Testing Strategy covers only what happens up to and including Hand-off; nothing about Preprocessing/Understanding/Reasoning/Knowledge Generation's own correctness is this document's concern.

---

## 11. Open Questions

1. **System Architecture (T1) still does not exist.** Same gap Database Design (T2 §2 OQ#1) and Collector SDK (T3 §2 OQ#1) already recorded — not re-blocked a third time; carried forward unchanged. If T1 is produced later, this document should be checked against it for consistency.
2. **Canonical Engine's own boundary.** Is the Canonical Engine literally part of the Collector SDK library (T3), invoked internally at Collector Lifecycle step 4, or a separate shared service/process the SDK calls into over some interface? This document takes the position that it is a distinct, shared component (Engine Principle 1) but T3 never named it separately — not decided.
3. **Identity Resolution vs. Preprocessing Pipeline's Duplicate Detection.** §7 draws a line — exact/structural identity here, near-duplicate/fuzzy detection later in Preprocessing (5A) — that no Business Design document explicitly confirmed. Is this the correct division, or does one subsume the other? Not decided (the platform's fifth flagged naming/scope echo).
4. **Metadata representation** (carried unchanged from Database Design §2 OQ#4). Schema-less document field vs. separate key-value table — the Metadata Engine's contract (§5) works under either, but this document does not choose. Not decided.
5. **Duplicate-linkage ownership** (carried unchanged from Canonical Data Model §12 OQ#3). Does Identity Resolution (§7) itself write a link record for `SameSourceRecollection`/`ContentDuplicateOf` outcomes, or does it only classify, leaving actual linkage to a downstream stage (Preprocessing Pipeline, Knowledge Store)? Not decided.
6. **Handling of `Ambiguous` and other Engine failures.** §9 states `IdentityAmbiguous` and other `CanonicalEngineFailure`s are surfaced, not silently defaulted — but who or what consumes them, and whether any of them are retryable (via T3 §1.6's `RetryPolicy`, or something new), is not defined.
7. **Mapping Profile ownership, versioning, and application point.** §4 does not settle who defines/approves a new Source Type's Mapping Profile, what happens to already-produced Canonical Documents if a profile changes later (echoes Collector Framework §12 OQ#7's Collector-versioning question), or whether `applyMapping()` is called by the Collector Type's own `normalize()` implementation or by this Engine after the fact. Not decided.
8. **Attachment independent identity** (carried unchanged from Canonical Data Model §12 OQ#4). §6 keeps Attachments reachable only through their parent Canonical Document — still unresolved whether that should change.
9. **Hashing/matching algorithm.** No algorithm is chosen anywhere in this document (§2, §7) — consistent with every prior package, but it remains a real, unresolved technical decision this Engine's actual behavior depends on.
10. **`CanonicalEngineFailure` system of record** (carries T3 §2 OQ#6 forward, one layer deeper). Are these failures persisted into Database Design (T2) §1.5's Monitoring records, held by the SDK, or held by this Engine itself? Not decided.

---

Technical Design only. No code written. No implementation. Stopping — waiting for Product Owner Review.
