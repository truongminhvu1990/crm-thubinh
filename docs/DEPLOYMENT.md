# Jade Intelligence Platform — Deployment

**Package:** 10 — Deployment
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no infrastructure design, no cloud provider, no Kubernetes, no Docker, no CI/CD, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4), `docs/PREPROCESSING_PIPELINE.md` (Package 5A), `docs/UNDERSTANDING_PIPELINE.md` (Package 5B), `docs/REASONING_PIPELINE.md` (Package 5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (Package 5D), `docs/KNOWLEDGE_GRAPH.md` (Package 6), `docs/KNOWLEDGE_STORE.md` (Package 7), `docs/CRM_INTEGRATION.md` (Package 8), `docs/MONITORING.md` (Package 9) — all fifteen treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the fifteen is modified by this document.

---

## 1. Vision

Deployment is what turns everything designed in Packages 1 through 9 into an actual, operating platform — but strictly from a business perspective: which environments exist, how a release is judged ready, how changes are governed once live, and what happens if something goes wrong. It defines the operational boundaries and governance the Platform runs inside, not the technical infrastructure that runs it.

---

## 2. Design Principles

1. **Deployment governs operations; it doesn't design infrastructure.** This document defines business boundaries — environments, releases, readiness, change governance, continuity. No cloud provider, no container technology, no CI/CD tooling is chosen anywhere here.
2. **The Platform's environments are its own, separate from the CRM's.** Consistent with Platform Architecture Principle 1 (a completely independent platform project), the Platform's environments (§4) are not shared with, not synchronized with, and not governed by the CRM's own Development/Production split (`docs/PROJECT_MANIFEST.md`) — the two systems' environments are entirely separate concerns.
3. **Nothing releases without Operational Readiness.** Consistent with Business Design First (Platform Architecture Principle 8), a release happens only once the Operational Readiness requirements (§6) are actually met — readiness is a gate, not a formality.
4. **Traceability and Monitoring are release prerequisites, not afterthoughts.** Traceability (Evidence & Provenance Model §9, threaded through every subsequent package) and Monitoring (Package 9) must both be verified and available before a release, not added once something is already live.
5. **Change is governed, not ad hoc.** Any change to the running Platform follows the same disciplined, approved-first pattern this whole design has followed for its own documentation — now applied to the Platform's actual running state (§7).
6. **Interruption never breaks Traceability or Data/Knowledge integrity.** Consistent with the "never break Traceability" discipline already established for Raw Data Storage and Knowledge Store, Business Continuity (§8) treats data and Knowledge integrity as non-negotiable even during a Service interruption or Recovery.

---

## 3. Deployment Scope

**Business meaning of deploying the Platform.** Deployment covers making every layer designed in Packages 1 through 9 — Collector Framework, Source Registry, Raw Data Storage, the four pipeline stages, Knowledge Graph, Knowledge Store, CRM Integration, Monitoring — actually operate together, in a real environment, for real Sources, as opposed to existing only as this set of Business Design documents. Deployment Scope is about *where* and *under what governance* the Platform runs; it is not about *how* it's technically hosted.

---

## 4. Deployment Environments

- **Development** — where the Platform's own components are actively built and changed. The least stable, most experimental environment — never the environment real Sources are collected from for business-relied-upon purposes.
- **Testing** — where changes are verified to behave as designed before they're trusted anywhere closer to real operation. May use real or representative Source configurations, but its output is never treated as authoritative Knowledge.
- **Staging** — an environment that mirrors Production closely enough to validate a release is ready, without yet being the environment real consumers (including any future CRM Integration) actually rely on.
- **Production** — the live, operating Platform: where real Sources are collected from, real Knowledge is Created and Published, and, if ever built, real CRM Integration reads from. This is the only environment whose Knowledge Store output is treated as the Platform's authoritative Knowledge.

These four environments are entirely the Platform's own — distinct from, and not synchronized with, the CRM's own Development/Production environments, consistent with Platform Architecture's independence principle (Design Principle 2).

---

## 5. Release Management

Business concepts only — no implementation.

- **Initial Release** — the first time the Platform, or a significant new capability within it (a new Collector Type, a new pipeline stage), becomes available in Production, following full Operational Readiness (§6).
- **Incremental Release** — a planned, business-approved addition or change to an already-operating Platform — a new Source, a new Collector instance, a refinement to a pipeline stage — following the same Change Management governance (§7) as any other change.
- **Hotfix** — an urgent, narrowly-scoped correction to something already in Production that isn't behaving as designed. Still governed (§7), but expected to move faster than a normal Incremental Release given its urgency.
- **Rollback** — reverting Production to a previous state after a release or Hotfix turns out to be unsafe or incorrect. Must never break Traceability or Data/Knowledge integrity (§8) in the course of reverting — a Rollback is itself a governed action, not an emergency free pass.

---

## 6. Operational Readiness

Business requirements before a release:

- **Business approval** — the release has been reviewed and approved through the same Business-Design-first discipline this platform has followed for every prior package. Nothing reaches Production without an explicit go-ahead.
- **Documentation complete** — the relevant Business Design (and, at implementation time, any further required documentation) actually reflects what's about to be released — no gap between what's documented and what's running.
- **Monitoring available** — the release is observable per Package 9's Monitoring Scope before it goes live. The Platform is never deployed somewhere Monitoring can't see it.
- **Traceability verified** — the Evidence Chain and Traceability Rules established across Evidence & Provenance Model, Raw Data Storage, Knowledge Graph, and Knowledge Store actually hold for what's being released — traceability is confirmed working, not assumed.

---

## 7. Change Management

**Business governance for platform changes.** Any change to the running Platform — adding a Source or Collector, adjusting a pipeline stage's behavior, changing Knowledge Organization (Knowledge Store §5), extending CRM Integration (Package 8) — follows a governed path: proposed, reviewed, approved, and only then released (as an Incremental Release or Hotfix, §5).

This mirrors the same discipline already used to govern this design's own documents — each Package building on, but never silently modifying, the ones before it — now applied to the Platform's actual running state. Change Management establishes that some form of approval is always required, never skipped; it does not, by itself, decide *who* holds that approval authority (§11 Open Question #1).

---

## 8. Business Continuity

Business concepts only.

- **Service interruption** — a period where some or all of the Platform is not operating as expected (echoing Monitoring's own Failed/Degraded Health Status, Monitoring §4) — a business condition to plan for, not an infrequent implementation detail.
- **Recovery** — restoring the Platform to normal operation after a Service interruption. Recovery is expected to bring Collectors, pipelines, and the Knowledge Store back to correct operation without silently losing anything that happened before the interruption.
- **Data integrity** — Raw Data Storage's Immutability and Append-only principles (§5 there) must hold even through a Service interruption and Recovery — nothing collected before an interruption is corrupted or lost by the interruption itself.
- **Knowledge integrity** — Knowledge Store's Versioning and Traceability guarantees (§6, §8 there) must likewise survive a Service interruption — a Recovery never results in a Knowledge item's history being altered, lost, or made untraceable.

---

## 9. Business Examples

**Adding a new Collector Type.** Built and verified in Development and Testing, validated in Staging against Operational Readiness (§6), and released to Production as an Incremental Release (§5) — Monitoring (Package 9) observes it from day one in Production, per Operational Readiness's own requirement.

**A malformed-data Hotfix.** A Collector begins producing Canonical Documents that fail Validation (Preprocessing Pipeline §5) at a high rate in Production. This surfaces as a Degraded or Failed Health Status (Monitoring §4). A Hotfix is developed, verified in Testing, and released urgently — but even under urgency, it still passes through Change Management's governance (§7); it isn't pushed live unreviewed.

**A Service interruption and Recovery.** A Production interruption takes the AI Pipelines offline for several hours. Collectors continue Collecting and Storing Raw Data (Raw Data Storage's own independence from downstream processing) — nothing is lost. Once Recovery restores the Pipelines, the backlog of unprocessed Raw Data is worked through normally; Data integrity (§8) is preserved throughout, and Knowledge integrity is never at risk since no Knowledge was being Created during the interruption anyway (Knowledge Generation Pipeline only acts on already-processed material).

**A Rollback after a flawed release.** A release turns out to have a flaw in Relationship Extraction (Understanding Pipeline §7) producing incorrect relationships. A Rollback reverts the AI Pipeline's behavior to its prior state — but Knowledge already Created and Published under the flawed behavior remains in the Knowledge Store, retained and traceable, never deleted by the Rollback itself (Knowledge Versioning, Knowledge Store §6). A Rollback fixes what happens going forward; it does not automatically correct what already happened (§11 Open Question #2).

---

## 10. Out of Scope

- Any cloud provider, infrastructure design, Kubernetes, Docker, or CI/CD tooling — business meaning only, per explicit instruction.
- Any SQL, database schema, or code.
- Any specific approval authority, timeline, or SLA for Release Management (§5) or Change Management (§7) — governed, but not who or how fast is decided here.
- Any specific Recovery time objective or Recovery point objective for Business Continuity (§8) — the concepts are named, not quantified.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, `docs/UNDERSTANDING_PIPELINE.md`, `docs/REASONING_PIPELINE.md`, `docs/KNOWLEDGE_GENERATION_PIPELINE.md`, `docs/KNOWLEDGE_GRAPH.md`, `docs/KNOWLEDGE_STORE.md`, `docs/CRM_INTEGRATION.md`, or `docs/MONITORING.md` — all fifteen referenced only, none modified.
- Any CRM code, schema, or module change, or any change to the CRM's own Development/Production environments — the Platform's environments (§4) are entirely separate.
- Designing Monitoring's own alert thresholds or Audit Trail retention (already flagged as open in Package 9) — this document treats "Monitoring available" as a readiness gate; it doesn't resolve Monitoring's own remaining open questions.

---

## 11. Open Questions

1. **Release approval authority.** §6 requires "Business approval" and §7 requires governed change, but doesn't name who specifically holds that authority for the Platform. Not decided.
2. **Rollback vs. already-Published Knowledge.** §9's worked example shows a Rollback reverting Pipeline behavior without erasing already-Published Knowledge — but doesn't decide whether flawed Knowledge Created under a since-rolled-back release is ever corrected, Superseded, or flagged after the fact. Not decided — Knowledge Store §4's Superseded state exists, but this document doesn't connect it to a Rollback scenario explicitly.
3. **Testing/Staging data realism.** §4 notes Testing/Staging "may use real or representative Source configurations" — does Testing/Staging ever collect from real, live Sources (with the Provenance/Trust implications that carries, Source Registry §7), or always from synthetic/representative ones? Not decided.
4. **Environment-specific Knowledge.** Is Knowledge Created in Testing or Staging ever visible anywhere, or entirely discarded/isolated from Production's Knowledge Store? Not decided — Knowledge Generation Pipeline and Knowledge Store didn't address multi-environment separation at all.
5. **Recovery time expectations.** §8 names Recovery as a concept but doesn't say how quickly it's expected to happen, or whether different Monitoring Scope areas (Monitoring §3) have different recovery priorities. Not decided.
6. **Hotfix governance speed.** §5 states a Hotfix is "still governed... expected to move faster," but doesn't define what's actually different about Hotfix governance versus a normal Incremental Release beyond speed. Not decided.
7. **Deployment's relationship to CRM-side releases.** If a CRM module (Package 8) is ever revised to actually consume Platform Knowledge, is that CRM-side release governed by this Deployment document, by the CRM's own release process (`docs/PROJECT_MANIFEST.md`), or does it require coordination between both? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
