# Jade Intelligence Platform — Master Technical Specification

**Package:** T10 — Master Technical Specification
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Technical Design only. This document merges T1–T9 into a single Technical Source of Truth. It modifies no previous document, invents no new component, resolves no previously-open question, and writes no code — it is a synthesis, not a redesign.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Platform Architecture, 1), `docs/CANONICAL_DATA_MODEL.md` (1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (1.7), `docs/COLLECTOR_FRAMEWORK.md` (2), `docs/SOURCE_REGISTRY.md` (3), `docs/RAW_DATA_STORAGE.md` (4), `docs/PREPROCESSING_PIPELINE.md` (5A), `docs/UNDERSTANDING_PIPELINE.md` (5B), `docs/REASONING_PIPELINE.md` (5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (5D), `docs/KNOWLEDGE_GRAPH.md` (6), `docs/KNOWLEDGE_STORE.md` (7), `docs/CRM_INTEGRATION.md` (8), `docs/MONITORING.md` (9), `docs/DEPLOYMENT.md` (10). None of the sixteen is modified by this document.

**Based on — Technical Design:**

- **`docs/DATABASE_DESIGN.md` (T2)**, **`docs/COLLECTOR_SDK.md` (T3, Revision 2)**, **`docs/CANONICAL_ENGINE.md` (T4)**, **`docs/AI_PIPELINE.md` (T5)**, **`docs/KNOWLEDGE_STORE_AND_GRAPH_TECHNICAL_DESIGN.md` (T6)**, **`docs/API_DESIGN.md` (T7)**, **`docs/SECURITY.md` (T8, Revision 2)**, **`docs/PLATFORM_INFRASTRUCTURE.md` (T9)** — all exist, all treated as LOCKED per this task's instruction (their own headers stay "Draft," unedited, same convention every package of this platform has followed since T2). None of the eight is modified by this document.
- **Two files exist at the same package numbers as the documents above but are superseded drafts, not this platform's current T5/T7 — deliberately not cited as sources:** `docs/AI_PIPELINE_TECHNICAL_DESIGN.md` (an earlier T5 attempt, superseded by `docs/AI_PIPELINE.md` per that file's own header — placed the Preprocessing Engine's input boundary one layer too early, before Canonical Engine/T4 existed) and `docs/JADE_INTELLIGENCE_API_DESIGN.md` (an earlier T7 attempt under an 8-section structure, superseded by `docs/API_DESIGN.md` per that file's own header). Both superseded files are left untouched on disk — not LOCKED documents, so nothing requires deleting or preserving them — and are not treated as inputs to this Master Specification.
- **"System Architecture (T1)" is named in this task as a LOCKED input. Re-checked `docs/` in full immediately before writing this document: it still does not exist anywhere in this repository — no file named or resembling `SYSTEM_ARCHITECTURE.md`, or any "Package T1."** This is now the **ninth** independent confirmation of the same gap, after Database Design (T2), Collector SDK (T3), Canonical Engine (T4), AI Pipeline (T5), Knowledge Store & Graph (T6), API Design (T7), and Security's two revisions (T8). Per the precedent established since T2 — an `AskUserQuestion` on this exact class of gap was tried once this session and the Product Owner's follow-up re-sent the task instruction unchanged rather than supplying T1's content — this document does not re-block a ninth time. **Because this task explicitly asks for a "Technical Architecture Summary" (§2 below), the absence of T1 is not merely carried forward as an open question this time — §2 is this document's disclosed, non-authoritative stand-in for the System Architecture that was never produced, built entirely from what T2–T9 already established about how they fit together.** See Open Question #1 (§10).
- **Naming-label variance, not a blocker, restated once here rather than eight times:** this task calls T6 "Knowledge Platform"; the locked file's own title is "Knowledge Store & Knowledge Graph Technical Design." Treated as the same document throughout, consistent with API Design (T7) and Security (T8)'s own handling of the same variance.

---

## 1. Platform Overview

The Jade Intelligence Platform is a pipeline system that collects jade/jewelry market information from many external sources — public Facebook Groups, industry websites, RSS feeds, PDF reports, manual staff submissions, and (optionally, read-only) the CRM itself — normalizes it into one universal Canonical Document shape, runs it through a four-stage AI Processing Layer, and produces traceable, versioned Knowledge that a Knowledge Store and Knowledge Graph make queryable (Platform Architecture §4–§11).

**It is not a CRM module.** It is an independent platform: its own codebase, its own four deployment environments (T9 §1.2, Deployment §4), its own database (T2 §1.4), never sharing a cluster, registry, secrets store, or on-call rotation with `crm-thubinh` (Infrastructure Principle 2). CRM Integration (Package 8, T7 §6) is the one designed connection point, and it is deliberately weak: pull-only, read-only, one-directional, per-module opt-in, and the Platform must remain fully useful with the CRM entirely absent (Platform Architecture Principle 4).

**Core principles carried through every layer of this Specification**, restated once here rather than in each section below:
1. Collectors are pluggable; the CRM never depends on a specific one (Platform Architecture §3; Collector SDK §1.9).
2. Traceability is unbroken from Knowledge back to Source — Knowledge → Evidence → Canonical Document → Raw Source → Collector → Collection Time (Evidence & Provenance Model §9; Database Design §1.1 Principle 3) — designed as a referential-integrity property, not a documentation promise.
3. Nothing is silently overwritten where traceability depends on it — Raw Data is append-only; Canonical Documents, Evidence, and Knowledge all version rather than mutate (Database Design §1.1 Principles 1–2, §1.9).
4. Knowledge Generation is the platform's sole writer of Knowledge — enforced at the interface level (T5 §1.5; T6 §1), not merely by convention.
5. Every layer is additively extensible — a new Collector Type, Source Type, or Entity Type requires no breaking change anywhere upstream (Database Design §1.1 Principle 5; Collector SDK §1.9; API Design Principle 8).
6. No storage technology, AI model/vendor, or infrastructure product is chosen anywhere in the Business or Technical Design (Platform Architecture §16; Database Design §1.4; Security §1.5–§1.6; Infrastructure §1.4).

**Two flagged naming collisions worth restating once at the top level, both non-blocking, both already noted individually across the design trail:**
- **"Jade Intelligence Platform"** (this system) shares its name with the CRM's own, already-LOCKED-and-live **"Jade Intelligence"** module (the customer-product recommendation engine on Customer Detail, formerly "AI Jade") — two unrelated systems, same name (Platform Architecture §17 Open Question #1). Unresolved.
- **"Knowledge"** appears as a Taxonomy Entity Type (Taxonomy & Ontology §4), a Platform component (Knowledge Store, Knowledge Graph), and a separate, already-built CRM module (`docs/KNOWLEDGE_VAULT_SPEC.md`) — three unrelated uses of one word (Taxonomy & Ontology's own Open Question #4). Unresolved.

**Eight Future Modules remain roadmap-only, undesigned at any technical layer:** Supplier/Mine/Pricing/Customer/Auction Intelligence, Knowledge Vault (Platform's own, distinct from the CRM module above), API, Mobile App (Platform Architecture §15).

---

## 2. Technical Architecture Summary

**This section is explicitly not System Architecture (T1) — that document was never produced (see header).** What follows is a disclosed synthesis of how T2–T9 already describe themselves fitting together, assembled here for the first time as a single picture rather than eight separate ones. It resolves nothing T2–T9 left open; it only states what is already implied consistently across all eight.

**Layered shape, five layers, one direction (Platform Architecture §6):**

```
Source Registry (3) ─┐
                      ├─▶ Collector SDK (T3) ─▶ Canonical Engine (T4) ─▶ [Hand-off]
Collector Framework(2)┘
                                                                            │
                        ┌───────────────────────────────────────────────────┘
                        ▼
        AI Pipeline (T5): Preprocessing → Understanding → Reasoning → Knowledge Generation
                        │
                        ▼
        Knowledge Store & Knowledge Graph (T6)  ◀── one relational store (T2), no second graph datastore
                        │
                        ▼
        API Layer (T7): Collector / Knowledge / Search / CRM Integration / Monitoring APIs
                        │
                        ▼
        CRM Integration (8) — optional, pull-only, read-only    Monitoring (9) — cross-cutting observer
```

Cross-cutting, not a layer of their own: **Database Design (T2)** underlies every layer above as the system of record; **Security (T8)** enforces identity/authorization/secrets/audit at the API boundary and every Engine-to-Engine hop; **Infrastructure (T9)** carries every component above onto deployable units across four isolated environments.

**Component inventory, one row per deployable unit (T9 §1.2's Deployment Architecture table, restated as this Specification's own):**

| # | Component | Technical Source | Role |
|---|---|---|---|
| 1 | Collector Type implementations | Collector SDK (T3) §1.2 | Acquisition + normalization only, never AI analysis (Collector Framework Design Principle 2; SDK Principle 3) |
| 2 | Collector Registry | T3 §1.4 | Bookkeeping of Collector *instances* |
| 3 | Scheduler | T3 §1.5 | Triggers Collector executions (Manual/Scheduled/Event-driven/Continuous) |
| 4 | Canonical Engine (Validation, Mapping, Metadata, Attachment, Identity Resolution) | Canonical Engine (T4) §3–§7 | Source-Type-blind; finishes what a Collector's `normalize()` starts, produces a Hand-off-ready Canonical Document |
| 5 | Preprocessing Engine | AI Pipeline (T5) §1.2 | Validate → Clean → DetectLanguage → Normalize(content) → DetectDuplicate; stateless, single-document |
| 6 | Understanding Engine | T5 §1.3 | Language Understanding → Entity/Relationship Extraction → Topic → Classification → Sentiment → Summarization; stateless, single-document |
| 7 | Reasoning Engine (two phases) | T5 §1.4 | Phase 1 `linkEvidence` (per-document) → persisted Evidence; Phase 2 `analyze` (cross-document, triggered) → Trends/Signals/Risks/Opportunities |
| 8 | Knowledge Generation Engine | T5 §1.5 | The platform's sole writer of Knowledge; ValidateEvidence → AssignConfidence → ReviewConflicts → Create/Version → Publish |
| 9 | Pipeline Orchestrator | T5 §1.7 | Decides *when* Engines 5–8 run; technology not chosen |
| 10 | Knowledge Store / Knowledge Graph Engine | Knowledge Store & Graph (T6) §1, §7 | One read/write service; the Graph has no storage of its own — relational joins over T2's tables |
| 11 | API layer | API Design (T7) §3–§7 | The **only** deployable unit with external ingress (Infrastructure Principle 4) |
| 12 | Security services | Security (T8) §1.2, §1.4, §1.5, §1.7 | Principal Registry (proposed), Authorization, Secrets Management, Audit Logging — cross-cutting |
| 13 | Monitoring Stack | Monitoring (9); T2 §1.5's Health Status/Business Metric/Audit Trail records | Cross-cutting observer over every row above |

**Data model backbone (Database Design T2 §1.5), the one schema every component above reads or writes against:** Source → Collector Instance → Raw Data Item → Canonical Document (→ Attachment, → Metadata Entry) → Evidence (→ Evidence–Knowledge Link) → Knowledge (versioned via `previous_version_id`, → Knowledge–Entity Link) → Entity Instance (→ Entity Type, → Synonym, → Relationship Instance → Relationship Type), plus Health Status / Business Metric / Alert / Audit Trail records. Two complementary storage paradigms recommended, not a product: a relational system of record, plus separate object/blob storage for Raw Data bulk content (T2 §1.4).

**What this synthesis deliberately does not do:** it does not choose a database product, AI vendor, orchestration technology, authentication mechanism, or cloud provider — every one of those remains open exactly as T2–T9 individually left it (rolled up in §10). It does not resolve the Canonical Engine's own deployment boundary (library vs. service, T4 Open Question #2) or any other cross-package ambiguity — those are named, not settled, in §10.

---

## 3. End-to-End Data Flow

One document's full journey, source to queryable Knowledge, citing the exact contract at each hop:

1. **Source registration.** A Source (a specific Facebook Group, website, PDF library, etc.) is Proposed → Approved → Active in the Source Registry (Package 3) before any Collector points at it.
2. **Discovery.** The Scheduler (T3 §1.5) triggers a Collector instance; `discover(sourceConfig, discoveryState)` (T3 §1.2) returns newly-available items — an empty list is a normal outcome, not an error.
3. **Collection.** `collect(item)` (T3 §1.2) returns raw, source-native content unmodified — Raw Data Storage's immutability guarantee begins the instant this returns, and corresponds to a Raw Data Item record (T2 §1.5).
4. **Normalization (Collector-side).** `normalize(rawContent, sourceContext)` (T3 §1.2) produces a candidate Canonical Document using that Source Type's Mapping Profile (T4 §4).
5. **Canonical Engine processing (T4 §8).** Validate (§3, structural conformance) → Confirm Mapping (§4) → Attach Metadata (§5) → Attach Attachments (§6) → Resolve Identity (§7, exact/structural duplicate or re-collection check) → a Hand-off-ready Canonical Document with `lifecycle_status = Normalized`.
6. **Hand-off (T3 §1.3 step 5).** The SDK — never the Collector — delivers the Canonical Document and its Raw Data Item to the Raw Data Store and Canonical Document Store (T2 §1.3).
7. **Preprocessing Engine (T5 §1.2).** Validate (AI-readiness, distinct from T4's structural check) → Clean → DetectLanguage → Normalize(content presentation) → DetectDuplicate (fuzzy, complementing T4's exact match) — returns the same document, now AI-ready.
8. **Understanding Engine (T5 §1.3).** Language Understanding → Entity Recognition (against the Taxonomy & Ontology Store, T2 §1.3) → Relationship Extraction → Topic Detection → Classification → Sentiment Analysis → Summarization → `StructuredUnderstanding` (a hand-off, never persisted, T2 §1.2).
9. **Reasoning Engine, Phase 1 (T5 §1.4, `linkEvidence`).** Converts `StructuredUnderstanding` into a persisted `Evidence` record (T2 §1.5) — the point content becomes durable and queryable.
10. **Reasoning Engine, Phase 2 (T5 §1.4, `analyze`, triggered separately over an accumulated `EvidenceSet`).** Cross-document Analysis → Relationship Discovery → Trend/Market Signal/Risk/Opportunity Detection → `ReasoningOutput` (hand-off only).
11. **Knowledge Generation Engine (T5 §1.5).** `propose()` fans a `ReasoningFinding` out into zero, one, or many `KnowledgeCandidate`s; `process()` runs ValidateEvidence → AssignConfidence (no formula chosen) → ReviewConflicts (never auto-resolved) → Create/Version (never in-place mutation) → Publish (a separate call) — the platform's only path to writing a `Knowledge` row.
12. **Knowledge Store (T6 §1–§2).** Holds the published Knowledge, its full version chain, and its Evidence links — "current" is always computed, never a stored flag.
13. **Knowledge Graph (T6 §4–§7).** Not a second store — a traversal layer over the same relational rows, exposing the fixed-depth provenance walk (Knowledge → Evidence → Canonical Document → Raw Data Item → Source, ≤4 hops) and variable-depth related-Knowledge/Entity exploration (default depth 1).
14. **API layer (T7 §4–§7).** Exposes Knowledge/Search/CRM Integration/Monitoring reads over the Store and Graph — read-only everywhere except one endpoint, `POST /v1/manual-imports` (T7 §3.2), which re-enters this same flow at step 4 as a Manual Import Collector Type execution, never bypassing any stage above it.
15. **CRM Integration (Package 8; T7 §6), optional.** A CRM module, authorized as its own Principal (T8 §1.3–§1.4), pulls from the API layer on its own schedule — the Platform never pushes, and every CRM-facing read stops at the Knowledge Store/Graph boundary, never reaching Raw Data, a Collector, or an AI Pipeline intermediate stage directly (API Principle 5).
16. **Monitoring (Package 9), cross-cutting throughout.** Every stage above emits Health Status, Business Metrics, and Audit Trail observations (T2 §1.5) — Monitoring only ever observes; it never performs collection, AI processing, or a business decision.

**Two boundaries in this flow are explicitly unresolved, not glossed over:** the exact-match/structural duplicate check at step 5 (T4 §7) versus the fuzzy duplicate check at step 7 (T5 §1.2) was never confirmed by any Business Design document to be non-overlapping (T4 Open Question #3, carried into T5 Open Question #10). And what fires step 10's `analyze()` trigger — schedule, Evidence-volume threshold, or manual action — is undecided (T5 Open Question #4).

---

## 4. Component Dependencies

Directed dependencies only — "A depends on B" means A cannot function without B already having produced its contract's output. Cross-cutting components (Database, Security, Monitoring, Infrastructure) are listed separately since nearly everything depends on them.

| Component | Depends on | Notes |
|---|---|---|
| Collector Type implementations (T3 §1.2) | Source Registry (3), Collector Registry (T3 §1.4), Scheduler (T3 §1.5) | A Source must be Approved before a Collector is registered against it |
| Canonical Engine (T4 §3–§8) | Collector Type's `normalize()` output (T3 §1.2) | Never receives Raw Data directly |
| Preprocessing Engine (T5 §1.2) | Canonical Engine's Hand-off (T4 §8) | Never re-does T4's structural validation |
| Understanding Engine (T5 §1.3) | Preprocessing Engine's output (T5 §1.2); Taxonomy & Ontology Store (T2 §1.3) | Entity/Relationship recognition reads Taxonomy as a fixed lookup, never writes to it |
| Reasoning Engine Phase 1 (T5 §1.4) | Understanding Engine's `StructuredUnderstanding` (T5 §1.3) | Chained immediately, no independent trigger |
| Reasoning Engine Phase 2 (T5 §1.4) | Accumulated `EvidenceSet` from Phase 1 (T2 Evidence Store) | Own trigger cadence, not chained per-document |
| Knowledge Generation Engine (T5 §1.5) | Reasoning Engine Phase 2's `ReasoningOutput` (T5 §1.4) | Sole writer of Knowledge — no other component may substitute |
| Knowledge Store / Graph Engine (T6 §1, §7) | Knowledge Generation Engine's writes (T5 §1.5); T2's relational schema | Graph traversal has no separate datastore dependency |
| API layer (T7 §3–§7) | Knowledge Store/Graph (T6), Collector SDK's Registry/Scheduler (T3 §1.4–§1.5, catalogued not redesigned), Monitoring records (T2 §1.5) | The only component with external ingress |
| CRM Integration (8; T7 §6) | API layer (T7 §4–§5) exclusively | Never reaches any earlier component directly (API Principle 5) |
| Pipeline Orchestrator (T5 §1.7) | Every AI Pipeline Engine (T5 §1.2–§1.5) | Decides *when*, not *what* — no business logic of its own |
| Monitoring Stack (9; T9 §1.8) | Every component above | Read-only observer; nothing depends on Monitoring for correctness, only for visibility |
| Security services (T8) | API layer (enforcement point, T7 §2), every Engine-to-Engine hop (service identity, T8 §1.3) | Cross-cutting; every component's write/read path is subject to Authorization (T8 §1.4) |
| Database Design (T2) | — (foundational) | Every component above reads or writes against T2 §1.5's record types; nothing in this platform has a dependency T2 does not ultimately underlie |
| Infrastructure (T9) | Every component above | Carries, does not gate — a component's *logical* dependency (this table) is fixed regardless of which Infrastructure shape (T9 §1.2–§1.4) eventually hosts it |

**No cyclic dependency exists in this table** — restates Platform Architecture §6 and AI Pipeline Principle 1's "one direction" as a structural property of the dependency graph itself, not merely a description of intended data flow.

---

## 5. Cross-Cutting Concerns

**Traceability.** The chain Knowledge → Evidence → Canonical Document → Raw Data Item → Collector → Source (Evidence & Provenance Model §9) is designed as an enforceable reference path (Database Design §1.1 Principle 3), walkable as an actual graph traversal (T6 §6), and re-verified as a release gate (T9 §1.5 — a canary Knowledge item's evidence chain is smoke-tested before every Production promotion).

**Versioning.** Uniform across every layer that carries history: Raw Data is append-only and never edited (Raw Data Storage §5); Knowledge never updates in place — a new version links to its predecessor via `previous_version_id`, and "current" is always a query, never a stored flag (T2 §1.9, restated unchanged by T6 §2 and T5 §1.8). Source attribute changes and Entity Instance renames are flagged as likely needing the same discipline but are not yet designed (T2 Open Question #8).

**Extensibility.** A new Collector Type requires exactly three steps — implement the Collector Interface, register an instance, assign a schedule — and nothing else; it never requires a change to the AI Pipeline, Knowledge Store, or CRM Integration contracts (T3 §1.9). The same additive discipline is restated independently by Database Design (§1.1 Principle 5), Canonical Engine (Principle 1), and API Design (Principle 8) — four packages converging on one rule without any one of them depending on the others to state it.

**Security.** Contracts-first: API Design (T7) §2 defines `authenticate()`/`authorize()`; Security (T8) fills in Identity Management, a Role/Action table, Secrets lifecycle, Data Protection, Audit Logging, a Threat Model, and Incident Response on top of that same contract, without forking a second one (T8 Principle 1). The Knowledge Store's sole-writer rule and Raw Data's immutability are both restated as security boundaries already enforced one layer down, not re-invented (T8 Principles 2–3).

**Observability.** Every Collector execution, Engine boundary, and API call is expected to emit the minimum event shape Monitoring needs (T3 §1.8's `CollectorLogEvent`; T2 §1.5's Health Status/Business Metric/Audit Trail records) — Monitoring itself never performs collection, processing, or a business decision, only observes and surfaces (Monitoring Design Principle, restated by Infrastructure §1.8).

**Independence from the CRM.** Restated at every layer rather than centralized in one: separate database (T2 §1.1 Principle 9), separate deployment environments (T9 §1.2), separate CI/CD (T9 §1.5), separate registry/build artifacts (T9 §1.3), separate monitoring (T9 §1.8), pull-only/read-only/optional integration (CRM Integration §3, API Design §6.1).

**Technology-agnosticism.** No package in the Technical Design (T2–T9) names a database product, AI model/vendor, message queue, API gateway, identity provider, encryption library, or cloud provider — every one of these is either a paradigm-level recommendation (T2 §1.4's relational-plus-object-store shape) or an explicitly named open question (§10 below).

---

## 6. Deployment Summary

Restates Infrastructure (T9) at Specification level — not a redesign, a summary of what T9 already establishes:

- **Four fully isolated environments** (Development / Testing / Staging / Production, Deployment §4), each with its own complete instance of every deployable unit and datastore in §2's component table — never shared or synchronized with the CRM's own environments, and never shared across each other (T9 §1.2).
- **One image family per deployable unit** (T9 §1.3) — a new Collector Type ships as a new image, never a modification to an existing one; multi-stage builds with no Secrets baked in; immutable, versioned tags, which is what makes Rollback an actual redeploy rather than a rebuild.
- **Kubernetes shape (T9 §1.4):** stateless Deployments with Horizontal Pod Autoscaling for Preprocessing, Understanding, Reasoning Phase 1, the Knowledge Store/Graph Engine, and the API layer; a distinct, trigger-fronted shape for Reasoning Phase 2 and Knowledge Generation (write-ownership matters more than raw scale there); Jobs/CronJobs for Collector executions, mapped directly onto Scheduler triggers; no ingress anywhere except the API layer.
- **CI/CD (T9 §1.5):** Build → Contract-conformance Test (each package's own already-designed Testing Strategy run as an automated gate) → Image Push → Deploy → promote Development → Testing → Staging → Production, gated by Deployment §6's Operational Readiness made technically concrete (business approval, documentation check, Monitoring registration, and an automated traceability smoke test).
- **Backup and Disaster Recovery (T9 §1.6–§1.7):** the relational store, object store, and Secrets store are backed up separately, with Knowledge's full version chain and Raw Data's immutability guarantee both required to survive any restore; RTO/RPO are explicitly not set.
- **Monitoring Stack (T9 §1.8):** a metrics/health/logging/dashboard/alerting stack populating T2's own Health Status, Business Metric, and Audit Trail records — not a parallel system — deployed with its own redundancy, separate from what it observes.
- **No cloud provider, hosting vendor, or specific product is chosen anywhere in this summary** — consistent with every source document it restates.

---

## 7. Operational Lifecycle

Ties Deployment (Package 10)'s business-level Release Management and Business Continuity concepts to T9's technical mechanisms, without redesigning either:

- **Release types (Deployment §5):** Initial, Incremental, Hotfix, Rollback. Technically, every type enters the same CI/CD pipeline (§6 above); a Hotfix never skips the Production approval gate (T9 §1.5); a Rollback is a redeploy of a prior immutable image tag (T9 §1.3, §1.5).
- **The Rollback gap, restated once at Specification level because it recurs across three packages:** reverting Pipeline behavior going forward does **not** automatically correct or Supersede Knowledge already Published under a flawed release (Deployment §11 Open Question #2, confirmed still open at the technical layer by T9 §1.5 — "that remains a Knowledge Store `Superseded`-state decision, not something CI/CD does on its own").
- **Operational Readiness (Deployment §6), made technically concrete by T9 §1.5:** Business approval (manual gate) → Documentation complete (manual check against `docs/`) → Monitoring available (must register with the Monitoring Stack before promotion completes) → Traceability verified (automated canary evidence-chain smoke test, ≤4 hops, T6 §6).
- **Business Continuity (Deployment §8) → Disaster Recovery (T9 §1.7):** Service interruption maps to a defined DR trigger; Recovery restores the relational store, object store, and Secrets store to a mutually consistent point-in-time, then redeploys last-known-good image tags; Data integrity and Knowledge integrity both carry the same no-corruption, no-collapsed-version-history guarantee through a restore that Backup (T9 §1.6) already requires.
- **Change Management (Deployment §7)** extends this platform's own "never silently modify a previous package" discipline to its running state — the same discipline this Master Specification itself follows toward T1–T9.
- **Incident Response (T8 §1.10)** is folded into the same lifecycle rather than a separate process: Detection reuses Audit Logging anomalies and Monitoring Health Status changes; Containment reuses Principal Deprovisioning (T8 §1.2) and Secret Revocation (T8 §1.5); Recovery is treated as a form of Service interruption, not a separate mechanism.

---

## 8. Traceability Matrix

**Business Design → Technical Design.** Every Business Design package's primary technical realization(s), so a reviewer can confirm nothing was designed twice and nothing was left un-realized:

| Business Design Package | Technical Realization | Primary Artifact |
|---|---|---|
| 1 — Platform Architecture | §2 above (synthesis); every T-package's own Principles section | Component inventory, layering |
| 1.5 — Canonical Data Model | Canonical Engine (T4) §2; Database Design (T2) §1.5 | Canonical Document Contract |
| 1.6 — Taxonomy & Ontology | Database Design (T2) §1.5 (Entity Type/Instance/Category/Synonym/Relationship); Understanding Engine (T5 §1.3) | Taxonomy & Ontology Store |
| 1.7 — Evidence & Provenance Model | Database Design (T2) §1.5 (Evidence, Evidence–Knowledge Link); Reasoning Engine `linkEvidence` (T5 §1.4) | Evidence Chain, persisted |
| 2 — Collector Framework | Collector SDK (T3) in full | Collector Interface, Lifecycle |
| 3 — Source Registry | Database Design (T2) §1.5 (Source); referenced throughout T3, T8 | Source record, Trust Level |
| 4 — Raw Data Storage | Database Design (T2) §1.3–§1.4 (object/blob store); Collector SDK §1.2's `collect()` | Raw Data Item, immutability |
| 5A — Preprocessing Pipeline | AI Pipeline (T5) §1.2 | Preprocessing Engine |
| 5B — Understanding Pipeline | AI Pipeline (T5) §1.3 | Understanding Engine |
| 5C — Reasoning Pipeline | AI Pipeline (T5) §1.4 | Reasoning Engine (two phases) |
| 5D — Knowledge Generation Pipeline | AI Pipeline (T5) §1.5 | Knowledge Generation Engine |
| 6 — Knowledge Graph | Knowledge Store & Graph (T6) §4–§7 | Graph node/relationship/traversal design |
| 7 — Knowledge Store | Knowledge Store & Graph (T6) §1–§3 | KnowledgeStoreEngine |
| 8 — CRM Integration | API Design (T7) §6; Security (T8) §1.3 (CRM Integration Principal) | CRM Integration APIs |
| 9 — Monitoring | Database Design (T2) §1.5; Infrastructure (T9) §1.8 | Monitoring Stack |
| 10 — Deployment | Infrastructure (T9) in full; §6–§7 above | Environments, CI/CD, DR |

**Technical Design → Technical Design.** Every T-package's primary consumer(s) among the others, showing the design chain is fully connected end to end:

| Package | Consumed by |
|---|---|
| T2 — Database Design | T3, T4, T5, T6, T7, T8, T9 (every package reuses T2's record types by reference) |
| T3 — Collector SDK | T4 (validates its `normalize()` output), T7 (catalogs its interfaces as Internal APIs), T9 (Jobs/CronJobs mapping) |
| T4 — Canonical Engine | T5 (Preprocessing Engine's actual input boundary), T7 (catalogs its sub-engines), T9 |
| T5 — AI Pipeline | T6 (write boundary), T7 (catalogs its Engines), T9 (primary deployment/scaling subject) |
| T6 — Knowledge Store & Graph | T7 (Knowledge/Search API design built directly on T6 §3/§6/§7) |
| T7 — API Design | T8 (extends its Authentication Contract), T9 (the one component with external ingress) |
| T8 — Security | T9 (Secrets/Identity/Data Protection as technical requirements) |
| T9 — Infrastructure | This document (§6–§7) |

**Full traceability chain (data level), for cross-reference back to §3:** Source → Collector Instance → Raw Data Item → Canonical Document → Evidence → Knowledge → (Knowledge Graph traversal) → API response → CRM/Operator consumer. Every arrow in this chain is a named, enforceable reference in T2 §1.5–§1.6, not a documentation-only promise (Database Design §1.1 Principle 3).

---

## 9. Architecture Decision Record Summary

Every ADR below is a **disclosed judgment call already made inside T2–T9**, restated here as a named decision with its status — this section adds no new decision of its own.

| # | Decision | Status | Rationale | Source |
|---|---|---|---|---|
| ADR-1 | Relational database as system of record + separate object/blob store for Raw Data; no dedicated graph database | Proposed (paradigm-level, no vendor) | Traceability needs referential integrity; Raw Data needs immutable, unbounded, cheap bulk storage; graph traversal is affordable as relational joins at current, pre-launch scale | T2 §1.4 |
| ADR-2 | Knowledge Graph is a navigation layer, not a second store | Decided | Avoids duplicating storage of Evidence/Knowledge/Entity/Source data that already lives in the relational store | Business Design (Knowledge Graph §9); confirmed at schema level by T2 §1.4, T6 §4 |
| ADR-3 | One `Knowledge` row per version, linked via `previous_version_id`; "current" is computed, never stored | Decided | Matches the platform-wide never-overwrite discipline; avoids a second, driftable "is current" flag | T2 §1.5, §1.9; T6 §2 (an earlier T6 draft's separate item-header record proposal was explicitly withdrawn in favor of this) |
| ADR-4 | Canonical Engine is a distinct, shared, Source-Type-blind component sitting between a Collector's `normalize()` and Hand-off | Proposed, boundary unresolved | T3 named only that "the SDK validates" — T4 makes this concrete but whether it is a library or a separate service is unresolved | T4 header, Engine Principle 1; open at T4 Open Question #2, T9 Open Question #4 |
| ADR-5 | AI Pipeline is four Engines, one direction: Preprocessing → Understanding → Reasoning → Knowledge Generation | Decided | Matches Business Design 5A→5B→5C→5D exactly; each Engine enforces its Pipeline's already-locked boundary rather than reinterpreting it | T5 §1.1 Principle 1–2 |
| ADR-6 | Reasoning Engine technically splits into two phases (`linkEvidence` per-document, `analyze` cross-document) with different trigger cadences | Decided | 5C's own single business-level Pipeline has two genuinely different units of work at the technical layer | T5 §1.4 |
| ADR-7 | Reasoning's two phases are packaged as one image with two entry points, not two separate images | Proposed, disclosed judgment call | Both are the same Engine's own contract; not settled by T5 itself | T9 §1.3, Open Question #5 |
| ADR-8 | Identity Resolution (Canonical Engine, exact/structural) and Duplicate Detection (Preprocessing Engine, fuzzy) are complementary, not overlapping | Proposed, not confirmed | No Business Design document ever explicitly drew this line | T4 §7, Open Question #3; restated unresolved at T5 §1.2, Open Question #10 |
| ADR-9 | Security extends API Design (T7)'s Authentication Contract; it does not fork a second one | Decided | One `Principal`/`authorize()` shape platform-wide, extended with additional Roles/Actions for the internal governance surface T7 never needed to cover | T8 §1.1 Principle 1 |
| ADR-10 | No `Write` Action exists on the Knowledge Store's Authorization surface — structurally absent, not merely denied | Decided | Makes the sole-writer rule (T5 §1.5) an access-control guarantee, not a convention every caller is trusted to follow | T8 §1.4 |
| ADR-11 | Default variable-depth graph traversal limit is 1 hop, deeper traversal is opt-in | Proposed, not confirmed | Direct technical answer to Knowledge Graph §12 Open Question #2 (Context boundary); no traversal-scale data exists yet to justify a larger default | T6 §6, Open Question #5 |
| ADR-12 | Store lookup is the entry point; graph traversal is an optional follow-on, not stitched together by every caller | Proposed | Resolves Knowledge Store §12 Open Question #4 as a pattern, not a mandate | T6 §7 |
| ADR-13 | One image family per deployable unit; immutable, versioned tags | Decided | The only mechanism that makes Rollback a redeploy rather than a rebuild | T9 §1.3 |
| ADR-14 | Environment isolation via namespaces at minimum, one full component-table instance per environment | Decided (baseline); physically separate clusters for Production unresolved | Matches Deployment §4's four-environment isolation requirement | T9 §1.4, Open Question #8 |

---

## 10. Remaining Open Questions

**This is a consolidated, deduplicated view across all sixteen Business Design and eight Technical Design packages — not a re-listing of every individual open question (roughly 80 across T2–T9 alone).** Each row below folds multiple packages' independently-raised versions of the same gap into one entry, citing every package that raised it. The unabridged, package-specific lists remain each document's own authoritative record.

1. **System Architecture (T1) does not exist.** Named as a LOCKED input in this task and in T2 through T9; confirmed absent a ninth time by this document. If ever produced, every one of T2–T10 should be checked against it for consistency — this document does not substitute for it beyond §2's disclosed synthesis. *(T2 OQ1, T3 OQ1, T4 OQ1, T5 OQ1, T6 OQ1, T7 OQ1, T8 OQ1, T9 OQ1)*
2. **No mitigation exists anywhere in this design for volume/request-flooding abuse**, against either a Collector or an external API endpoint — a genuine, previously-undiscovered gap first surfaced at the Security layer. Monitoring would observe the effect; nothing prevents it. *(T8 §1.8, OQ10; T9 §1.4, §1.8, OQ7)*
3. **Metadata representation is undecided** — schema-less document field vs. a separate key-value table. *(T2 OQ4; T4 §5, OQ4)*
4. **Raw Data Item ↔ Canonical Document cardinality is unconfirmed** — assumed 1:1 throughout, but never confirmed; if 1:many, several downstream contracts (Canonical Document Contract, Graph traversal, provenance walk) need to become fan-out-aware. *(Raw Data Storage §12 OQ1; T2 OQ5; T4 §2; T6 OQ6)*
5. **Knowledge Item identity across versions is ambiguous at the API boundary.** T2 has no item-level record — only a version chain — so whether an external `knowledgeId` means "the root version" or "any version, resolved to current" is undefined, a concrete gap between an already-written external contract (T7) and the schema (T2) it assumes. *(T6 OQ2; API Design OQ7)*
6. **"Find by Topic" has no backing field.** Knowledge Store names it as a capability; Topic Detection's output is never durably stored except as it becomes Evidence or a Candidate. *(T6 §3, OQ3)*
7. **Entity Instance storage is undesigned at any layer** — `GET /v1/entities/{entityInstanceId}/knowledge` assumes storage that no package actually specifies. *(T6 §8 OQ1, inherited unresolved by API Design OQ3)*
8. **No database product, secrets-management product, or authentication mechanism is chosen anywhere.** Paradigm-level recommendations exist (T2 §1.4); nothing else does. *(T2 OQ3; T7 OQ4; T8 OQ3–4; T9 OQ6, OQ13)*
9. **No orchestration technology is chosen** for the Pipeline Orchestrator, and Engine deployment granularity (one unit per Engine vs. per-stage) is undecided. *(T5 OQ8–9; T9 OQ2–3)*
10. **Retention, partitioning, and backup frequency/tooling are all provisional**, pending a business-level retention policy that does not yet exist. *(Raw Data Storage §12 OQ3; Knowledge Store §12 OQ7; T2 OQ6, OQ10; T9 OQ10)*
11. **Retry safety for `analyze()` and `process()` (Reasoning Phase 2, Knowledge Generation) is not established** — both are stateful/write operations where a naive retry could duplicate effects. *(T5 §1.9, OQ7)*
12. **In-flight, ephemeral hand-off state (`StructuredUnderstanding`, `ReasoningOutput`) has no defined recovery behavior** if an Orchestrator invocation fails after it is produced but before it converts to durable state. *(T5 §1.8, OQ11)*
13. **Which CRM modules are actually authorized to call CRM Integration APIs is undecided**, and three CRM modules (Reports, Market Intelligence, Knowledge Vault) currently conflict outright with their own locked specs and cannot consume this Platform without a CRM-side spec revision. *(CRM Integration §5, §11 OQ1–2; API Design OQ10)*
14. **Manual Import authorization is unresolved** — who may submit, and whether any approval step precedes normalization. *(Collector Framework §12 OQ6; T7 OQ11; T8 OQ12)*
15. **Role assignment authority is undecided** — Roles exist (T8 §1.4); who grants them does not. *(T8 OQ5)*
16. **Principal Registry has no confirmed home as a T2 record type.** Proposed structurally analogous to the Collector/Source Registries; not confirmed against Database Design. *(T8 OQ2)*
17. **RTO/RPO, multi-region/multi-AZ redundancy, and cluster topology are all unset**, blocked on an unresolved platform-ownership/hosting decision. *(Platform Architecture §17 OQ8; Deployment §11 OQ5; T9 OQ8, OQ11–12)*
18. **The Rollback-vs-Published-Knowledge gap remains open**: reverting a release never automatically corrects or Supersedes Knowledge already Published under the flawed release. *(Deployment §11 OQ2; T9 §1.5)*
19. **Canonical Engine's own deployment boundary is unresolved** — library inside the Collector SDK, or a separate deployable service. *(T4 OQ2; T9 OQ4)*
20. **Identity Resolution vs. Duplicate Detection's division of labor was never confirmed by any Business Design document.** *(T4 §7, OQ3; T5 §1.2, OQ10)*
21. **Personal-data handling for incidental third-party data in collected content remains unresolved**, inherited from the earliest Business Design package and still open at the Security/Data Protection layer. *(Platform Architecture §17 OQ2; T8 §1.6, OQ6)*
22. **Search APIs' relationship to Knowledge APIs, and whether free-text/keyword search is even a wanted capability, is undecided** — no locked document names full-text search as a requirement. *(API Design §5, OQ6)*

---

## 11. Technical Design Completion Statement

**Business Design phase: complete.** All sixteen packages (Platform Architecture through Deployment) exist, each Draft Revision 1 (or, for Package 5, split A–D), each treated as LOCKED by explicit Product Owner task-instruction per the convention established since Package 1.6 — none edited by this document.

**Technical Design phase: functionally complete, with one confirmed, unresolved gap.** Eight of the nine named Technical Design packages exist and are internally consistent with each other and with the Business Design beneath them:
- T2 Database Design, T3 Collector SDK (Revision 2), T4 Canonical Engine, T5 AI Pipeline, T6 Knowledge Store & Knowledge Graph, T7 API Design, T8 Security (Revision 2), T9 Infrastructure — all present, all cross-referenced correctly, all independently confirming the same T1 gap without contradiction.
- **T1 System Architecture does not exist anywhere in this repository — confirmed independently nine times (once by each of T2–T9, and again by this document).** This Master Specification's §2 is a disclosed, non-authoritative synthesis offered in its place; it is not a substitute for a Product-Owner-approved System Architecture document, and every technical statement in this Specification traces to T2–T9 directly, never to §2 as its own source of authority.

**This document's own scope, restated exactly:** it merges T2–T9 (plus the sixteen Business Design packages beneath them) into one Technical Source of Truth. It introduces no new component, chooses no technology this platform's design trail had not already left open, and resolves none of the roughly eighty open questions rolled up in §10 — every one of them remains exactly as open as its source package left it. Two superseded draft files (`docs/AI_PIPELINE_TECHNICAL_DESIGN.md`, `docs/JADE_INTELLIGENCE_API_DESIGN.md`) were identified and deliberately excluded as sources, consistent with T5 and T7's own handling of them.

**No code exists. No database has been created. No infrastructure has been provisioned.** Every artifact referenced by this Specification is a design document under Product Owner Review, not a running system.

---

Technical Design only. No implementation. No code. No database, infrastructure, or CRM changes. No previous document modified. Stopping — waiting for Product Owner Review.
