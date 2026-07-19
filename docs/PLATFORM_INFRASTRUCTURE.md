# Jade Intelligence Platform — Infrastructure (Technical Design)

**Package:** T9 — Technical Design, Infrastructure
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Technical Design only. No Infrastructure-as-Code, no Dockerfiles, no Kubernetes manifests, no CI/CD pipeline definitions, no cloud provider/vendor selection, no implementation, no code. Names infrastructure *categories* and how they carry the already-designed Engines/contracts — the same "contract/category, not implementation" convention `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), `docs/AI_PIPELINE.md` (T5), `docs/KNOWLEDGE_STORE_AND_GRAPH_TECHNICAL_DESIGN.md` (T6), `docs/API_DESIGN.md` (T7), and `docs/SECURITY.md` (T8) already established.

**Self-correction, disclosed rather than silently fixed:** a first draft of this document was written before checking whether a Technical Design track already existed — it assumed this was the *first* Technical Design package and derived every infrastructure mapping generically from the 16 Business Design documents alone (Deployment §10 and Monitoring §9 only). That was wrong. `docs/` already contains a full Technical Design track — `docs/DATABASE_DESIGN.md` (T2), `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), `docs/AI_PIPELINE.md` (T5), `docs/KNOWLEDGE_STORE_AND_GRAPH_TECHNICAL_DESIGN.md` (T6), `docs/API_DESIGN.md` (T7), and `docs/SECURITY.md` (T8) — discovered via a mid-conversation `MEMORY.md` index update from another session, the same cross-session-discovery pattern the T7 and T8 sessions each hit and corrected for themselves. The first draft is fully discarded; this document is written from scratch, grounded in all seven.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (1), `docs/CANONICAL_DATA_MODEL.md` (1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (1.7), `docs/COLLECTOR_FRAMEWORK.md` (2), `docs/SOURCE_REGISTRY.md` (3), `docs/RAW_DATA_STORAGE.md` (4), `docs/PREPROCESSING_PIPELINE.md` (5A), `docs/UNDERSTANDING_PIPELINE.md` (5B), `docs/REASONING_PIPELINE.md` (5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (5D), `docs/KNOWLEDGE_GRAPH.md` (6), `docs/KNOWLEDGE_STORE.md` (7), `docs/CRM_INTEGRATION.md` (8), `docs/MONITORING.md` (9), `docs/DEPLOYMENT.md` (10). None of the sixteen is modified.

**Based on — Technical Design, all treated as LOCKED per this task's instruction (their own headers stay "Draft," unedited, same convention):**
- **"System Architecture (T1)" is named as a LOCKED input in this task; no such document exists anywhere in this repository.** This is the **eighth** independent confirmation of the same gap (after T2, T3, T4, T5, T6, T7, and T8's own two revisions). Per the precedent established since T2 (an `AskUserQuestion` was tried once on this exact class of gap and declined), this document does not re-block on it an eighth time. Carried forward as Open Question #1.
- **`docs/DATABASE_DESIGN.md` (T2)** — reused directly, never redefined: §1.4's storage paradigm (relational system of record + separate object/blob store for Raw Data; no dedicated graph database) is the storage decision this document's Kubernetes Strategy (§1.3) and Backup (§1.5) build on, not reopen.
- **`docs/COLLECTOR_SDK.md` (T3)** — every deployable Collector unit in §1.1's table is a Collector Type implementation of T3 §1.2's Collector Interface; the Registry (§1.4) and Scheduler (§1.5) contracts map directly onto §1.3's Kubernetes shapes.
- **`docs/CANONICAL_ENGINE.md` (T4)** — the Canonical Engine's five sub-engines (Validation, Mapping, Metadata, Attachment, Identity Resolution) are one shared component per T4 Engine Principle 1; its own Open Question #2 (is it a library inside the SDK, or a separate service?) directly determines whether §1.1's table lists it as its own deployable unit — carried forward unresolved.
- **`docs/AI_PIPELINE.md` (T5)** — the four AI Pipeline Engines (Preprocessing, Understanding, Reasoning, Knowledge Generation) and the `PipelineOrchestrator` (T5 §1.7) are this document's primary deployment/scaling subjects (§1.1, §1.3); T5's own Open Questions #8 (Engine deployment granularity) and #9 (no orchestration technology chosen) are inherited directly rather than resolved here.
- **`docs/KNOWLEDGE_STORE_AND_GRAPH_TECHNICAL_DESIGN.md` (T6)** — confirms, and this document does not reopen, that the Knowledge Graph has no storage of its own (relational joins over T2's tables); `KnowledgeStoreEngine`/`KnowledgeGraphEngine` (T6 §1, §7) are one deployable read/write service, not two datastores.
- **`docs/API_DESIGN.md` (T7)** — the only externally-reachable surface (§1.3 Kubernetes Strategy's ingress rule) is T7's REST layer: Collector APIs' one write endpoint (`POST /v1/manual-imports`), Knowledge/Search/CRM Integration/Monitoring APIs (T7 §3–§7).
- **`docs/SECURITY.md` (T8)** — Secrets Management (T8 §1.5), Identity Management (T8 §1.2), and Data Protection (T8 §1.6) are the direct technical requirements this document's Docker/Kubernetes/Backup sections (§1.2, §1.3, §1.5) must satisfy, not redesign. T8's own flagged gap — no rate-limiting/DoS mitigation named anywhere (T8 §1.8, Open Question #10) — is a gap this document's Kubernetes Strategy (§1.3) can name a technical home for, but does not resolve (§2 OQ#7).

None of the twenty-three referenced documents is modified by this document.

---

## 1. Infrastructure

### 1.1 Infrastructure Principles

Technical-level principles governing this document's own scope — additive to, not a replacement for, Deployment §2's business-level Design Principles and consistent in form with every prior Technical Design package's own Principles section (T2 §1.1, T3 §1.1, T4 §1, T5 §1.1, T8 §1.1):

1. **Infrastructure carries already-designed Engines and contracts; it does not reinterpret them.** Every deployable unit named in §1.1's table below is something T2–T8 already specified — this document adds no new business logic, pipeline stage, or data flow.
2. **The Platform's infrastructure is entirely its own.** Consistent with Platform Architecture Principle 1 and Deployment Design Principle 2, no cluster, registry, pipeline, backup target, secrets store, or on-call rotation is ever shared with the CRM's own hosting (`docs/PROJECT_MANIFEST.md`, `docs/INFRASTRUCTURE_INVESTIGATION_REPORT.md`).
3. **Deployment shape follows each contract's own stated scaling and coupling behavior, not a uniform template.** T5 AI Pipeline Principle 4 already distinguishes stateless single-document Engines (Preprocessing, Understanding, Reasoning Phase 1) from stateful cross-document ones (Reasoning Phase 2, Knowledge Generation) — §1.3 treats these differently because T5 already said they behave differently, not as a new infrastructure judgment.
4. **The only externally-reachable surface is the API layer (T7).** Restates API Principle 5 ("No API skips a layer") as a network-layer guarantee: nothing in §1.1's table other than T7's REST endpoints has any ingress reachable from outside the Platform's own network.
5. **Secrets, service identity, and Audit Logging are Security's (T8) requirements, carried here, not re-decided.** §1.2–§1.3, §1.5 build the technical home for T8 §1.2 (Identity Management), §1.5 (Secrets Management), and §1.7 (Audit Logging) — this document does not reopen any of T8's own open questions, only inherits them where they determine an infrastructure shape.
6. **No cloud provider, hosting vendor, or specific product is chosen.** Ownership/hosting (Platform Architecture §17 Open Question #8) is still unresolved — this document stays at the level of technology categories, consistent with T2 §1.4's own "paradigm-level recommendation, not a product name" precedent.

---

### 1.2 Deployment Architecture

Maps every already-designed Engine/contract from T2–T8 onto a deployable technical unit and its environment placement:

| Deployable Unit | Technical Design Source | Shape |
|---|---|---|
| Collector Type implementations (Facebook, Website, RSS, PDF, CRM, Excel, API, Manual Import, Future) | Collector SDK (T3) §1.2 | One unit per Collector Type, each conforming to the same Collector Interface — matching Collector Framework §2's pluggability at the infrastructure layer. |
| Collector Registry | T3 §1.4 | A bookkeeping service — `register()`/`unregister()`/`getInstance()`/`listInstances()`/`updateStatus()`/`getStatus()`. |
| Scheduler | T3 §1.5 | A trigger service — `assignSchedule()`/`triggerNow()`/`onEvent()`. |
| Canonical Engine (Validation, Mapping, Metadata, Attachment, Identity Resolution) | Canonical Engine (T4) §3–§7 | One shared component, Source-Type-blind (T4 Engine Principle 1) — whether it is packaged as its own deployable service or a library invoked inline by the Collector SDK is T4's own unresolved Open Question #2, inherited here (§2 OQ#4). |
| Preprocessing Engine | AI Pipeline (T5) §1.2 | Stateless, single-document — independently horizontally scalable. |
| Understanding Engine | T5 §1.3 | Stateless, single-document — independently horizontally scalable. |
| Reasoning Engine — Phase 1 (`linkEvidence`) | T5 §1.4 | Stateless, single-document, chainable directly after Understanding. |
| Reasoning Engine — Phase 2 (`analyze`) | T5 §1.4, §1.7 | Cross-document, works over an accumulated `EvidenceSet` — its own trigger cadence (`triggerReasoningAnalysis`), not chained per-document. |
| Knowledge Generation Engine | T5 §1.5 | The platform's sole writer of `Knowledge` — write-path isolation matters more than horizontal scale here. |
| Pipeline Orchestrator | T5 §1.7 | Decides *when* each Engine above runs — a distinct deployable coordination unit, technology not chosen (T5 Open Question #9, inherited §2 OQ#3). |
| Knowledge Store / Knowledge Graph Engine | Knowledge Store & Graph Technical Design (T6) §1, §7 | One read/write service over the relational store — the Knowledge Graph has no storage of its own (T6 §4, T2 §1.4). |
| API layer (Collector/Knowledge/Search/CRM Integration/Monitoring APIs) | API Design (T7) §3–§7 | The **only** deployable unit with any external ingress (Infrastructure Principle 4). |
| Security services (Principal Registry, Secrets Management, Auth enforcement, Audit Logging) | Security (T8) §1.2, §1.4, §1.5, §1.7 | Cross-cutting — enforced at the API layer's boundary and at every Engine-to-Engine call (T8 §1.3). |
| Monitoring Stack | Monitoring (Package 9); Health Status/Business Metric/Audit Trail Entry (T2 §1.5) | Cross-cutting observer over every row above (§1.7 below). |

**Environments.** Each of Deployment §4's four environments (Development, Testing, Staging, Production) gets its own complete instance of the table above — no deployable unit or datastore is shared across environments, matching Deployment §4's isolation requirement, and none of the four is shared with, or synchronized with, the CRM's own environments (`docs/PROJECT_MANIFEST.md`).

**Storage placement**, reusing T2 §1.4's recommendation unchanged: a relational database as system of record for every structured record type in T2 §1.5 (Source, Collector Instance, Canonical Document, Attachment, Metadata Entry, Taxonomy/Ontology, Evidence, Knowledge with its version chain, Health Status/Business Metric/Alert/Audit Trail records); a separate object/blob store for Raw Data bulk content and Attachment binaries; a dedicated Secrets store (T8 §1.5), isolated from both.

**Network shape.** Only Collector Type units have egress to the outside world (their respective Sources); only the API layer (T7) has any ingress reachable from outside the Platform's own network (Infrastructure Principle 4) — every other hop in the table above stays inside the Platform's own network boundary.

---

### 1.3 Docker Strategy

- **One image family per deployable unit in §1.2's table.** A new Collector Type ships as a new image, never a modification to an existing one — the direct technical form of Collector SDK §1.9's Extension Model ("no other step is required or permitted").
- **The Canonical Engine's five sub-engines (§1.2) ship as one image**, consistent with T4 Engine Principle 1's "one Engine, every Source Type" — unless T4's own Open Question #2 is resolved toward a separate-service boundary, in which case each sub-engine could in principle be its own image; this document does not force that resolution.
- **The four AI Pipeline Engines each get their own image** — Preprocessing, Understanding, Reasoning, Knowledge Generation are already described (T5 AI Pipeline Principle 1) as one Engine chain with four independently-scalable Engines; one image per Engine is the direct carry-over of that principle. Whether an individual *stage within* one Engine (e.g. `Clean` vs. `DetectLanguage` inside Preprocessing) ever needs its own image is T5's own unresolved Open Question #8, inherited here (§2 OQ#2).
- **Reasoning's two phases (§1.2) are packaged as one image with two entry points** (`linkEvidence`, `analyze`), not two separate images — both are the same Engine's own contract (T5 §1.4); this is a disclosed judgment call, not settled by T5 itself (§2 OQ#5).
- **Multi-stage builds; no Secrets baked in.** Consistent with Security §1.5's storage-mechanism requirement — external Source credentials, Engine-to-Engine credentials, and encryption keys are injected at runtime, never present in a built image layer.
- **Immutable, versioned tags.** Every image is built once and tagged to a specific release; a running environment always references an explicit tag — this is what makes a technical Rollback (Deployment §5) possible at all: reverting means redeploying a prior tag, not rebuilding.
- **A registry entirely separate from the CRM's own build artifacts** (Infrastructure Principle 2).

---

### 1.4 Kubernetes Strategy

- **Environment isolation via namespaces at minimum**, per Deployment §4's four environments — network policies prevent any cross-namespace traffic. Whether Production additionally warrants a physically separate cluster is not decided (§2 OQ#8).
- **Deployments (stateless, horizontally scaled)** for: Preprocessing Engine, Understanding Engine, Reasoning Phase 1 (`linkEvidence`), the Knowledge Store/Graph Engine (T6), and the API layer (T7) — each independently scalable per T5 AI Pipeline Principle 4 and T2 §1.11.
- **A distinct deployment shape for Reasoning Phase 2 and Knowledge Generation**, since both are triggered rather than chained per-document (T5 §1.7's `triggerReasoningAnalysis`/`triggerKnowledgeGeneration`) — modeled as a Deployment fronted by the Pipeline Orchestrator's own trigger logic rather than a plain per-request autoscaled service, since a write-ownership boundary (Knowledge Generation is the sole writer of `Knowledge`, T5 AI Pipeline Principle 5) matters more here than raw horizontal scale.
- **Jobs/CronJobs for Collector Type executions**, mapping Collector SDK §1.5's Scheduler triggers directly: `triggerNow()` (Manual) → an on-demand Job; `onEvent()` (Event-driven) → an event-triggered Job; Scheduled → a CronJob; Continuous (T3 §1.5's own still-undesigned case) → a long-running Deployment instead.
- **The Canonical Engine** deploys as either a Deployment (if resolved as its own service, T4 Open Question #2) or is embedded in the Collector SDK's own runtime — not settled here (§2 OQ#4).
- **Horizontal Pod Autoscaling per Engine**, so a Preprocessing backlog (Monitoring §5's "Processing backlog" metric) triggers scale-out on the specific Engine that's behind, without over-provisioning the others (T2 §1.11's "write throughput matters most for the pipeline stages").
- **No ingress except the API layer (T7)** — every other Deployment/Job/CronJob in this table is internal-only, technically enforcing API Principle 5 and CRM Integration §3's "never reads Raw Data Storage, Collectors, or AI Pipeline intermediate stages directly" at the network layer, not just by convention.
- **Service identity per Security §1.3's "service-to-service identity (internal Engines)"** — each Engine authenticates to the next as a distinct machine identity via the cluster's own identity mechanism (e.g. service accounts, mutual TLS between pods) — whether this is scoped per-Engine-type or per-Engine-instance is Security's own unresolved Open Question #13, inherited here (§2 OQ#9).
- **Secrets via the cluster's own secret mechanism** (native Secrets objects or an external secret manager integration) feeding Security §1.5's Secrets Management concept — no specific product chosen (§2 OQ#6).
- **No named mitigation for volume/request-flooding abuse.** Security §1.8's Threat Model explicitly flags that no rate-limiting or DoS mitigation exists anywhere in the Business or Technical Design (T8 Open Question #10) for either a Collector or an external API endpoint. This document names where such a mitigation would technically live — an API gateway or ingress-level rate limiter in front of the API layer (T7), and a per-Collector-Type throttle at the Scheduler (T3 §1.5) — but does not design or mandate one (§2 OQ#7).

---

### 1.5 CI/CD

- **A pipeline entirely separate from the CRM's own build/release process** (Infrastructure Principle 2) — no shared runners, repository, or deployment credentials.
- **Stages: Build → Contract-conformance Test → Image Push → Deploy to Development → promote through Testing → Staging → Production.** The "Contract-conformance Test" stage is not a new testing concept — it runs each package's own already-designed Testing Strategy as an automated gate: Collector SDK §1.10, Canonical Engine §10, AI Pipeline §1.10, API Design §10, and Security §1.9 all independently describe fixture-based, no-live-dependency conformance testing specifically so it can run in a pipeline without standing up the whole Platform.
- **Promotion into Production is gated by Deployment §6's Operational Readiness, made technically concrete:**
  - *Business approval* → a required manual approval step.
  - *Documentation complete* → a manual check that the relevant `docs/` package reflects what's being released.
  - *Monitoring available* → the release must register with the Monitoring Stack (§1.7) before the Production promotion completes.
  - *Traceability verified* → an automated smoke test against a canary Knowledge item, walking Knowledge Store & Graph Technical Design §6's fixed-depth provenance walk (`GET /v1/knowledge/{id}/graph/evidence-chain`, API Design §4, ≤4 hops) end-to-end before promotion.
- **Security Testing (T8 §1.9) runs as its own CI gate** — Authorization deny-path, RBAC role-boundary, Secrets-non-leakage, and Audit Logging completeness checks, distinct from each Engine's own functional conformance tests.
- **Per-Collector-Type pipelines build and deploy independently**, mirroring Collector Framework's "added/removed without affecting others" rule.
- **Rollback = redeploy a prior immutable image tag** (§1.3) — a real technical operation now, still carrying Deployment §11 Open Question #2 forward unresolved: reverting running behavior never retroactively alters Knowledge already Published under a prior, flawed release — that remains a Knowledge Store `Superseded`-state decision (T2 §1.9), not something CI/CD does on its own.
- **Hotfix path** enters the same pipeline at a later stage, never skipping the Production approval gate, consistent with Deployment §5.

---

### 1.6 Backup

- **What is backed up**, per §1.2's storage placement: the relational store (Source, Collector Instance, Canonical Document, Metadata, Taxonomy/Ontology, Evidence, and Knowledge **with its full version chain**, plus Health Status/Business Metric/Alert/Audit Trail Entry records — T2 §1.5), the object/blob store (Raw Data content and Attachments), and the Secrets store (T8 §1.5) — backed up separately and under more restrictive access than the other two.
- **Technical requirements restated from Database Design §1.10 unchanged, not reopened:**
  - *Data integrity* — Raw Data's immutability and append-only guarantee (Raw Data Storage §5) must survive any backup/restore cycle.
  - *Knowledge integrity* — a restore must capture the **full version chain** (`previous_version_id`, T2 §1.9), never a current-state-only snapshot that would silently collapse Superseded history.
  - *Traceability restorable as a whole* — because the Evidence Chain spans the relational store and the object store together (Canonical Document → Raw Data Item's content pointer), a backup must be consistent across both, not restorable to inconsistent points in time per-store.
  - *Audit Trail durability* — Monitoring's Audit Trail Entry and Security's own extension of it (T8 §1.7) must survive the same incident they'd be needed to help diagnose.
- **Backup isolation from Production access** — a compromised Production credential must not also be able to delete the backup target.
- **Frequency, retention window, and tooling are not decided here** — continues, rather than resolves, Database Design §2 Open Question #10, Raw Data Storage §12 Open Question #3, Knowledge Store's own Archival open question, and Monitoring §10 Open Question #4 (§2 OQ#10).

---

### 1.7 Disaster Recovery

- **Gives Deployment §8's Business Continuity concepts a technical shape**, not a redesign:
  - *Service interruption* → a defined DR trigger condition (cluster, region, or dependency outage).
  - *Recovery* → restore the relational store, object store, and Secrets store (§1.6) to a mutually consistent point-in-time, then redeploy the last known-good image tags (§1.3) for every unit in §1.2's table.
  - *Data integrity* / *Knowledge integrity* — the restore path must guarantee no partial/corrupted Raw Data item and no collapsed Knowledge version history, matching §1.6's backup guarantees exactly.
- **Recovery Time Objective and Recovery Point Objective are not set here** — Deployment §11 Open Question #5 already flagged that Recovery has no stated time expectation; this document still doesn't quantify one, since no business-side criticality decision exists yet to quantify against (§2 OQ#11).
- **Multi-region/multi-availability-zone redundancy is not decided** — blocked on the same unresolved question as ownership/hosting (Platform Architecture §17 Open Question #8): a real DR topology can't be sized without knowing who runs this and how critical it's judged to be (§2 OQ#12).
- **A runbook — the step-by-step technical recovery procedure — is named as a required artifact but not written here**; this document states what Recovery must guarantee, not the exact operational steps a responder follows.

---

### 1.8 Monitoring Stack

**Gives Monitoring's (Package 9) business Health Status/Business Metrics/Alerts/Audit Trail, and Security's (T8 §1.7) Audit Logging extension, a technical stack — it does not redefine either:**

- **Metrics** — a Prometheus-compatible metrics pipeline scraping every deployable unit in §1.2's table, populating Database Design §1.5's own **Business Metric Record** rather than inventing a parallel metric system.
- **Health Status** — the same pipeline computes Monitoring §4's four levels (Healthy/Warning/Degraded/Failed) per unit, populating T2's **Health Status Record**, surfaced externally through the already-designed `GET /v1/monitoring/health` (API Design §7).
- **Logging / Audit Trail** — centralized log aggregation feeding T2's **Audit Trail Entry**, surfaced through `GET /v1/monitoring/audit-trail` (T7 §7); Security's own Audit Logging (T8 §1.7) is the same record type carrying security-specific `event_type` values, not a second logging system.
- **Dashboards** — a Grafana-class visualization layer over the Health Status/Business Metric data above, at the business-readable level Monitoring's own Design Principle 3 requires.
- **Alerting** — an Alertmanager-class routing layer turning a Health Status transition into a notification, populating T2's **Alert** record — still not deciding who receives it or at what threshold (Monitoring §10 Open Question #1, #3 remain open).
- **The unmitigated volume-abuse gap (§1.4, Security §1.8 Open Question #10) is observed here, not fixed here** — this Monitoring Stack would *see* a flooding pattern via Processing backlog/Failed collections metrics, exactly as Monitoring §8's own "sudden volume spike" worked example describes, but observing it is not a mitigation; the mitigation, if built, belongs at the API gateway/ingress layer named in §1.4.
- **Monitoring's own availability** — deployed with its own redundancy separate from what it observes, directly addressing Monitoring §10 Open Question #6 ("does Monitoring watch its own failure") at the infrastructure level, though the business answer to that question is still not decided.
- **Kept entirely separate from any CRM-side monitoring**, per Infrastructure Principle 2.

---

## 2. Open Questions

1. **System Architecture (T1) still does not exist.** Eighth independent confirmation, after T2, T3, T4, T5, T6, T7, and T8's two revisions. Not re-raised as a blocker; carried forward unchanged.
2. **Engine deployment granularity.** Inherited unchanged from AI Pipeline (T5) Open Question #8 — is each of the four AI Pipeline Engines one deployable unit, or can an individual stage within one (e.g. `Clean` vs. `DetectLanguage` inside Preprocessing) be deployed/scaled independently? Directly determines §1.3/§1.4's image-and-Deployment count.
3. **Orchestration technology.** Inherited unchanged from AI Pipeline (T5) Open Question #9 — no specific tool, queue, or workflow engine is chosen for the `PipelineOrchestrator` (§1.2, §1.4).
4. **Canonical Engine's deployment boundary.** Inherited unchanged from Canonical Engine (T4) Open Question #2 — is it a library invoked inline by the Collector SDK, or its own deployable service? §1.2–§1.4 propose the latter as a default assumption but do not resolve T4's own open question.
5. **Reasoning Engine's two-phase packaging.** §1.3 packages `linkEvidence` (per-document) and `analyze` (cross-document) as one image with two entry points — a disclosed judgment call, not settled by AI Pipeline (T5) itself, which only establishes that the two phases have different units of work.
6. **Secrets management mechanism.** Inherited unchanged from Security (T8) Open Question #3 — §1.4's "cluster's own secret mechanism" names a category, not a specific product.
7. **No named mitigation for volume/request-flooding abuse.** Inherited unchanged from Security (T8) Open Question #10 — §1.4 and §1.8 name the technical layer (API gateway/ingress, Scheduler-level throttling) where a fix would go, but do not design or mandate one.
8. **Cluster topology.** Namespace isolation per environment (§1.4) vs. fully separate clusters, especially for Production — not decided.
9. **Engine-to-Engine authentication granularity.** Inherited unchanged from Security (T8) Open Question #13 — per-Engine-type or per-Engine-instance service identity (§1.4)?
10. **Backup frequency, retention window, and tooling.** Continues Database Design (T2) Open Question #10, Raw Data Storage §12 Open Question #3, and Monitoring §10 Open Question #4 — §1.6 states only the technical requirements a backup strategy must satisfy.
11. **RTO/RPO targets.** Continues Deployment §11 Open Question #5 — §1.7 names Recovery's integrity guarantees but not its speed, since no business criticality decision exists yet to quantify against.
12. **Multi-region/multi-AZ need.** Blocked on Platform Architecture §17 Open Question #8 (ownership/hosting still undecided) — cannot be sized without knowing who runs this platform and how critical it's judged to be.
13. **Database product selection.** Continues Database Design (T2) Open Question #3 — §1.2 assumes T2's relational-plus-object-store paradigm but names no vendor.

---

Technical Design (Infrastructure) only. No Infrastructure-as-Code, no Dockerfiles, no Kubernetes manifests, no CI/CD pipeline definitions, no cloud provider/vendor selection, no CRM changes, no application code written. Stopping — waiting for Product Owner Review.
