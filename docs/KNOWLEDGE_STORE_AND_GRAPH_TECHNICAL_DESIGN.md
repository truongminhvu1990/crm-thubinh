# Jade Intelligence Platform — Knowledge Store & Knowledge Graph (Technical Design)

**Package:** T6 — Technical Design, Knowledge Store & Knowledge Graph
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Technical Design only. Interfaces and contracts only — no implementation, no working code, no chosen programming language, no chosen library/framework, no algorithm bodies. Signatures below are language-agnostic pseudocode used only to state a contract's shape (names, inputs, outputs) — not source code, the same convention Collector SDK (T3) established. This document does not reopen `docs/DATABASE_DESIGN.md` (T2) §1.4's storage-technology recommendation (relational store, graph traversal via relational joins, no dedicated graph database) — it designs the engine-level contracts and query/traversal shape that sit on top of that already-made decision.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (1), `docs/CANONICAL_DATA_MODEL.md` (1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (1.7), `docs/COLLECTOR_FRAMEWORK.md` (2), `docs/SOURCE_REGISTRY.md` (3), `docs/RAW_DATA_STORAGE.md` (4), `docs/PREPROCESSING_PIPELINE.md` (5A), `docs/UNDERSTANDING_PIPELINE.md` (5B), `docs/REASONING_PIPELINE.md` (5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (5D), `docs/KNOWLEDGE_GRAPH.md` (6), `docs/KNOWLEDGE_STORE.md` (7), `docs/CRM_INTEGRATION.md` (8), `docs/MONITORING.md` (9), `docs/DEPLOYMENT.md` (10). None of the sixteen is modified by this document.

**Based on — Technical Design:**
- **"System Architecture (T1)" still does not exist anywhere in this repository.** Same gap `docs/DATABASE_DESIGN.md` (T2), `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), and `docs/AI_PIPELINE_TECHNICAL_DESIGN.md` (T5) already recorded in their own headers. Per their established precedent (an `AskUserQuestion` was tried once for this exact class of gap during T2 and declined), this document does not re-block on it a fifth time. See Open Question #1.
- **`docs/DATABASE_DESIGN.md` (Package T2) — LOCKED, reused directly, never redefined.** This document does not invent new record types for Knowledge, Evidence, or relationships — it builds its contracts and query design entirely on T2 §1.5's already-defined `Knowledge`, `Evidence`, `Evidence–Knowledge Link`, `Knowledge–Entity Link`, `Entity Instance`, `Relationship Type`, and `Relationship Instance` record types, T2 §1.6's Entity Relationships diagram, T2 §1.7's Index Strategy, and T2 §1.9's Versioning Strategy (notably: **one `Knowledge` row per version, chained via `previous_version_id`, "current is a query, not a stored flag"** — this document does not reintroduce a separate item-level header record, since T2 already made that call).
- **`docs/AI_PIPELINE_TECHNICAL_DESIGN.md` (Package T5) — LOCKED, referenced at the write boundary.** T5 §1.4's Knowledge Generation Engine is confirmed there as the Knowledge Store's sole writer (`process()` creates or versions a `Knowledge` row, T2 §1.5/§1.9). This document designs everything on the *read and traversal* side of that same boundary — it does not redesign or duplicate T5 §1.4's write contract.
- **`docs/JADE_INTELLIGENCE_API_DESIGN.md` (Package T7) — exists, produced out of numeric order.** T7 is numbered *after* this package but was already written, its own header stating "no Technical Design document of any kind exists anywhere in this repository" — the same cross-session-unawareness gap `docs/COLLECTOR_SDK.md` (T3)'s header already recorded once for its own numbering. **T7 §3.1–§3.2 already specify external REST endpoints and DTOs (`KnowledgeDTO`, `GraphPathDTO`, `RelationshipDTO`) that assume internal Knowledge Store/Graph contracts this document is the first to actually formalize.** This document is treated as informative context to check consistency against — **not** a required LOCKED input under this task's own instruction (which names only the Business Design) — and every place §7 below lines up with, or creates tension against, a T7 endpoint is called out explicitly rather than silently reconciled. See Open Question #2.
- `docs/COLLECTOR_SDK.md` (T3) and `docs/CANONICAL_ENGINE.md` (T4) exist but have no direct bearing on Knowledge Store/Graph design — referenced only where T2/T5 already draw the connection.
- **A sixth naming echo, flagged in passing:** Business Design Package **7** is "Knowledge Store"; Technical Design Package **T7** is "API Design" — the same package number, two unrelated documents, joining the running list of naming collisions this platform's design trail keeps surfacing (Jade Intelligence, Knowledge×2, Normalization, Opportunity). Not confusing in practice since the "T" prefix disambiguates, but noted for completeness.

---

## 1. Knowledge Store Design

Builds on T2 §1.3's "Knowledge Store" storage layer and §1.5's `Knowledge`/`Evidence–Knowledge Link`/`Knowledge–Entity Link` record types without redefining any of them. What T2 didn't specify — and this document adds — is the **engine-level interface** other components actually call to read from and (in one narrow case) write to that storage:

```
KnowledgeStoreEngine:
  create(candidate: Knowledge) -> Knowledge
  publish(knowledgeId: ID) -> Knowledge
  getCurrent(knowledgeId: ID) -> Knowledge | NotFound
  getVersions(knowledgeId: ID) -> Knowledge[]
  findByEntity(entityInstanceId: ID) -> Knowledge[]
  findByTopic(topic: string) -> Knowledge[]
  findByTrend(trendEntityInstanceId: ID) -> Knowledge[]
  findBySource(sourceId: ID) -> Knowledge[]
  findByTime(range: TimeRange) -> Knowledge[]
```

- **`create()` and `publish()` are the only two methods with write effect, and both are reserved for the Knowledge Generation Engine (T5 §1.4).** This restates Knowledge Store Design Principle 2 ("only Knowledge Generation Pipeline writes into the Knowledge Store") as an actual interface-level access boundary rather than a convention every caller is trusted to follow. Every other method here is read-only.
- **`create()` must never blind-insert.** Matching T5 §1.4's "Versioning enforcement": it checks whether the candidate continues an existing chain (via `previous_version_id`) before writing, and if so, the predecessor's `lifecycle_status` moves to `Superseded` as part of the same operation (T2 §1.9) — never a separate, forgettable step.
- **`publish()` is deliberately a separate call from `create()`**, matching T5 §1.4 ("Publication is a separate call from Creation") and T2 §1.9's "current is a query, not a stored flag" — it only ever moves `lifecycle_status` from `Candidate` to `Published`; it performs no other write.
- **`findByEntity` / `findByTopic` / `findByTrend` / `findByTime`** are direct lookups over T2's Knowledge/Knowledge–Entity Link tables (elaborated in §3). **`findBySource`** is not a direct lookup at all — it is a thin wrapper over Knowledge Graph traversal (§7) — named here only because Knowledge Store §7 named it as a Store-side capability; its real mechanism belongs to §6–§7.

---

## 2. Version Storage

Direct continuation of T2 §1.5 and §1.9 — **not a new versioning design, an elaboration of the one T2 already committed to.**

- **One `Knowledge` row per version.** There is no separate "Knowledge Item" record. A version chain is a linked list of `Knowledge` rows connected by `previous_version_id`, exactly as T2 §1.5 defines it. This document's first draft (superseded, see revision note below) proposed a separate item-level header record — **that proposal is withdrawn**, since T2 already made the opposite call and this document must build on T2, not re-litigate it.
- **"Current version" is computed, not stored** (T2 §1.9): the current Published version of a chain is the row that (a) is not referenced by any other row's `previous_version_id` (i.e., it has no successor), and (b) has `lifecycle_status = Published`. `getCurrent()` (§1) performs exactly this lookup, using the `Knowledge — by previous_version_id` index T2 §1.7 already names.
- **Knowledge Item identity is, in practice, the root version's own id** — the very first `Knowledge` row in a chain (the one whose `previous_version_id` is null). Nothing in T2 or this document creates a distinct, stabler identifier than that. **This has a real consequence for T7 §3.1's `GET /v1/knowledge/{knowledgeId}`: it is not yet defined whether `{knowledgeId}` must be the root version's id (resolved to "current" internally) or any version's id in the chain (also resolved to "current" via a chain-walk). Flagged as Open Question #2 — this is the concrete shape of the ambiguity T7's header could not have anticipated, since T6 did not exist when T7 was written.**
- **Evidence references are naturally per-version, with no extra design needed.** Because Evidence–Knowledge Link (T2 §1.5) keys on `knowledge_id`, and each version is its own row with its own id, each version's supporting Evidence set is already whatever that specific row is linked to — T2's schema satisfies Evidence & Provenance Model §9's per-version traceability requirement without any addition.
- **Superseded is a one-field status change on the predecessor row, never a content edit.** When `publish()` (§1) makes a new version current, the immediately preceding Published row's `lifecycle_status` flips to `Superseded` — the only "mutation" this design ever performs, and it touches status only.
- **Archived granularity is left exactly as open as T2 left it.** T2 §1.5's `lifecycle_status` field is a per-row value, so Archived *can* apply to one historical version while the chain's current version stays Published — but neither T2 nor the Business Design (`KNOWLEDGE_STORE.md` §12 Open Question #2) confirms this is the intended behavior. Carried forward as Open Question #7.

---

## 3. Retrieval Design

Technical-izes Knowledge Store §7's five capabilities as concrete lookups against T2's schema, reconciling each against what T2 actually provides a field or index for.

| Capability | Lookup mechanism | Grounded in |
|---|---|---|
| **Find by Entity** | `Knowledge–Entity Link` filtered by `entity_instance_id` | T2 §1.5 (link table), §1.7 (named index) |
| **Find by Trend** | Same mechanism as Find by Entity, scoped to Entity Type = Trend | T2 §1.5 Entity Type enum |
| **Find by Time** | `Knowledge.created_time` / `published_time` range filter | T2 §1.5 |
| **Find by Topic** | **No backing field exists.** T2 §1.5's `Knowledge` record carries no `topic` attribute, and T2 §1.2 explicitly excludes Structured Understanding (where Topic Detection, Understanding Pipeline §8, actually happens) from durable storage except as it becomes Evidence or a Knowledge Candidate. There is currently no designed path for a Topic to survive onto a Published `Knowledge` row at all. **Gap — see Open Question #3.** |
| **Find by Source** | Not a direct Store-side lookup — implemented via Knowledge Graph traversal (§6–§7), `findBySource()` in §1 is a pass-through. | Reconciled in §7 |

- **Default retrieval scope is the current-Published version only.** Every lookup above returns, for each matching chain, only the row satisfying §2's "current" computation — matching T7 §3.1's own stated default ("Default read returns the currently Published version only"). **This is a direct, confirmed consistency point between this document and the already-written T7** — worth stating plainly rather than treating as coincidental.
- **Version history is a separate, explicit request** (`getVersions()`, §1) — mirroring T7 §3.1's `/versions` endpoint exactly. Retrieval never silently includes Superseded/Archived rows in the default result set.
- **Retrieval performs no ranking, scoring, or reasoning** — consistent with Knowledge Store Design Principle 1; results are returned in whatever order the caller requests (e.g., Time DESC), nothing more.

---

## 4. Knowledge Graph Design

Technical-izes Knowledge Graph §3–§4 as a concrete map onto T2's already-defined tables — **not a new store**, per Knowledge Graph Design Principle 1 and T2 §1.4/§1.6's own resolution that traversal runs as relational queries over data already held elsewhere.

| Graph Node Type | Backing T2 record | Notes |
|---|---|---|
| Knowledge | `Knowledge` row | A **specific version** (§2) — there is no item-level node distinct from a version row. |
| Entity | `Entity Instance` row | T2 §1.5 |
| Evidence | `Evidence` row | T2 §1.5 |
| Canonical Document | `Canonical Document` row | T2 §1.5 |
| Raw Source | `Raw Data Item` row | T2 §1.5 |
| Source | `Source` row | T2 §1.5 |
| Future | Not yet defined | Same open-ended allowance as the Business Design. |

- **No node type introduces new storage.** Every row above already exists for a reason unrelated to the graph (it's the Knowledge Store's, Evidence Store's, or Canonical Document Store's own record) — the graph is purely a way of describing how to walk between rows that already exist, which is exactly what T2 §1.4 already decided when it declined a dedicated graph database.
- **This design assembles, for the first time, the complete edge map T2 only sketched at storage-layer granularity** (T2 §1.3's "not a separate storage layer" note, §1.6's ER diagram) into an actually walkable structure — see §5.

---

## 5. Relationship Model

Reuses — never redefines — Knowledge Graph §5's two relationship classes, now mapped one-for-one onto T2's actual foreign keys and link tables.

| Relationship | From → To | Cardinality | Backing T2 structure |
|---|---|---|---|
| **supported by** | Knowledge → Evidence | many : many | `Evidence–Knowledge Link` (T2 §1.5) |
| **drawn from** | Evidence → Canonical Document | many : 1 (nullable, per Evidence Type) | `Evidence.canonical_document_id` (T2 §1.5) |
| **normalized from** | Canonical Document → Raw Data Item | 1 : 1 *(T2's current assumption — flagged unconfirmed, T2 §12 Open Question #5, carried forward here as Open Question #6)* | `Canonical Document.raw_data_item_id` (T2 §1.5) |
| **collected from** | Raw Data Item → Source | many : 1 | `Raw Data Item.source_id` (T2 §1.5) |
| **about** | Knowledge → Entity Instance | many : many | `Knowledge–Entity Link` (T2 §1.5) |
| **[Ontology Relationship, e.g. belongs to / produces / sells]** | Entity Instance → Entity Instance | many : many, typed | `Relationship Instance`, typed by `Relationship Type` (T2 §1.5), `evidence_id` nullable for Reasoning-discovered relationships |
| **supersedes (version chain)** | Knowledge → Knowledge (self) | 1 : 1 | `Knowledge.previous_version_id` (T2 §1.5) |

- **No new relationship vocabulary is invented** — every row above is a named T2 structure, consistent with Knowledge Graph Design Principle 3.
- **Direction is a first-class property, not a formality.** Each relationship above is stored/queryable in one canonical direction, but is meaningfully **walkable in reverse** for a different purpose — e.g. "supported by," walked forward from Knowledge, answers *Find supporting Evidence*; the same edge walked backward from an Evidence row answers *what Knowledge does this Evidence support*, a traversal the Business Design never named but which this schema supports for free. Noted as a technical observation, not a new business capability.
- **Version scoping applies only to the Knowledge-anchored edges** ("supported by," "about") — since those attach to a specific `Knowledge` row (a specific version). Ontology Relationships between Entity Instances are entirely unaffected by any Knowledge version history, since Entity Instances themselves are never versioned by any prior package.

---

## 6. Traversal Design

Two distinct traversal shapes, matching Knowledge Graph §6's four navigation capabilities onto §5's edge map.

- **Fixed-depth provenance walk** (Find supporting Evidence, Find Source history) — a bounded chain, never more than 4 hops: `Knowledge —(supported by)→ Evidence —(drawn from)→ Canonical Document —(normalized from)→ Raw Data Item —(collected from)→ Source`. Because the depth is fixed by the chain itself, no depth limit or cycle guard is needed for this shape.
- **Variable-depth exploration** (Find related Knowledge, Find connected Entities — Business Design's "Context") — has no natural stopping point, since Ontology Relationships and Knowledge–Entity links can be followed outward indefinitely. This design proposes a **default depth limit of 1 hop**, with deeper traversal an explicit, opt-in parameter rather than default behavior — the direct technical answer to Knowledge Graph §12 Open Question #2 (Context boundary). **Not yet confirmed. See Open Question #5.**
- **Traversal defaults to current-Published Knowledge rows**, the same default §3 applies to retrieval — starting a traversal from a specific Superseded/Archived version is possible (its row and edges are retained, never deleted) but must be explicitly requested, never the default entry point.
- **Conflicting Evidence gets no special graph structure.** Two Evidence rows that contradict each other are simply two ordinary `Evidence–Knowledge Link` rows pointing at the same Knowledge row — a conflict is something a caller *discovers* by comparing the content of multiple linked Evidence rows, not something the edge model flags in advance. A real, disclosed design choice (an alternative — a distinct "conflicting" edge type — was considered and not adopted here). **See Open Question #4.**
- **Cycle safety is not yet addressed.** Ontology Relationships (Entity ↔ Entity) can in principle form cycles. At the proposed default of 1 hop this never matters, but if deeper traversal is ever approved (resolving Open Question #5 the other way), cycle detection becomes a real requirement this document does not design. **See Open Question #8.**

---

## 7. Query Strategy

```
KnowledgeGraphEngine:
  getSupportingEvidence(knowledgeVersionId: ID) -> Evidence[]
  getProvenanceChain(knowledgeVersionId: ID) -> ProvenancePath
  getConnectedEntities(knowledgeVersionId: ID) -> EntityInstance[]
  getRelatedKnowledge(knowledgeVersionId: ID, depth: int = 1) -> Knowledge[]
  getSourceHistory(sourceId: ID) -> ProvenancePath[]
```

- **Store lookup is the entry point; graph traversal is the optional follow-on.** This resolves Knowledge Store §12 Open Question #4 ("does a single retrieval combine Store lookup + Graph navigate?") as a proposed pattern: a caller typically starts with a `KnowledgeStoreEngine` method (§1/§3) to find a starting Knowledge row or Entity, then optionally calls into `KnowledgeGraphEngine` from that starting point — the two engines are not required to be stitched together by every caller from scratch. **Proposed, not confirmed.**
- **`findBySource()` (§1) is implemented as `getSourceHistory(sourceId)` filtered down to Knowledge nodes** — resolving the apparent overlap between Knowledge Store §7's "Find by Source" and Knowledge Graph §6's "Find Source history": they are **one capability, reachable through either entry point**, not two independent mechanisms, since "everything tracing back to Source X" only exists as a forward graph walk (Source → Raw Data Item → Canonical Document → Evidence → Knowledge) — there is no direct `source_id` column on `Knowledge` in T2's schema to look up against directly.
- **Multi-Source corroboration defaults to parallel paths, not a merged result.** `getSourceHistory` returns `ProvenancePath[]` (plural) — one path per corroborating Source — rather than aggregating them into a single combined view, since merging would require a business rule about how corroboration is judged that no prior package defines. Aggregation, if wanted later, is a future capability layered on top, not built into this query shape now.
- **Cross-check against `docs/JADE_INTELLIGENCE_API_DESIGN.md` (T7), confirmed consistent, not coincidental:** T7 §3.2's `GET /v1/knowledge/{knowledgeId}/related` maps directly onto `getRelatedKnowledge()`; `/graph` (T7's combined "supporting Evidence + connected Entities" view) maps onto `getSupportingEvidence()` + `getConnectedEntities()` called together; `/entities/{entityType}/{entityId}/knowledge` maps onto `KnowledgeStoreEngine.findByEntity()` (§1); `/sources/{sourceId}/history` maps onto `getSourceHistory()`. Every T7 endpoint in that section now has a concrete internal contract behind it for the first time.

---

## 8. Open Questions

1. **System Architecture (T1) still does not exist.** Same gap every other Technical Design package (T2–T5) has already recorded. This document was produced directly from the Business Design plus T2/T5 (and cross-checked against T7) instead. If T1 is ever produced, check it against this document for consistency.
2. **Knowledge Item identity across `{knowledgeId}` references.** Because T2 has no item-level record (§2), it is undefined whether a `knowledgeId` used externally (T7 §3.1, §3.2) or internally (§1, §7 above) means "the root version's id" or "any version's id in the chain, resolved to current." This is a genuine, concrete gap this document surfaces between an already-written external contract (T7) and the internal schema (T2) it assumes — needs Product Owner input, possibly a small T7 revision once resolved.
3. **Find by Topic has no backing field.** T2 §1.5's `Knowledge` record carries no `topic` attribute, and Topic Detection's output (Understanding Pipeline §8) is explicitly not durably stored except as it becomes Evidence or a Candidate (T2 §1.2). Knowledge Store §7 names "Find by Topic" as a capability with no field anywhere in the schema to support it today. Not resolved — likely needs either a new `Knowledge` attribute (a T2 revision) or a different mechanism (e.g., deriving Topic at query time from linked Evidence/Canonical Document content).
4. **Conflicting Evidence — no structural distinction proposed.** §6 proposes conflicts are discovered by comparing linked Evidence content rather than flagged by a distinct edge type. A real alternative exists and was not adopted; not confirmed either way.
5. **Context / traversal depth default (1 hop).** §6's proposed default is a business judgment about how much automatic exploration is useful vs. noisy — not confirmed.
6. **One-to-one vs. one-to-many, Canonical Document → Raw Data Item.** Carried forward from T2 §12 Open Question #5 (originally framed as Raw Data Item → Canonical Document) — if this is ever one-to-many, §5's "normalized from" relationship and §6's fixed-depth provenance walk both need to become fan-out-aware rather than a simple chain. Not decided here; this document inherits T2's open question rather than resolving it.
7. **Archived granularity: version-level, item-level, or both.** §2 keeps this exactly as open as `KNOWLEDGE_STORE.md` §12 Open Question #2 and T2 itself leave it — this document cannot settle its own version-storage picture further until that business-level question is answered.
8. **Cycle safety in Ontology Relationship traversal.** Not addressed by any prior package (Business or Technical). Irrelevant at the proposed 1-hop default (Open Question #5), but becomes a real requirement the moment deeper traversal is ever approved. Flagged now so it isn't rediscovered later as a production surprise.

---

Technical Design only. No code written. No database created or modified. No implementation. Stopping — waiting for Product Owner Review.
