# Jade Intelligence Platform — API Design

**Package:** T7 — Technical Design, API Design
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Technical Design only. No implementation, no code, no chosen programming language/framework, no infrastructure, no AI model or vendor selection, no database schema/SQL. Signatures below are language-agnostic pseudocode used only to state a contract's shape — not source code, the same convention `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), and `docs/AI_PIPELINE.md` (T5) already established.

**Supersedes an earlier, ad hoc draft of this same package.** A prior task in this session produced `docs/JADE_INTELLIGENCE_API_DESIGN.md` for Package T7 under an 8-section structure and a different file path, before this formal Product Owner Decision specified `docs/API_DESIGN.md` and the 11-section structure below. That file is left untouched (not a LOCKED document, so nothing requires deleting it, but nothing requires preserving it as current either) — this document, at the path and structure the Product Owner explicitly named, is the current draft of Package T7.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Platform Architecture), `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, `docs/UNDERSTANDING_PIPELINE.md`, `docs/REASONING_PIPELINE.md`, `docs/KNOWLEDGE_GENERATION_PIPELINE.md`, `docs/KNOWLEDGE_GRAPH.md`, `docs/KNOWLEDGE_STORE.md`, `docs/CRM_INTEGRATION.md`, `docs/MONITORING.md`, `docs/DEPLOYMENT.md`. None of the sixteen is modified by this document.

**Based on — Technical Design, all treated as LOCKED per this task's instruction (their own headers stay "Draft," unedited, same convention):** `docs/DATABASE_DESIGN.md` (T2), `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), `docs/AI_PIPELINE.md` (T5), `docs/KNOWLEDGE_STORE_AND_GRAPH_TECHNICAL_DESIGN.md` (T6). None of the five is modified by this document.

**Two flags up front, neither treated as a blocker (established precedent this platform has followed since T2):**

1. **"System Architecture (T1)" is named as a LOCKED input in this task, but no such document — no file named or resembling `SYSTEM_ARCHITECTURE.md`, or any "Package T1" — exists anywhere in this repository.** This is now the fifth independent confirmation of the same gap: `docs/DATABASE_DESIGN.md` (T2), `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), and `docs/AI_PIPELINE.md` (T5) each checked and each found nothing; this task's own re-listing of T1 as LOCKED did not change that — the repository was re-checked immediately before writing this document and T1 still does not exist. Per the precedent T2 established (an `AskUserQuestion` was tried once on this exact gap and the Product Owner's follow-up simply re-sent the task instruction unchanged), this document does not re-block a fifth time. It proceeds grounded in the sixteen Business Design documents plus T2–T6, and carries the gap forward unchanged as Open Question #1.
2. **Naming label variance, not a blocker.** This task refers to T6 as "**Knowledge Platform (T6)**"; the actual locked file's own title is "Knowledge Store & Knowledge Graph Technical Design." Treated as the same document — this platform's design trail already tracks several such naming echoes ("Jade Intelligence," "Knowledge," "Normalization") without them ever being resolution-blocking; noted here for the same reason, not re-litigated.

---

## 1. API Principles

Technical-level principles governing this API layer specifically — additive to, not a replacement for, Platform Architecture §3's Architecture Principles and the technical-level Principles already established by Database Design (T2 §1.1), Collector SDK (T3 §1.1), Canonical Engine (T4 §1), and AI Pipeline (T5 §1.1):

1. **Contracts, not implementations.** This document defines what each API surface looks like from the outside — no method bodies, no chosen language, no chosen framework.
2. **The API layer is the outermost boundary, not a new internal layer.** It sits atop already-locked internal contracts (Collector SDK T3, Canonical Engine T4, AI Pipeline T5, Knowledge Store & Graph T6) without redefining any of them — where this document names an internal contract (§3), it catalogs, it does not redesign.
3. **Read-only by default; the one write-like surface is minimal and explicit.** Every API in §4–§7 is read-only. The only externally-triggered write anywhere in this design is Manual Import submission (§3), and even that writes into the Collector layer's intake, never into the Knowledge Store directly (restates Database Design §1.1 Principle 7; AI Pipeline Principle 5 — Knowledge Generation is the platform's sole writer of Knowledge).
4. **CRM Integration stays pull-only and one-directional.** Restates CRM Integration §3 exactly: the Platform never pushes data into the CRM unprompted; every CRM-facing API in §6 is called by the CRM on its own schedule.
5. **No API skips a layer.** Consistent with CRM Integration §3's own boundary, no API defined here lets a caller reach Raw Data Storage, a Collector, or an AI Pipeline intermediate stage (Preprocessing/Understanding/Reasoning) directly — every external read goes through the Knowledge Store/Graph (T6) or Monitoring's own records (T2 §1.5).
6. **Traceability survives every API boundary.** Any API response derived from Knowledge must remain traceable back through Evidence → Canonical Document → Raw Source → Source (Evidence & Provenance Model §9; CRM Integration §8) — an API is never a place traceability is allowed to quietly end.
7. **Graceful absence, never a hard dependency.** Consistent with Platform Architecture Principle 4 and CRM Integration Design Principle 3, every API must have a defined "nothing to report" response that never blocks or breaks a caller — this is a response shape (§9), not an excuse to omit error handling.
8. **Additive extensibility applies to APIs too.** Mirrors Database Design §1.1 Principle 5, Collector SDK §1.1 Principle 5, and Canonical Engine Principle 1 — a new Collector Type, Source Type, or Entity Type must never require a breaking change to an existing API contract, only an additive one (§8).
9. **Technology-agnostic beyond what the task itself requests.** No database, message queue, API gateway, or auth vendor is chosen anywhere in this document — the REST/HTTP style in §4–§7 is used because the task's own structure implies it (Knowledge/Search/CRM Integration/Monitoring "APIs"), not as an independent technology decision.

---

## 2. Authentication Contract

**No authentication/authorization mechanism is chosen anywhere in the Business or Technical Design** — Platform Architecture §14 and CRM Integration §11 Open Question #6 both leave this explicitly open. Consistent with how Collector SDK (T3 §1.6) defined a `RetryPolicy` *contract* without choosing a retry algorithm, this section defines an Authentication/Authorization *contract shape* without choosing a mechanism (API key, OAuth, mutual TLS, session token — none selected).

```
AuthContract
  authenticate(credentials) -> Principal | AuthenticationFailure
  authorize(principal, resource, action) -> Allowed | Denied
```

- **Principal** is the technical stand-in for "who is calling" — this document proposes at least three Principal kinds, grounded directly in the consumers already named elsewhere in this platform's locked design, not invented fresh:
  - **CRM Integration Principal** — represents a specific CRM module's integration (Customers, Products, Reports, etc.), not the CRM monolithically. **Proposed, not confirmed** — see Open Question #5. Grounded in CRM Integration §3's "each CRM module opts in independently" principle.
  - **Platform Operator Principal** — a person or system authorized to call Monitoring APIs (§7).
  - **Manual Import Submitter Principal** — a staff member submitting via Collector APIs (§3) — grounded in Collector Framework §12 Open Question #6 ("who is allowed to submit via Manual Import"), which this contract inherits unresolved rather than silently deciding.
- **Resource** maps to this document's own API groupings (§3–§7) — e.g. `KnowledgeAPI`, `SearchAPI`, `CRMIntegrationAPI`, `MonitoringAPI`, `ManualImportSubmission`.
- **Action** is deliberately narrow: `Read` (every endpoint in §4, §5, §6, §7) or `Submit` (the one Manual Import endpoint, §3) — there is no `Write`/`Update`/`Delete` action anywhere in this contract, matching API Principle 3.
- **`authorize()` is where per-module CRM scoping would be enforced**, if the CRM Integration Principal proposal above is confirmed — e.g. a Products-module Principal being `Denied` for a Reports-scoped call, consistent with CRM Integration §5's per-module conflict flags (Reports and Market Intelligence currently cannot consume this Platform at all under their own locked specs).
- **This contract does not decide** who issues a Principal, how credentials are verified, or what an `AuthenticationFailure`/`Denied` outcome looks like on the wire (§9 states only that "Unauthorized" exists as an Error Category) — all left as Open Question #4.

---

## 3. Collector APIs

Two different kinds of "API" exist here, kept explicit rather than blurred together: **already-designed internal contracts** (language/component-level, not HTTP) that this section catalogs rather than redesigns, and **one genuine external HTTP endpoint**.

### 3.1 Internal Collector contracts (cataloged, not redesigned)

| Contract | Operations | Defined in |
|---|---|---|
| **Collector Interface** | `getMetadata()`, `discover()`, `collect()`, `normalize()` | Collector SDK §1.2 |
| **Collector Registry** | `register()`, `unregister()`, `getInstance()`, `listInstances()`, `updateStatus()`, `getStatus()` | Collector SDK §1.4 |
| **Scheduler** | `assignSchedule()`, `triggerNow()`, `onEvent()` | Collector SDK §1.5 |
| **Retry Policy** | `isRetryable()`, `nextAttempt()` | Collector SDK §1.6 |

Every Collector Type's output still passes through the Canonical Engine's `ValidationEngine`/`MappingEngine`/`MetadataEngine`/`AttachmentEngine`/`IdentityResolution` (Canonical Engine §3–§7) before Hand-off (Canonical Engine §8) — those remain Canonical Engine's own contracts, not re-listed here, since this section's scope is specifically Collector-facing APIs.

### 3.2 External: Manual Import submission

```
POST /v1/manual-imports
```

The only externally-triggered write anywhere in this API Design. Technically, this is an external trigger for the Manual Import Collector Type's Lifecycle (Collector SDK §1.3) — it does not bypass Validation (Canonical Engine §3) or any AI Pipeline stage (AI Pipeline §1.2–§1.5); it enters the exact same pipeline any other Collector Type's output does. Fields map onto what a staff member can provide (Collector Framework §10's worked example): title/content/document/link (at least one required), author (optional), submitting staff member (required — see Collector Framework §12 Open Question #6, inherited unresolved, §11 Open Question #11 here).

---

## 4. Knowledge APIs

Every endpoint maps onto a capability **already proposed** in Knowledge Store & Graph Technical Design (T6) §3 (Retrieval Design) and §6 (Traversal Design) — this document exposes T6's existing proposals as HTTP resources rather than inventing a new lookup or traversal shape.

```
GET /v1/knowledge?entity={entityInstanceId}&topic={topic}&trend={entityInstanceId}&type_of_finding={type}&from={time}&to={time}
GET /v1/knowledge/{knowledgeItemId}                          → current Published Knowledge Version only (T6 §3's default scope)
GET /v1/knowledge/{knowledgeItemId}/versions                  → full version chain (T6 §2) — explicit, non-default
GET /v1/knowledge/{knowledgeItemId}/evidence                  → this version's own Evidence references (T6 §2)
GET /v1/knowledge/{knowledgeItemId}/graph/evidence-chain       → fixed-depth provenance walk: Knowledge → Evidence → Canonical Document → Raw Source → Source (T6 §6, ≤4 hops)
GET /v1/knowledge/{knowledgeItemId}/graph/related?depth={n}    → variable-depth Context exploration (T6 §6); defaults to depth=1 per T6's own proposed default
GET /v1/entities/{entityInstanceId}/knowledge                  → Find by Entity (T6 §3)
```

`knowledgeItemId` addresses the **Knowledge Item header** (T6 §1) — the stable identity across all versions, not any one version directly; `/versions` is what exposes the version chain. Reads default to the current Published version, matching both CRM Integration §7 ("Versioned Knowledge is read as current by default") and T6 §3's own default retrieval scope.

**Find by Source is deliberately not a filter on this endpoint.** Per T6 §7's own reconciliation ("structurally, Find by Source is a graph traversal, not a Store lookup"), Source-based lookup is exposed under CRM Integration APIs (§6.2) instead, where CRM Integration §4 names "Reading Source Information" directly.

---

## 5. Search APIs

**Flagged plainly: no locked Business or Technical Design document names a generic, free-text "Search" capability.** Knowledge Store §7 names exactly five retrieval dimensions — Entity, Topic, Trend, Source, Time — as distinct capabilities, not a unified search. This document's Search API is designed as a **combinator over those five already-named dimensions**, not as an invented full-text engine over Canonical Document/Knowledge Content.

```
GET /v1/search/knowledge?entity={id}&topic={topic}&trend={id}&source={id}&from={time}&to={time}&type_of_finding={type}
```

- This is functionally the same underlying lookup as Knowledge APIs' `GET /v1/knowledge` (§4) — the distinction offered here is that Search APIs are the **combined, multi-dimension** entry point (any subset of the five parameters together), whereas Knowledge APIs' base endpoint is documented as the single-dimension case. Whether these should actually be one endpoint or two is a disclosed judgment call, not a locked design decision — see Open Question #6.
- **Full-text/keyword search over unstructured Content (Canonical Data Model §3) is explicitly NOT designed here.** No locked document names a text-indexing capability, a relevance-ranking rule, or even that free-text search is a wanted feature — Knowledge Store §7 Design Principle explicitly states retrieval "does not rank, score, or reason" (T6 §3). Adding a `q=` free-text parameter would be inventing a business capability this document has no authority to invent. Flagged as Open Question #6, not silently added.
- Search results follow the same defaults as Knowledge APIs (§4): current Published version only, no ranking beyond what the caller's own sort/filter parameters request.

---

## 6. CRM Integration APIs

**Not a separate, duplicate endpoint set** — CRM Integration APIs are a **constrained view** over Knowledge APIs (§4), Search APIs (§5), and Source Information, governed by CRM Integration (Package 8)'s own principles: pull-only, read-only, per-module opt-in, graceful absence, no write-back.

### 6.1 What the CRM may call

The CRM may call any endpoint in §4 and §5, subject to:
- **Per-module authorization** via the Authentication Contract (§2) — a CRM Integration Principal is scoped to whichever specific CRM module it represents. **Which modules are actually authorized is not decided by this document** — CRM Integration §5 flags that Reports, Market Intelligence, and Knowledge Vault currently conflict with their own locked specs and cannot consume this Platform at all without a separate CRM-side spec revision (§11 Open Question #10).
- **Read-only, always** (CRM Integration §6 — "cannot write, create, update, or delete anything").
- **Never reaching past the Knowledge Store/Graph** — CRM Integration §3: "never reads Raw Data Storage, Collectors, or the AI Processing Layer's intermediate stages directly." Collector APIs (§3) and any internal AI Pipeline contract are never CRM-reachable, at any authorization level.

### 6.2 Source Information

```
GET /v1/sources/{sourceId}    → Source Registry §3, §6 attributes; CRM Integration §4's "Reading Source Information"
```
Placed here rather than under Knowledge APIs (§4) because CRM Integration §4 explicitly names "Reading Source Information" as a distinct CRM capability alongside Reading Knowledge/Graph/Evidence.

### 6.3 Synchronization

Restates CRM Integration §7 unchanged — no refresh interval, SLA, or caching mechanism is decided here:
- **Read-time vs. cached** — either is compatible with "read-only, one-directional, optional"; not decided.
- **No CRM-side reconciliation** — the CRM displays what §4/§5 already return, never merges or reinterprets it.
- **No guaranteed timeliness** — restated, not resolved.

---

## 7. Monitoring APIs

```
GET /v1/monitoring/health?scope={sources|collectors|raw-data|pipelines|knowledge-generation|knowledge-store|crm-integration}
GET /v1/monitoring/metrics
GET /v1/monitoring/audit-trail?from={time}&to={time}
```

Maps directly onto Database Design §1.5's **Health Status Record**, **Business Metric Record**, and **Audit Trail Entry** record types (Monitoring §3–§7) — no new metric or status level is introduced. The consumer here is a Platform Operator Principal (§2), never the CRM or a Future Module — kept as its own section for that reason, consistent with Monitoring §2's "Monitoring observes, it never performs" (these endpoints are read-only observation, never a control surface).

---

## 8. API Versioning

Two separate "version" concepts, both already given a technical shape elsewhere, that this API must expose without conflating:

1. **API Versioning** — how this REST surface itself evolves. This document proposes URI-based versioning (`/v1/...`, reflected in every endpoint above) as a placeholder convention, not a binding technology decision — whether an eventual implementation uses this, a header, or content negotiation is Open Question #12.
2. **Knowledge Versioning** — fully designed by Knowledge Store & Graph Technical Design §2: an immutable Knowledge Version chain (`previous_version_id`), with the Knowledge Item header (T6 §1) holding a pointer to whichever version is current. §4's `/knowledge/{id}` vs. `/knowledge/{id}/versions` split exposes this exact distinction through API Version v1 — bumping the API version never creates a new Knowledge version, and vice versa.

**Backward-compatibility rule (restating Taxonomy & Ontology §10):** an API version must never change the *meaning* of a DTO field for data already returned by a prior API version — only additive changes, or a new major API version, may alter field meaning. This directly supports API Principle 8 (additive extensibility).

---

## 9. Error Handling

Business/technical-level error categories — no HTTP status code table, no exception class hierarchy. Consistent with, not a replacement for, the failure contracts T3/T4/T5 already define one layer further in.

| Error Category | Business Meaning | Grounded In |
|---|---|---|
| **Not Found** | The requested Knowledge item, Knowledge version, Entity, Source, or Graph node does not exist. | Standard; not a new concept. |
| **No Current Result (not an error)** | A valid Entity/Source/query exists but currently has nothing to report — CRM Integration §3's "graceful absence." Modeled as an empty result, never a failure (API Principle 7). | CRM Integration §3, §6 |
| **Platform Unavailable** | The Platform, or the specific surface called, cannot be reached. Every consumer must remain fully functional in this state. | Platform Architecture Principle 4; CRM Integration Design Principle 3 |
| **Validation Error** | A Manual Import submission (§3.2) is missing the minimum required content. Distinct from the internal `ValidationFailure`/`CanonicalEngineFailure` shapes T4 §3/§9 already define for structural conformance — this is the outward-facing equivalent for the API's one write-like endpoint. | Collector Framework §10; Canonical Engine §3, §9 |
| **Unauthorized** | `authenticate()` or `authorize()` (§2) returned `AuthenticationFailure`/`Denied`. **Not fully specifiable today** — no mechanism exists anywhere in the Business or Technical Design. | Platform Architecture §14; CRM Integration §11 Open Question #6 |
| **Traceability Incomplete** | A Knowledge Version was about to be returned but its Evidence Chain cannot be fully walked to a Source node via §4's fixed-depth traversal. Per Evidence & Provenance Model §9 and Knowledge Graph §8 this should never actually occur — modeled defensively. | Evidence & Provenance Model §9; T6 §6 |
| **Write Rejected** | Any attempt to write, update, or delete data through a surface that only supports reads (every endpoint in §4–§7). | CRM Integration §6 |

No error category implies a retry policy, HTTP status code, or logging mechanism.

---

## 10. Testing Strategy

Business/technical-level testing concepts only — no test framework, tool, or test code is named or written here, mirroring Collector SDK §1.10, Canonical Engine §10, and AI Pipeline §1.10's own boundary.

- **Contract conformance, not live-pipeline testing.** Each API group (§3–§7) should be verifiable against its own contract using fixture data — a fixture Knowledge Item/Version/Evidence set for Knowledge APIs (§4), a fixture Entity/Source set for Search (§5), a fixture Health/Metric/Audit record set for Monitoring (§7) — never requiring a live Collector run, a live AI Pipeline execution, or a live CRM caller.
- **Each API group is independently testable.** Collector APIs (§3), Knowledge APIs (§4), Search APIs (§5), CRM Integration APIs (§6), and Monitoring APIs (§7) should each be provable on their own, mirroring the "independent, isolated failure" principle every prior Technical Design package already established (Collector SDK Principle 7, Canonical Engine Principle 5, AI Pipeline Principle 7).
- **Authentication Contract (§2) is testable without a real mechanism.** `authenticate()`/`authorize()` can be exercised against fabricated `Principal`/`credentials` fixtures, proving the contract's shape (Allowed/Denied/AuthenticationFailure branches) independent of whatever concrete mechanism is eventually chosen (Open Question #4) — the same pattern Collector SDK §1.10 already used for `RetryPolicy`.
- **Graceful-absence behavior is directly testable.** A fixture query against an Entity/Source with genuinely no Knowledge should return an empty result (§9's "No Current Result"), not an error — provable without live Platform data.
- **Read-only boundary is testable per API group.** Every non-`POST /v1/manual-imports` endpoint should be provable to reject any write attempt with "Write Rejected" (§9), confirming API Principle 3 holds group-by-group.
- **Versioning conformance (§8) is testable via a mocked version boundary.** A fixture v1 response, replayed against a hypothetical v2 contract, should prove no existing field's meaning changed — the concrete test for the Backward-compatibility rule (§8).
- **Explicitly out of scope.** End-to-end correctness of the Collector→Canonical Engine→AI Pipeline→Knowledge Store chain remains each of those packages' own Testing Strategy (Collector SDK §1.10, Canonical Engine §10, AI Pipeline §1.10) — this Testing Strategy covers only the API contracts defined in this document.

---

## 11. Open Questions

1. **System Architecture (T1) still does not exist**, despite being named as a LOCKED input in this task. Same gap Database Design (T2), Collector SDK (T3), Canonical Engine (T4), and AI Pipeline (T5) each already recorded independently — re-checked a fifth time immediately before writing this document, still absent. Not re-raised as a new blocker; carried forward unchanged.
2. **"API" Future Module vs. this document.** Platform Architecture §15 separately names an "API" Future Module. Is that Future Module *this* document's API Design being brought forward ahead of schedule, or a distinct, still-future thing? Not decided.
3. **Entity instance storage is still undesigned.** Inherited from Knowledge Store & Graph Technical Design §8 Open Question #1: no package at any layer specifies where individual Entity instances are technically recorded. `GET /v1/entities/{entityInstanceId}/knowledge` (§4) assumes this storage exists — it doesn't yet, at any level of design.
4. **Authentication/authorization mechanism.** §2 defines a contract shape only — no API key/OAuth/mTLS/session scheme is chosen anywhere in the Business or Technical Design (Platform Architecture §14; CRM Integration §11 Open Question #6).
5. **Per-CRM-module Principal scoping.** §2 proposes that a CRM Integration Principal represents one specific CRM module, not the CRM monolithically — this is a design proposal, not a confirmed decision, and ties directly to CRM Integration §11 Open Question #3 (per-module approval process).
6. **Search APIs' scope and relationship to Knowledge APIs.** §5's Search endpoint is functionally near-identical to §4's base Knowledge endpoint — whether these should be one endpoint or two is a disclosed judgment call. More importantly: full-text/keyword search over Canonical Document/Knowledge Content was never named by any locked document and is explicitly not designed here.
7. **Node identity across Knowledge versions.** T6 §5 *proposes* each Knowledge Version gets its own graph node — not yet confirmed (T6 Open Question #2). Affects whether Knowledge APIs' `/graph` endpoints (§4) ever need to distinguish "this Knowledge item" from "this specific version."
8. **Context/traversal depth default.** `GET /v1/knowledge/{id}/graph/related?depth={n}`'s default of 1 (§4) inherits T6 §6's own proposed-but-unconfirmed default (T6 Open Question #4).
9. **Source-lineage shortcut and multi-Source corroboration.** Inherited unchanged from T6 §7 and Open Question #3 — whether a denormalized Source-reference shortcut is required or optional, and that corroborating Sources are returned as parallel paths rather than merged.
10. **Which CRM modules are actually authorized to call CRM Integration APIs.** CRM Integration §5 flags that Reports, Market Intelligence, and Knowledge Vault currently conflict with their own locked specs — this document cannot grant, and does not grant, that authorization (§6.1).
11. **Manual Import authorization.** Collector Framework §12 Open Question #6 (who may submit, whether any approval step precedes normalization) is inherited unchanged by `POST /v1/manual-imports` (§3.2).
12. **API versioning mechanism.** §8 proposes URI-based versioning as a placeholder consistent with this document's own REST style — whether a future implementation actually adopts this, a header, or content negotiation is not decided.
13. **T6 naming label.** This task refers to T6 as "Knowledge Platform"; the locked file's own title is "Knowledge Store & Knowledge Graph Technical Design." Treated as the same document (see header) — flagged for completeness, not blocking.

---

Technical Design only. No implementation. No code. No server or client code written. No database changes. No new internal contract designed (§3 catalogs, does not redesign, T3's existing ones). No technology, auth mechanism, or search/ranking algorithm selected. Stopping — waiting for Product Owner Review.
