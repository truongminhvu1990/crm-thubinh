# Jade Intelligence Platform — Technical Design: API Design

**Package:** T7 — Technical Design, API Design
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Technical design — interface/contract shape only. No server or client code, no chosen programming language/framework, no infrastructure, no AI model or vendor selection, no database schema/SQL. Signatures below are language-agnostic pseudocode used only to state a contract's shape — not source code, the same convention `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), and `docs/AI_PIPELINE.md` (T5) already established.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (1), `docs/CANONICAL_DATA_MODEL.md` (1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (1.7), `docs/COLLECTOR_FRAMEWORK.md` (2), `docs/SOURCE_REGISTRY.md` (3), `docs/RAW_DATA_STORAGE.md` (4), `docs/PREPROCESSING_PIPELINE.md` (5A), `docs/UNDERSTANDING_PIPELINE.md` (5B), `docs/REASONING_PIPELINE.md` (5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (5D), `docs/KNOWLEDGE_GRAPH.md` (6), `docs/KNOWLEDGE_STORE.md` (7), `docs/CRM_INTEGRATION.md` (8), `docs/MONITORING.md` (9), `docs/DEPLOYMENT.md` (10). None of the sixteen is modified by this document.

**Based on — Technical Design, all treated as LOCKED per this task's instruction (their own headers stay "Draft," unedited, same convention):**
- **`docs/DATABASE_DESIGN.md` (T2).** Every DTO in §4 below reuses T2 §1.5's record types by reference — no field is added, renamed, or reinterpreted.
- **`docs/COLLECTOR_SDK.md` (T3, Revision 2).** Its `CollectorRegistry` and `Scheduler` interfaces (§1.4–§1.5 there) already **are** two of this platform's Internal APIs — §1 below catalogs them rather than redesigning them.
- **`docs/CANONICAL_ENGINE.md` (T4).** Its `ValidationEngine`, `MappingEngine`, `MetadataEngine`, `AttachmentEngine`, and `IdentityResolution` contracts (§3–§7 there) are likewise already-designed Internal APIs, cataloged in §1.
- **`docs/AI_PIPELINE.md` (T5, the current draft of this package — supersedes the earlier `docs/AI_PIPELINE_TECHNICAL_DESIGN.md` per T5's own header).** Its `PreprocessingEngine`, `UnderstandingEngine`, `ReasoningEngine`, `KnowledgeGenerationEngine`, and `PipelineOrchestrator` contracts (§1.2–§1.7 there) are the remaining Internal APIs, cataloged in §1.
- **`docs/KNOWLEDGE_STORE_AND_GRAPH_TECHNICAL_DESIGN.md` (T6).** This is the document this package builds most directly on: T6 §3 (Retrieval Design), §6 (Traversal Design), and §7 (Query Strategy) already propose the exact lookup and traversal patterns this document's REST Specification (§3) exposes externally. This document does not redesign any of T6's proposals — where T6 marks a proposal "not yet confirmed," this document inherits that same open status rather than silently resolving it.

**System Architecture (T1) is still missing — confirmed independently by four prior packages, not re-raised as a new blocker.** `docs/DATABASE_DESIGN.md` (T2), `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), and `docs/AI_PIPELINE.md` (T5) each checked for it and each found nothing — T3's header records that an `AskUserQuestion` was tried once on this exact gap during T2 and the Product Owner's follow-up simply re-sent the task instruction unchanged, establishing that this platform's operating pattern is to proceed and flag, not re-block on the same question a second time. This document follows that same precedent: it proceeds directly from the sixteen Business Design documents plus T2–T6, and carries the T1 gap forward as Open Question #1, unchanged from how T2–T5 already stated it.

---

## 1. Internal APIs

**Correction to this document's own first draft:** most of this platform's Internal APIs are **already designed**, not open for (re)design here — `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), and `docs/AI_PIPELINE.md` (T5) each define concrete, named contracts for exactly this purpose. This section catalogs them as this package's own §1 deliverable, rather than inventing parallel or looser versions of interfaces that already have a locked shape.

| Internal Interface | Contract | Defined in |
|---|---|---|
| **Collector Interface** | `getMetadata()`, `discover()`, `collect()`, `normalize()` | Collector SDK §1.2 |
| **Collector Registry** | `register()`, `unregister()`, `getInstance()`, `listInstances()`, `updateStatus()`, `getStatus()` | Collector SDK §1.4 |
| **Scheduler** | `assignSchedule()`, `triggerNow()`, `onEvent()` | Collector SDK §1.5 |
| **Retry Policy** | `isRetryable()`, `nextAttempt()` | Collector SDK §1.6 |
| **Validation Engine** | `validate()` | Canonical Engine §3 |
| **Mapping Engine** | `getMappingProfile()`, `applyMapping()` | Canonical Engine §4 |
| **Metadata Engine** | `attachMetadata()`, `getMetadata()` | Canonical Engine §5 |
| **Attachment Engine** | `attach()`, `listAttachments()` | Canonical Engine §6 |
| **Identity Resolution** | `resolve()` | Canonical Engine §7 |
| **Preprocessing Engine** | `process()` | AI Pipeline §1.2 |
| **Understanding Engine** | `process()` | AI Pipeline §1.3 |
| **Reasoning Engine** | `linkEvidence()`, `analyze()` | AI Pipeline §1.4 |
| **Knowledge Generation Engine** | `propose()`, `process()` | AI Pipeline §1.5 |
| **Pipeline Orchestrator** | `onCanonicalDocumentReady()`, `triggerReasoningAnalysis()`, `triggerKnowledgeGeneration()` | AI Pipeline §1.7 |
| **Knowledge Store retrieval** | Find by Entity/Topic/Trend/Source/Time | Knowledge Store & Graph Technical Design §3 |
| **Graph traversal** | Fixed-depth provenance walk; variable-depth Context exploration | Knowledge Store & Graph Technical Design §6 |
| **Monitoring observation** | Reads Health Status / Business Metric / Alert / Audit Trail records | Database Design §1.5; Monitoring §3–§7 |

**What this package actually adds to Internal APIs:** nothing new is designed — the value of §1 is confirming that every internal boundary named in Platform Architecture §4 ("each layer only talks to its immediate neighbor") now has a concrete contract somewhere in T2–T6, and that this document's External API (§2–§3) sits entirely **downstream** of all of them, consuming only Knowledge Store retrieval and Graph traversal (the last two rows above) — never reaching past them into the Engines, exactly as CRM Integration §3 requires ("never reads Raw Data Storage, Collectors, or the AI Processing Layer's intermediate stages directly").

---

## 2. External APIs

Only two External surfaces are grounded in a locked Business Design document; a third is named but not designed by either the Business or Technical Design tracks.

| External Surface | Consumer | Grounded in | Direction |
|---|---|---|---|
| **CRM Integration Read Surface** | The CRM (if/when a specific module's own spec is revised to consume it — CRM Integration §5 flags this as not yet authorized for most named modules) | CRM Integration (Package 8) §3–§9; technically realized via Knowledge Store & Graph Technical Design §3, §6–§7 | Platform → CRM, read-only, pull-only (CRM Integration §3: "Pull, not push"). Scoped to the Knowledge Store and Knowledge Graph only. |
| **Manual Import Submission Surface** | A staff member | Collector Framework §5, §10; technically, this submission ultimately invokes the Manual Import Collector Type's `normalize()` (Collector SDK §1.2) the same as any other Collector | Person → Platform, one-way. Not a Knowledge write — it is an external entry point into the Collector layer (§1 above), which still runs the full Canonical Engine (T4) and AI Pipeline (T5) chain before anything could ever become Knowledge. |
| **Future Modules' Read Surface** | Supplier/Mine/Pricing/Customer/Auction Intelligence, Knowledge Vault, Mobile App (Platform Architecture §15) | Named only, not designed by any package | Not designed here. Platform Architecture §15 separately names an "**API**" Future Module — whether that Future Module *is* this document's External API being brought forward now, or a distinct, still-future thing, is Open Question #2. |

**What is explicitly not an External API:**
- No external surface writes Knowledge, Evidence, or any Platform-internal artifact — CRM Integration §6: the CRM "cannot write, create, update, or delete anything" in the Platform.
- No push notification surface exists from the Platform to the CRM — CRM Integration §3 rules this out explicitly. See §7 (Event Contracts).

---

## 3. REST Specification

Resource-oriented, HTTP-verb-based — chosen because the task explicitly asks for a "REST Specification," not as an independent technology decision (every other package in this platform stays deliberately technology-agnostic). Every endpoint below maps onto a capability **already proposed** in Knowledge Store & Graph Technical Design (T6) §3/§6/§7 — this document does not invent a new retrieval or traversal shape, it exposes T6's existing proposals as HTTP resources.

### 3.1 Knowledge retrieval (T6 §3 — Find by Entity/Topic/Trend/Source/Time)

```
GET /v1/knowledge?entity={entityInstanceId}&topic={topic}&trend={entityInstanceId}&from={time}&to={time}
GET /v1/knowledge/{knowledgeItemId}                    → current Published Knowledge Version only (T6 §3's default scope)
GET /v1/knowledge/{knowledgeItemId}/versions            → full version chain (T6 §2's Knowledge Version records) — an explicit, non-default request
GET /v1/knowledge/{knowledgeItemId}/evidence             → this Knowledge Version's own Evidence references (T6 §2: "each version carries its own Evidence references, not a shared/latest-only set")
```

`knowledgeItemId` addresses the **Knowledge Item header** (T6 §1) — the stable identity across all versions — not any one version directly; `/versions` is what exposes the version chain itself. This mirrors T6 §1's own two-part conceptual shape (header + Knowledge Version records) rather than treating Knowledge as one flat, mutable resource.

**Find by Source is not a plain filter here** — per T6 §7's own reconciliation ("structurally, Find by Source is a graph traversal, not a Store lookup"), it is exposed under Graph traversal (§3.2), not as a `?source=` query parameter on this endpoint. This document keeps that distinction rather than flattening it away for REST convenience, since doing so would silently re-open a design question T6 itself only tentatively proposed (T6 Open Question #3).

### 3.2 Graph traversal (T6 §6 — fixed-depth provenance walk and variable-depth Context exploration)

```
GET /v1/knowledge/{knowledgeItemId}/graph/evidence-chain     → fixed-depth provenance walk: Knowledge → Evidence → Canonical Document → Raw Source → Source (T6 §6, ≤4 hops, no depth parameter needed)
GET /v1/knowledge/{knowledgeItemId}/graph/related?depth={n}  → variable-depth Context exploration (T6 §6's "Find related Knowledge" / "Find connected Entities"); defaults to depth=1 per T6 §6's own proposed default, any deeper value is an explicit opt-in
GET /v1/entities/{entityInstanceId}/knowledge                → Find by Entity (T6 §3), also reachable as a graph starting point (Knowledge Graph §6 "Find connected Entities")
GET /v1/sources/{sourceId}/graph/history                      → Find Source history (T6 §6, §7) — the graph traversal forward from a Source node; returns "several parallel paths, one per corroborating Source" by default rather than a merged result (T6 §7)
```

The `/graph/evidence-chain` vs. `/graph/related` split directly mirrors T6 §6's own two named traversal shapes (fixed-depth provenance vs. variable-depth exploration) — this document does not collapse them into one generic "traverse" endpoint, since they have different depth-bounding behavior and T6 treats that difference as load-bearing.

### 3.3 Source Information (CRM Integration §4 — "Reading Source Information")

```
GET /v1/sources/{sourceId}    → Source Registry §3, §6 attributes (Database Design §1.5's Source record: name, type, owner, language, region, status, trust_level, collection_method)
```

### 3.4 Manual Import submission (Collector Framework §5, §10; Collector SDK §1.2)

```
POST /v1/manual-imports
```
Fields map directly onto what a staff member can provide toward a Canonical Document (Collector Framework §10's worked example: title/content/link optionally provided, author optional, submitting staff member recorded). This endpoint is, technically, an external trigger for the Manual Import Collector Type's Lifecycle (Collector SDK §1.3) — it does not shortcut past Validation (Canonical Engine §3) or any AI Pipeline stage (AI Pipeline §1.2–§1.5).

### 3.5 Monitoring (Database Design §1.5's Monitoring records; Monitoring §3–§7)

```
GET /v1/monitoring/health?scope={sources|collectors|raw-data|pipelines|knowledge-generation|knowledge-store|crm-integration}
GET /v1/monitoring/metrics
GET /v1/monitoring/audit-trail?from={time}&to={time}
```
Maps directly onto Database Design §1.5's **Health Status Record**, **Business Metric Record**, and **Audit Trail Entry** record types — no new metric or status level is introduced. Consumer is a platform operator, not the CRM or a Future Module, which is why this group is kept separate from §3.1–§3.3.

### 3.6 Method/status conventions

- Every endpoint in §3.1, §3.2, §3.3, and §3.5 is `GET`, read-only — matches CRM Integration §6's "cannot write" boundary and Monitoring §2's "Monitoring observes, it never performs."
- `POST /v1/manual-imports` is the only externally-triggered write anywhere in this specification, and it writes into the Collector layer's intake (§1), never into the Knowledge Store directly — the Knowledge Generation Engine (AI Pipeline §1.5) remains the sole writer of Knowledge (Database Design §1.1 Principle 7; AI Pipeline Principle 5).
- A request for a Knowledge item, Entity, or Source that exists but currently has nothing to report returns an empty result set, not an error (CRM Integration §3's "graceful absence" — see §5).

---

## 4. DTO Design

Every DTO reuses a Database Design (T2) §1.5 record type by reference — no field is added, renamed, or invented. Where T6 refines a T2 record's conceptual shape (the Knowledge header/version split), the DTO reflects that refinement.

| DTO | Fields | Source |
|---|---|---|
| **KnowledgeItemDTO** | id, type_of_finding, category, current_version_id (pointer to the current KnowledgeVersionDTO) | Database Design §1.5 Knowledge record; Knowledge Store & Graph Technical Design §1 (header concept) |
| **KnowledgeVersionDTO** | id, knowledge_item_id, version_number, previous_version_id, confidence, lifecycle_status (Candidate/Published/Updated/Superseded/Archived), created_time, published_time, evidence_ids (own set, not shared across versions — T6 §2) | Database Design §1.5; Knowledge Store & Graph Technical Design §2 |
| **EvidenceDTO** | id, evidence_type (Raw Document/Canonical Document/External Reference/Market Observation/Historical Knowledge), canonical_document_id, confidence, created_time | Database Design §1.5 Evidence record |
| **CanonicalDocumentDTO** | id, raw_data_item_id, source_id, source_type, collector_id, language, title, content, summary (nullable), author, published_time, collected_time, url, hash, lifecycle_status | Database Design §1.5; Canonical Engine §2 (structural type table) |
| **SourceDTO** | id, name, type, owner, language, region, status, trust_level, collection_method | Database Design §1.5 Source record |
| **EntityInstanceDTO** | id, entity_type_id, canonical_name, category_id (nullable), parent_instance_id (nullable) | Database Design §1.5 Entity Instance record. **Flagged, not glossed over: T6 Open Question #1 states no prior package — Business or Technical — actually designs where Entity *instances* are technically recorded, only the Entity Type vocabulary itself (Taxonomy & Ontology §4). This DTO's shape is inherited from Database Design §1.5's own record definition, but the storage backing it is an acknowledged, unresolved gap this document does not close.** |
| **RelationshipInstanceDTO** | id, subject_entity_instance_id, relationship_type_id, object_entity_instance_id, origin (Ontology-defined vs. Reasoning-discovered), evidence_id (nullable) | Database Design §1.5 Relationship Instance record |
| **GraphPathDTO** | Ordered list of `{node_type, node_id}` plus the relationship connecting each consecutive pair — directional, per Knowledge Store & Graph Technical Design §5's `(from_node_type, from_node_id, relationship_type, to_node_type, to_node_id)` edge shape | Knowledge Store & Graph Technical Design §4–§6 |
| **ManualImportRequestDTO** | title (optional), content/document/link (at least one required), author (optional), submitting_staff_member | Collector Framework §5, §10 |
| **HealthStatusDTO** | scope_type, scope_id, status (Healthy/Warning/Degraded/Failed), observed_time | Database Design §1.5 Health Status Record |
| **BusinessMetricDTO** | metric_type, value, period, recorded_time | Database Design §1.5 Business Metric Record |
| **AuditTrailEntryDTO** | event_type, scope_type, scope_id, detail, occurred_time | Database Design §1.5 Audit Trail Entry record |

**Deliberately excluded from every DTO above:** any Confidence *score* or Trust Level *scale* (no formula exists anywhere in the Business or Technical Design — Evidence & Provenance Model §7, Source Registry §7), and any field for an Entity Instance's storage location beyond what Database Design §1.5 already names (per the EntityInstanceDTO flag above). Adding either would invent a business or technical rule this document has no authority to invent.

---

## 5. Error Model

Business/technical-level error categories — no HTTP status code table, no exception class hierarchy. Named to be consistent with, not a replacement for, the failure contracts T3/T4/T5 already define one layer further in.

| Error Category | Business Meaning | Grounded In |
|---|---|---|
| **Not Found** | The requested Knowledge item, Knowledge version, Entity, Source, or Graph node does not exist. | Standard; not a new concept. |
| **No Current Result (not an error)** | A valid Entity/Source/query exists but currently has nothing to report — CRM Integration §3's "graceful absence." Modeled as an empty result, never a failure. | CRM Integration §3, §6 |
| **Platform Unavailable** | The Platform, or the specific surface called, cannot be reached. Every consumer must remain fully functional in this state. | Platform Architecture Principle 4; CRM Integration Design Principle 3 |
| **Validation Error** | A Manual Import submission (§3.4) is missing the minimum required content. Distinct from — and does not surface — the internal `ValidationFailure`/`CanonicalEngineFailure` shapes T4 §3/§9 already define for structural conformance; this is the outward-facing equivalent for the one write-like External API endpoint. | Collector Framework §10; Canonical Engine §3, §9 |
| **Unauthorized** | The caller isn't permitted to access the requested surface. **Not fully specifiable today** — no authentication/authorization mechanism exists anywhere in the Business or Technical Design (Platform Architecture §14; CRM Integration §11 Open Question #6). Named as a placeholder category. | Platform Architecture §14 |
| **Traceability Incomplete** | A Knowledge Version was about to be returned but its Evidence Chain cannot be fully walked back to a Source node via §3.2's fixed-depth traversal. Per Evidence & Provenance Model §9 and Knowledge Graph §8 this should never actually occur — modeled defensively, not as an expected state. | Evidence & Provenance Model §9; Knowledge Store & Graph Technical Design §6 |
| **Write Rejected** | Any attempt to write, update, or delete data through a surface that only supports reads (every endpoint in §3.1–§3.3, §3.5). | CRM Integration §6 |

No error category implies a retry policy, HTTP status code, or logging mechanism.

---

## 6. Versioning

Two separate "version" concepts, both already given a technical shape by T6, that this API must expose without conflating:

1. **API Versioning** — how this REST surface itself evolves (§3–§4). This document proposes URI-based versioning (`/v1/...`, already reflected in every §3 endpoint) as a placeholder convention, not a binding technology decision — whether an eventual implementation uses this, a header, or content negotiation is Open Question #7.
2. **Knowledge Versioning** — fully designed by Knowledge Store & Graph Technical Design §2: an immutable Knowledge Version chain (`previous_version_id`), with the Knowledge Item header (§1 there) holding a pointer to whichever version is "current." §3.1's `/knowledge/{id}` vs. `/knowledge/{id}/versions` split exposes this exact header/chain distinction through API Version v1 — bumping the API version never creates a new Knowledge version, and vice versa.

**Reads default to the current Published version**, matching both CRM Integration §7 ("Versioned Knowledge is read as current by default") and T6 §3's own default retrieval scope. Superseded/historical versions are reachable only through the explicit `/versions` endpoint, never returned by default.

**Backward-compatibility rule (restating Taxonomy & Ontology §10):** an API version must never change the *meaning* of a DTO field for data already returned by a prior API version — only additive changes, or a new major API version, may alter field meaning.

---

## 7. Event Contracts

**Constrained by an already-locked rule:** CRM Integration §3 — "Pull, not push. ... the Platform never pushes data into the CRM unprompted." No CRM-facing push/webhook contract is specified here; doing so would directly contradict a locked Business Design decision.

Internal/operational events — business meaning only, no payload schema or delivery mechanism chosen — each tied to a specific, already-designed Engine call:

| Event | Fires when | Grounded in |
|---|---|---|
| **Canonical Document Hand-off** | The Canonical Engine's Processing Pipeline completes and delivers a Hand-off-ready document (Canonical Engine §8) to the Preprocessing Engine (AI Pipeline §1.2). | Canonical Engine §8; AI Pipeline §1.6 |
| **Knowledge Published** | `KnowledgeGenerationEngine.process()`'s internal `Publish` step runs (AI Pipeline §1.5), moving a Knowledge Version's `lifecycle_status` to Published. | AI Pipeline §1.5; Knowledge Store & Graph Technical Design §2 |
| **Knowledge Superseded** | A newer Knowledge Version is Published, flipping the prior version's state to Superseded (never deleted). | Knowledge Store & Graph Technical Design §2 |
| **Health Status Changed** | Monitoring observes a scope area (§3.5) transition between Healthy/Warning/Degraded/Failed. | Monitoring §4; Database Design §1.5 |
| **Alert Raised** | Monitoring surfaces a condition warranting attention. **Recipient and channel are explicitly undecided** (Monitoring §6, §10 Open Question #1) — this event's existence is fixed, its delivery is not. | Monitoring §6 |

None of these events are ever delivered to the CRM directly.

---

## 8. Open Questions

1. **System Architecture (T1) still does not exist.** Same gap Database Design (T2), Collector SDK (T3), Canonical Engine (T4), and AI Pipeline (T5) each already recorded independently — not re-raised as a new blocker, carried forward unchanged.
2. **"API" Future Module vs. this document.** Platform Architecture §15 separately names an "API" Future Module. Is that Future Module *this* External API surface (§2–§3), brought forward ahead of schedule, or a distinct, still-future thing? Not decided.
3. **Entity instance storage is still undesigned.** Directly inherited from Knowledge Store & Graph Technical Design §8 Open Question #1: no package at any layer specifies where individual Entity instances are technically recorded. `GET /v1/entities/{entityInstanceId}/knowledge` (§3.2) and `EntityInstanceDTO` (§4) both assume this storage exists — it doesn't yet, at any level of design. This is inherited, not newly discovered, but it is worth restating here since this is the first package to expose it through an actual external contract.
4. **Node identity across Knowledge versions is not confirmed.** T6 §5 *proposes* each Knowledge Version gets its own graph node (rather than one node per item across all versions) — not yet confirmed by the Product Owner (T6 Open Question #2). This directly determines whether `GraphPathDTO` (§4) ever needs to distinguish "this Knowledge node" from "this specific version's Knowledge node."
5. **Context/traversal depth default is a proposal, not a lock.** `GET /v1/knowledge/{id}/graph/related?depth={n}`'s default of 1 (§3.2) inherits T6 §6's own proposed-but-unconfirmed default (T6 Open Question #4) — if the Product Owner sets a different default, this endpoint's default changes with it.
6. **Authentication/authorization mechanism.** Every read endpoint in §3 and the Error Model's "Unauthorized" category (§5) depend on an access-control mechanism never decided anywhere in the Business or Technical Design (Platform Architecture §14; CRM Integration §11 Open Question #6).
7. **API versioning mechanism.** §6 proposes URI-based versioning as a placeholder consistent with the task's "REST Specification" ask — whether a future implementation actually adopts this is not decided.
8. **Which CRM modules are actually authorized to call this API.** CRM Integration §5 flags that Reports, Market Intelligence, and Knowledge Vault currently conflict with their own locked specs and cannot consume this API without a separate CRM-side spec revision — this document cannot grant, and does not grant, that authorization.
9. **Manual Import authorization.** Collector Framework §12 Open Question #6 (who may submit, whether any approval step precedes normalization) is inherited unchanged by `POST /v1/manual-imports` (§3.4).
10. **Source-lineage shortcut and multi-Source corroboration.** `GET /v1/sources/{id}/graph/history` (§3.2) inherits two still-open T6 proposals unchanged: whether a denormalized Source-reference shortcut is required or optional (T6 Open Question #3), and that corroborating Sources are returned as parallel paths rather than merged (T6 §7, not evaluated against alternatives).

---

Technical Design — API/interface contract shape only. No server or client code written. No database changes. No new internal contract designed (§1 catalogs, does not redesign, T3/T4/T5's existing ones). No technology selected beyond the REST/HTTP style the task itself requested. Stopping — waiting for Product Owner Review.
