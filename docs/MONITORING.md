# Jade Intelligence Platform — Monitoring

**Package:** 9 — Monitoring
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no API, no UI, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4), `docs/PREPROCESSING_PIPELINE.md` (Package 5A), `docs/UNDERSTANDING_PIPELINE.md` (Package 5B), `docs/REASONING_PIPELINE.md` (Package 5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (Package 5D), `docs/KNOWLEDGE_GRAPH.md` (Package 6), `docs/KNOWLEDGE_STORE.md` (Package 7), `docs/CRM_INTEGRATION.md` (Package 8) — all fourteen treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the fourteen is modified by this document. Monitoring is a cross-cutting observer of every layer named above — it does not add a new pipeline stage of its own.

---

## 1. Vision

Monitoring gives the platform's operators business-level visibility into whether every part of the pipeline — from Sources through CRM Integration — is actually working, without ever doing any of that work itself. It answers *"is the platform healthy"* with the same discipline every other package applied to its own narrow question: Monitoring watches. It does not act.

---

## 2. Design Principles

1. **Monitoring observes, it never performs.** Monitoring never collects, never processes, never reasons, never creates Knowledge, and never makes any business decision. It is a read-only observer of every other package's own operation.
2. **Monitoring covers the whole pipeline, not just pieces of it.** Every layer named in §3 — Sources through CRM Integration — gets the same disciplined visibility.
3. **Monitoring is business-level, not technical.** Health Status (§4) and Business Metrics (§5) describe operational states and counts a business stakeholder can understand, not technical infrastructure metrics (CPU, memory, query latency).
4. **Monitoring surfaces, it doesn't diagnose or fix.** An Alert (§6) tells someone something needs attention — Monitoring itself never retries a failed Collector, resolves a Conflict Review flag, or takes any corrective action. That remains each package's own existing responsibility.
5. **Monitoring never gates the pipeline.** Nothing in Monitoring blocks Collection, Preprocessing, Understanding, Reasoning, Knowledge Generation, or CRM Integration from proceeding — Monitoring watches those processes; it is never a required checkpoint any of them must pass through.
6. **The Audit Trail is Monitoring's own record, not a duplicate of Evidence & Provenance.** The Audit Trail (§7) records what happened operationally — a different concept from the Evidence Chain (Evidence & Provenance Model §5), which records what a Knowledge item's content is actually grounded in.

---

## 3. Monitoring Scope

Business monitoring for each layer of the platform:

- **Sources** (Source Registry) — visibility into each Source's Lifecycle status (§4 there — Proposed/Approved/Active/Paused/Archived) and whether it's currently producing data as expected.
- **Collectors** (Collector Framework) — visibility into each Collector instance's operating status (Collector Registry §6) and its recent collection activity/failures (§8 there).
- **Raw Data** (Raw Data Storage) — visibility into how much Raw Data is being Stored, and its Lifecycle distribution (§4 there — Collected/Stored/Referenced/Archived).
- **AI Pipelines** (Preprocessing 5A, Understanding 5B, Reasoning 5C) — visibility into how much material is moving through each stage, and where backlogs or failures are occurring.
- **Knowledge Generation** (5D) — called out on its own: visibility into Knowledge Candidates entering the pipeline, how many pass Evidence Validation/Confidence Assignment/Conflict Review, and how many actually reach Knowledge Creation and Publication.
- **Knowledge Store** (Package 7) — visibility into the Store's own Lifecycle distribution (§4 there — Candidate/Published/Updated/Superseded/Archived) and overall Knowledge volume.
- **CRM Integration** (Package 8) — visibility into whether the CRM is actually reading from the Platform, and how current or stale that data is — directly addressing the staleness gap CRM Integration §7 left open.

---

## 4. Health Status

- **Healthy** — the observed part of the platform is operating as expected, with no unresolved issues.
- **Warning** — something worth noticing has occurred (a single failed collection, a Conflict Review flag), but it hasn't yet affected the platform's overall ability to function.
- **Degraded** — the observed part is still operating, but not fully — a persistent backlog, a Source repeatedly failing but not yet fully unavailable — function is reduced, not stopped.
- **Failed** — the observed part is not operating at all — a Collector that cannot reach its Source, a Pipeline stage that has stopped processing entirely.

These four levels apply consistently across every item in Monitoring Scope (§3) — a Source, a Collector, a Pipeline stage, or the Knowledge Store as a whole can each independently be Healthy, Warning, Degraded, or Failed.

---

## 5. Business Metrics

- **Collection activity** — how much material Collectors are bringing in, and from which Sources — a business-level count/rate, not a technical throughput number.
- **Processing activity** — how much material is moving through Preprocessing, Understanding, and Reasoning (5A–5C) over a given period.
- **Knowledge publication** — how much new or updated Knowledge is actually reaching Published status (Knowledge Generation Pipeline §11, Knowledge Store §4) — arguably the platform's single most important business metric, since it's the ultimate measure of the whole pipeline producing something useful.
- **Failed collections** — how often Collectors fail to acquire content (Collector Framework §8), and from which Sources — a direct business signal of where Source or Collector attention is needed.
- **Processing backlog** — how much material is waiting at any given stage rather than moving through — a business signal of where the pipeline is falling behind.

---

## 6. Alerts

**Business concepts only.** An Alert is Monitoring's way of surfacing that something in Monitoring Scope (§3) has moved to a Health Status (§4) worth a person's attention — typically Warning, Degraded, or Failed. Consistent with Design Principle 4, an Alert only surfaces a condition; it never attempts to resolve it. This document does not decide who receives an Alert, through what channel, or under what exact threshold an Alert fires — those are operational decisions, not business design (§10 Open Question #1, #3).

---

## 7. Audit Trail

**Business meaning only.** The Audit Trail is Monitoring's own record of what has operationally happened across the platform over time — a Collector ran (and what it produced or failed to produce), a Pipeline stage processed a batch, a Knowledge item was Created/Versioned/Published, a Conflict Review flagged something.

This is distinct from the Evidence Chain (Evidence & Provenance Model §5) and Knowledge Versioning (Knowledge Generation Pipeline §10): those record what a Knowledge item's content is grounded in and how it evolved. The Audit Trail records what the platform's own machinery did, operationally, independent of any single Knowledge item's content.

---

## 8. Business Examples

**A Facebook Group Source with repeated collection failures.** A Source's Collector fails its last 5 collection attempts. Health Status moves from Healthy to Warning after the first failure, to Degraded after repeated failures, and an Alert surfaces this to whoever is responsible (Collector Framework's own Failure Handling §8, now made visible through Monitoring). The Audit Trail records each individual failed attempt.

**A sudden volume spike creating a backlog.** A new PDF Library Source floods the platform with Raw Data, overwhelming Preprocessing and creating a Processing backlog (§5) at the Cleaning/Validation stage. Health Status for Preprocessing moves to Degraded — still processing, just slower — not Failed, since it hasn't stopped. Monitoring surfaces this as a Warning or Degraded Alert rather than treating it as a full outage.

**Knowledge publication drops to zero.** Collection and Processing activity remain normal, but Knowledge publication (§5) drops to zero for several days. Monitoring surfaces this pattern — material is flowing in but not reaching Published Knowledge — prompting investigation into Knowledge Generation's Evidence Validation/Confidence Assignment/Conflict Review stages, without Monitoring itself diagnosing which stage is the cause.

**CRM Integration goes quiet.** CRM Integration (§3) shows no read activity for an extended period even though the Knowledge Store is being actively Published to. This is a Health Status signal specific to that boundary, distinct from a Platform-side problem — illustrating that Monitoring watches both sides of the CRM boundary independently.

---

## 9. Out of Scope

- Any SQL, API, UI, or implementation — business meaning only, per explicit instruction.
- Any actual collection, AI processing, or business decision performed by Monitoring itself (Design Principle 1).
- Any specific alert channel, threshold, or escalation policy (§6) — named as a concept, not designed.
- Any specific metric calculation, dashboard, or visualization (§5) — named as business concepts, not designed.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, `docs/UNDERSTANDING_PIPELINE.md`, `docs/REASONING_PIPELINE.md`, `docs/KNOWLEDGE_GENERATION_PIPELINE.md`, `docs/KNOWLEDGE_GRAPH.md`, `docs/KNOWLEDGE_STORE.md`, or `docs/CRM_INTEGRATION.md` — all fourteen referenced only, none modified.
- Any CRM code, schema, or module change — CRM Integration (§3) is observed only, never modified by Monitoring.
- Resolving the "who is notified" / "failure visibility" open questions already raised in Collector Framework §14 Open Question #4 or Preprocessing Pipeline §12 Open Question #5 — Monitoring names the concepts (Health Status, Alerts) those questions were reaching toward, but doesn't itself decide the specific answers.

---

## 10. Open Questions

1. **Alert routing/ownership.** Who receives an Alert, and through what channel — a single platform operator role, or responsibility split by Monitoring Scope area (e.g. a Source's Owner, Source Registry §8, receiving Alerts about that specific Source)? Not decided — directly continues Collector Framework's own Open Question #4.
2. **Health Status aggregation.** Can a higher-level Health Status (e.g. "AI Pipelines" as a whole) be derived from its component parts' individual statuses, and if so how? Not decided.
3. **Alert thresholds.** Health Status (§4) describes four qualitative levels, but not what specifically moves something from Healthy to Warning, or Warning to Degraded (is one failed collection a Warning, or does it take three?) — deliberately left as a future, more operational decision.
4. **Audit Trail retention.** Consistent with the retention questions already raised for Raw Data Storage and Knowledge Store, how long is the Audit Trail (§7) retained, and is it ever archived or trimmed? Not decided.
5. **Monitoring Scope for future additions.** As new Source Types, Collector Types, or CRM modules are added (per each prior package's own Extensibility Rules), does Monitoring Scope (§3) automatically extend to cover them, or does each addition require its own Monitoring update? Not decided.
6. **Monitoring's own failure.** If Monitoring itself fails or becomes unavailable, does that count as a Failed status the rest of the platform can observe — or is Monitoring's own health outside what this document covers? Not decided.
7. **CRM Integration staleness visibility ownership.** §3 and §8 note Monitoring can surface CRM read staleness (echoing CRM Integration §7's own open "no guaranteed timeliness" question) — does the Platform side monitor this, the CRM side, or both independently? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
