# Jade Intelligence Platform — Security

**Package:** T8 — Technical Design, Security
**Status:** Draft — **Revision 2** (supersedes Revision 1 in this same file — a formal Product Owner Decision reissued this package with a wider, explicit 11-subsection structure — Security Principles, Identity Management, Authentication, Authorization, Secrets Management, Data Protection, Audit Logging, Threat Model, Security Testing, Incident Response, Open Questions — and a specified output shape: one `## 1. Security` section housing subsections 1.1–1.10, then a separate `## 2. Open Questions` section. Rewritten in place, same convention as Collector SDK (T3) Revision 2 and API Design (T7)'s formal reissue: this Draft was still under active Product Owner iteration, not yet LOCKED, so an in-place rewrite is appropriate rather than a new file.) Awaiting Product Owner Review.
**Phase:** Technical Design only. No implementation, no code, no infrastructure, no specific vendor/product, no cloud provider, no encryption algorithm/library, and no identity-provider selection are chosen anywhere in this document — mechanisms and standards are named at a conceptual/contract level only, the same "contract, not implementation" convention `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), `docs/AI_PIPELINE.md` (T5), and `docs/API_DESIGN.md` (T7) already established.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Platform Architecture), `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, `docs/UNDERSTANDING_PIPELINE.md`, `docs/REASONING_PIPELINE.md`, `docs/KNOWLEDGE_GENERATION_PIPELINE.md`, `docs/KNOWLEDGE_GRAPH.md`, `docs/KNOWLEDGE_STORE.md`, `docs/CRM_INTEGRATION.md`, `docs/MONITORING.md`, `docs/DEPLOYMENT.md`. None of the sixteen is modified by this document.

**Based on — Technical Design:**
- **"System Architecture (T1)" is named again in this task as a LOCKED input. Re-checked `docs/` in full immediately before writing this revision: still no file named or resembling `SYSTEM_ARCHITECTURE.md`, or any "Package T1," exists anywhere in this repository.** This is now the **seventh** independent confirmation of the same gap, after Database Design (T2), Collector SDK (T3), Canonical Engine (T4), AI Pipeline (T5), API Design (T7), and this document's own Revision 1. Per the precedent established since T2 (an `AskUserQuestion` was tried once on this exact class of gap and declined — the Product Owner's follow-up simply re-sent the task instruction unchanged), this document does not re-block a seventh time. Carried forward as Open Question #1.
- **`docs/DATABASE_DESIGN.md` (T2), `docs/COLLECTOR_SDK.md` (T3), `docs/CANONICAL_ENGINE.md` (T4), `docs/AI_PIPELINE.md` (T5), `docs/API_DESIGN.md` (T7) — all exist, treated as LOCKED per this task's instruction** (their own headers stay "Draft," unedited, same convention). Not modified by this document; referenced throughout.
- **This task calls Package T6 "Knowledge Platform"; the locked file's own title is "Knowledge Store & Knowledge Graph Technical Design" (`docs/KNOWLEDGE_STORE_AND_GRAPH_TECHNICAL_DESIGN.md`).** API Design (T7) already flagged this exact naming variance as non-blocking; treated the same way here — same document, referenced by its actual filename throughout.

---

## 1. Security

### 1.1 Security Principles

1. **Security extends API Design (T7) §2's Authentication Contract; it does not fork a second one.** T7 already defines `authenticate(credentials) -> Principal | AuthenticationFailure` and `authorize(principal, resource, action) -> Allowed | Denied`, with three proposed Principal kinds (CRM Integration Principal, Platform Operator Principal, Manual Import Submitter Principal) and a deliberately narrow Action set (`Read`, `Submit` — no `Write`/`Update`/`Delete`, since every API T7 defines is read-only). This document reuses that contract shape and spends most of its effort on what T7 left as a placeholder: what actually sits behind the **Platform Operator Principal** (§1.2, §1.4), and what governs the internal, non-API actions T7's Action set never needed to cover.
2. **The Knowledge Store's sole-writer rule is a security boundary already enforced one layer down — this document does not re-invent it.** AI Pipeline (T5) §1.5 and Knowledge Store & Graph Technical Design §1 already restrict `create()`/`publish()` to the Knowledge Generation Engine exclusively, "an actual interface-level access boundary rather than a convention every caller is trusted to follow." Security's Authorization design (§1.4) restates this at the identity level: no Principal is ever authorized for a `Write` Action against the Knowledge Store, because no such Action exists on that contract.
3. **Raw Data immutability is likewise already a contract-level guarantee.** Collector SDK (T3) §1.2's `Collector` interface has no update/delete method against already-produced content, and Raw Data Storage §5's "never modified by AI" rule has no corresponding write path anywhere in T3–T6. Security does not add a new denial rule here — it only confirms no future Principal/Action grant is ever added that would create one (§1.4).
4. **Every external Source credential is a Secret, never Platform content.** A Source's collection credentials (Collector Framework §4; Source Registry §6; the `sourceConfig` parameter to Collector SDK §1.2's `discover()`) must never be stored inside a Canonical Document, Evidence, or Knowledge item — confirmed against Database Design (T2) §1.5: no such record type has, or should ever gain, a credential-shaped field.
5. **CRM Integration authentication follows CRM Integration's own constraint, given contract form by T7.** T7 §2's CRM Integration Principal proposal — one Principal per opted-in CRM module, never the CRM monolithically — is adopted unchanged; Security reinforces it (§1.2, §1.4) rather than re-deciding it.
6. **Security is Technical Design, not implementation.** This document names mechanisms and standards conceptually — it does not choose a specific identity provider, secrets-management product, or encryption algorithm.

---

### 1.2 Identity Management

**A genuine gap surfaces here that no prior document (Business or Technical) addressed: a runtime `Principal` (T7 §2) is not the same thing as a persisted, managed identity, and no Technical Design document defines the latter.** Collector SDK (T3) §1.4 gives Collector *instances* a Registry; Source Registry gives Sources one; Database Design (T2) §1.5 has no equivalent record type for a `Principal`, a human Platform Operator, or a Role assignment at all. Identity Management is this document's answer to that gap, at business/technical-concept level only — no schema is added to T2 by this document (§2 Open Question #2).

- **Principal Registry (proposed concept).** A conceptual bookkeeping surface, structurally analogous to the Collector Registry (T3 §1.4) and Source Registry, that would record every Principal's kind (§1.3), its assigned Role(s) (§1.4), and its status (Active / Revoked) — proposed, not confirmed to exist as a T2 record type.
- **Provisioning.** A new human Platform Operator identity, or a new Engine-level service identity (created whenever Collector SDK's Extension Model, T3 §1.9, or a future Engine addition per AI Pipeline/Knowledge Store & Graph brings a new component online), is provisioned into the Principal Registry before it can ever call `authenticate()` (T7 §2).
- **Deprovisioning.** A Principal is revoked — never silently left dangling — when a Role is withdrawn (§1.4), when a Source is Archived and its scoped Secret is revoked (§1.5's Secrets lifecycle), or when a human Operator's access is otherwise ended. Deprovisioning is a governed action in its own right, mirroring the "never silently modify" discipline this entire platform design already holds itself to.
- **Review.** Consistent with Source Registry §7's non-static Trust Level and Knowledge Generation Pipeline §10's Versioning discipline, Principal Registry entries are expected to be periodically reviewed for continued validity — cadence not decided here (§2 Open Question #9).

---

### 1.3 Authentication

Authentication establishes *who or what an identity claims to be*, before Authorization (§1.4) decides what it may do. T7 §2 already defines the contract shape and three Principal kinds scoped to the API surface; this section keeps that shape and names the identities that sit behind it — including ones T7 had no reason to enumerate because they never call an external API at all:

- **Human Platform Operators (behind T7's Platform Operator Principal).** Anyone interacting with the Platform's internal governance surface — approving a Source (Source Registry §9), acting on a Conflict Review flag (Knowledge Generation Pipeline §8), responding to a Monitoring Alert (Monitoring §6; API Design §7), approving a Release (Deployment §5–6). Authenticated via a standard identity mechanism (e.g., a credential plus a second factor) — conceptual only; no specific identity provider is chosen (§2 Open Question #4).
- **Service-to-service identity (internal Engines).** Each Engine named across Canonical Engine (T4) §3–§7 and AI Pipeline (T5) §1.2–§1.5 — Validation/Mapping/Metadata/Attachment/Identity Resolution, Preprocessing/Understanding/Reasoning/Knowledge Generation — plus the Knowledge Store/Graph Engines (Knowledge Store & Graph Technical Design), authenticates to the next as a distinct machine identity, never as a human Principal, so every write can be attributed to the exact Engine that made it (feeds Audit Logging, §1.7). A new Principal category this document adds, beyond T7's three API-facing kinds.
- **External Source credentials.** Each Collector authenticates *outward* to its external Source via whatever `sourceConfig` (Collector SDK §1.2) supplies. This is the Source's own access requirement, not a Platform identity; managed as a Secret (§1.5), owned per Source Registry §8's Source Ownership concept.
- **CRM Integration Principal.** Unchanged from T7 §2 — one Principal per opted-in CRM module, never the CRM monolithically. Still proposed, not confirmed (T7 §11 Open Question #5, inherited unchanged).
- **Manual Import Submitter Principal.** Unchanged from T7 §2 — a staff member submitting via `POST /v1/manual-imports` (T7 §3.2). Who specifically may hold this Principal is still open (Collector Framework §12 Open Question #6, inherited by T7 and again here).

---

### 1.4 Authorization

Authorization decides what an authenticated identity (§1.3) may actually do, via T7 §2's `authorize(principal, resource, action) -> Allowed | Denied`. T7 scoped `Action` to exactly `Read` and `Submit`, since every API it defines is read-only plus one submission endpoint. This section extends the Action vocabulary for the internal, non-API governance surface T7 never needed to cover, and restates two write-boundaries already enforced one layer down rather than newly invented here:

| Governed Action | Action (beyond T7 §2's Read / Submit) | Prior Contract Reference | Authorized Principal |
|---|---|---|---|
| Approve a Source (Proposed → Approved) | `Approve` | Source Registry §9 | Source Curator (behind Platform Operator Principal) |
| Trigger a Manual Import collection | `Submit` (unchanged) | Collector Framework §5; API Design §3.2 | Manual Import Submitter Principal |
| Act on a Conflict Review flag | `Review` | Knowledge Generation Pipeline §8; AI Pipeline §1.5's `ReviewConflicts` | Knowledge Reviewer |
| Receive/action a Monitoring Alert | `Read` (unchanged) + `Acknowledge` | Monitoring §6; API Design §7 | Platform Operator (scoped by Monitoring Scope) |
| Approve a Release / authorize a Rollback | `Administer` | Deployment §5 | Platform Administrator |
| Provision/deprovision a Principal | `Administer` | §1.2 | Platform Administrator |
| Write (`create()`/`publish()`) to the Knowledge Store | *No `Write` Action exists — structurally absent* | AI Pipeline §1.5; Knowledge Store & Graph Technical Design §1 | Knowledge Generation Engine's own service identity, exclusively |
| Read from Knowledge/Search/Source APIs (external) | `Read` (unchanged) | API Design §4–§6 | CRM Integration Principal (per opted-in module) |
| View Audit Logging records | `Read` | §1.7 | Auditor |

The Knowledge Store row is phrased as "no `Write` Action exists" rather than "denied" — Knowledge Store & Graph Technical Design §1 already restricts `create()`/`publish()` to the Knowledge Generation Engine at the interface level, so Authorization here confirms no future Principal/Action grant should ever open a second write path (Principle 2).

Concrete Roles behind the Platform Operator Principal (RBAC, folded into this section per the requested structure — no separate RBAC section in this revision):

- **Platform Administrator** — `Administer`. Highest-privilege role; expected to be held by very few identities.
- **Source Curator** — `Approve`; owns Source-level Trust Level judgments (Source Registry §7).
- **Collector Operator** — configures Collector instances (Collector SDK §1.4); `Submit` for Manual Import.
- **Knowledge Reviewer** — `Review`; never gains a `Write` Action directly — that stays exclusive to the Knowledge Generation Engine's own service identity even when a Reviewer's decision triggers it.
- **Platform Operator** — `Read` + `Acknowledge` for an assigned Monitoring Scope area.
- **Auditor** — `Read`-only across every layer's records; no action authority anywhere.

Role-assignment authority is not decided by this document (§2 Open Question #5).

---

### 1.5 Secrets Management

- **What counts as a Secret.** External Source credentials (§1.3), any internal Engine-to-Engine credential (§1.3), any encryption key (§1.6). Explicitly *not* a Secret: Platform content itself — confirmed against Database Design (T2) §1.5 that no Canonical Document, Evidence, or Knowledge record type carries, or should ever carry, a credential-shaped field (Principle 4).
- **Ownership.** A Source's credential is owned by that Source's existing Source Ownership role (Source Registry §8) — the same person/role accountable for the Source's Trust Level is accountable for its credential's validity, not whoever maintains the Collector implementation (Collector SDK §1.9).
- **Lifecycle.** Secrets are Issued, Rotated, and Revoked as their own governed lifecycle, independent of but parallel to a Source's Proposed→Approved→Active→Paused→Archived lifecycle (Source Registry §4) and a Principal's Provisioning/Deprovisioning lifecycle (§1.2). A Source moving to Archived triggers Revocation of any Secret scoped only to it.
- **Storage mechanism.** Conceptually: Secrets are held in a dedicated secrets-management layer, separate from both Database Design (T2)'s relational store and any object/blob storage holding Raw Data — never inline in `sourceConfig`, configuration, or code. No specific product/vendor is chosen here (§2 Open Question #3).

---

### 1.6 Data Protection

- **In transit.** All communication between Engines (T4–T6), and between the Platform and any external Source or CRM Integration Principal (T7 §6), is encrypted in transit — a technical requirement, not a specific protocol/library choice.
- **At rest.** Secrets (§1.5) and any personal data present in Raw Data or Canonical Documents (Platform Architecture's own unresolved Open Question #2 on personal-data handling) are encrypted at rest. Knowledge, Evidence, and non-sensitive Canonical Document content carry no additional protection requirement beyond what Database Design (T2) already assumes, unless a future revision says otherwise (§2 Open Question #6).
- **Personal data in collected content.** A Facebook Post or Website Article (Raw Data Storage §6 examples; Collector SDK §1.2's `RawContent`) may incidentally contain personal names, contact details, or other personal data belonging to third parties, not the Platform's own users. This document does not resolve how such incidental personal data is classified, retained, or redacted — flagged as continuing Platform Architecture's own unresolved Open Question #2.
- **CRM Integration boundary.** Whatever a CRM Integration Principal reads (T7 §6) is bound by the same read-only, one-directional constraint already locked in CRM Integration §3 and restated by API Design §9's `Write Rejected` error category. Data Protection here means ensuring no Secret and no unreviewed personal data ever crosses into that read surface.

---

### 1.7 Audit Logging

**Grounded in Monitoring's existing Audit Trail Entry record** (Database Design T2 §1.5: `event_type`, `scope_type`, `scope_id`, `detail`, `occurred_time`; Monitoring §7). Monitoring's own Audit Trail records what the platform's *machinery* did operationally. Security Audit Logging is narrower and specifically about identity and access: who authenticated, what they were authorized to do (§1.4), and what security-relevant action they took.

Proposed as an extension of the same `Audit Trail Entry` shape rather than a new parallel record: `event_type` gains security-specific values (e.g. `SourceApproved`, `AccessDenied`, `RoleAssigned`, `PrincipalProvisioned`, `PrincipalDeprovisioned`, `SecretRotated`), and `detail` carries the acting Principal's identity and the `authorize()` result. Whether this is truly the same table with new `event_type` values, or a genuinely separate record, is not settled (§2 Open Question #7).

Every action in the Authorization table (§1.4), including every `Denied` outcome, produces an Audit Logging entry. Every Identity Management event (§1.2 — Provisioning, Deprovisioning) also produces one. Consistent with the "never break Traceability" discipline used throughout T2–T7, these entries are append-only and never edited after the fact.

---

### 1.8 Threat Model

Business/technical-level threats against the assets this design already names — no attacker profiling, no CVE-level detail, no penetration-test findings (none exist yet, see §1.9):

| Asset | Threat | Existing / Proposed Mitigation |
|---|---|---|
| External Source credentials (§1.5) | Credential theft or leakage | Secrets Management (§1.5) isolation from Platform content; Rotation/Revocation lifecycle |
| Knowledge Store integrity (T5 §1.5, Knowledge Store & Graph §1) | Unauthorized or forged Knowledge write | Structurally absent `Write` Action for any Principal but the Knowledge Generation Engine (§1.4, Principle 2) |
| Raw Data immutability (Raw Data Storage §5; Collector SDK §1.2) | Tampering with already-collected Raw Data | No update/delete method exists on the Collector contract (Principle 3) |
| Source trustworthiness | A malicious or compromised Source feeding false content | Source Registry §7's Trust Level — a business judgment, not a technical control; flagged as a partial mitigation only |
| Personal data in Raw/Canonical content (§1.6) | Incidental exposure of third-party personal data | Not yet mitigated — classification/redaction unresolved (Platform Architecture Open Question #2, restated §1.6) |
| CRM Integration boundary (T7 §6) | A CRM module reading beyond its authorized scope | Per-module CRM Integration Principal scoping (§1.3, §1.4) — proposed, not confirmed (T7 §11 OQ#5) |
| Audit Logging records (§1.7) | Tampering with or deleting access history | Append-only, never-edited entries, same guarantee as Raw Data/Knowledge Versioning |
| Collector/API availability | Volume flooding or repeated-request abuse against a Collector or an external API endpoint (API Design §3–§7) | **No mitigation named anywhere in the Business or Technical Design** — flagged as a genuine, previously-undiscovered gap (§2 Open Question #10); Monitoring's Health Status/Backlog metrics (Monitoring §4–5) would *observe* the effect, not prevent it |
| Principal credentials (§1.2, §1.3) | Stolen or reused authentication credential | Depends entirely on the still-unchosen authentication mechanism (§2 Open Question #4) |

This table catalogs threats against already-designed assets; it does not itself add new technical controls beyond what §1.3–§1.7 already propose.

---

### 1.9 Security Testing

Business/technical-level testing concepts only — no test framework, tool, or test code, mirroring Collector SDK §1.10, Canonical Engine §10, AI Pipeline §1.10, and API Design §10's own boundary.

- **Authentication Contract conformance.** Reuses API Design §10's existing coverage unchanged: `authenticate()`/`authorize()` (T7 §2) are testable against fabricated `Principal`/`credentials` fixtures, independent of whatever concrete mechanism is eventually chosen.
- **Authorization deny-path testing.** Every row in the Authorization table (§1.4) should be provable both ways — a fixture Principal with the right Role receives `Allowed`, one without it receives `Denied` — including the Knowledge Store row, where the test proves no `Write` Action exists to grant in the first place, not merely that it's denied.
- **RBAC role-boundary testing.** A fixture Collector Operator Principal should be provably denied `Approve`, `Review`, and `Administer` — confirming Least-Privilege scoping (§1.4) holds per Role, not just in the aggregate.
- **Secrets-handling conformance.** A fixture Canonical Document, Evidence, and Knowledge record should be provable to never contain a credential-shaped field, regardless of what `sourceConfig` (Collector SDK §1.2) supplied upstream — the concrete test for Principle 4.
- **Audit Logging completeness.** A fixture scenario exercising every Authorization Action (§1.4) should produce exactly one Audit Logging entry (§1.7) per action, including `Denied` outcomes and Identity Management events (§1.2).
- **Explicitly out of scope.** Live penetration testing, vulnerability scanning, and load/DoS testing against the gap flagged in §1.8 are not designed here — this Testing Strategy covers only contract-level conformance, consistent with every prior Technical Design package's own boundary.

---

### 1.10 Incident Response

- **Detection.** A security-relevant condition surfaces either as an Audit Logging anomaly (§1.7 — e.g. a spike in `AccessDenied` entries) or as a Monitoring Health Status change (Monitoring §4) for an affected Source/Collector/Engine — Incident Response does not introduce a separate detection mechanism, it consumes these two existing signals.
- **Containment.** The immediate response to a confirmed incident is Deprovisioning the affected Principal (§1.2) and/or Revoking the affected Secret (§1.5) — reusing existing lifecycle actions rather than a new emergency-only mechanism.
- **Recovery.** Ties directly to Deployment §8's Business Continuity concepts (Service interruption/Recovery/Data integrity/Knowledge integrity) — a security incident is treated as a form of Service interruption for Recovery purposes, not a separate recovery process.
- **Post-Incident Review.** Expected to happen, consistent with the Access Review discipline already named for Source Trust Level (Source Registry §7) and Principal Registry entries (§1.2) — ownership and cadence are not decided here (§2 Open Question #11).

---

## 2. Open Questions

1. **System Architecture (T1) still does not exist.** Seventh independent confirmation, after T2, T3, T4, T5, T7, and this document's own Revision 1. Not re-raised as a blocker; carried forward unchanged.
2. **Principal Registry as a real record type.** §1.2 proposes a Principal Registry structurally analogous to the Collector/Source Registries, but Database Design (T2) §1.5 has no `Principal`/`User`/`Identity` record type today — not confirmed against T2, which was not written with this use in mind.
3. **Secrets-management mechanism.** §1.5 names the concept but not a specific product/vendor — deferred the same way API Design (T7) deferred its authentication mechanism.
4. **Authentication mechanism.** Inherited unchanged from API Design (T7) §11 Open Question #4 / Platform Architecture §14 / CRM Integration §11 Open Question #6 — no API key/OAuth/mTLS/session scheme is chosen anywhere in the Business, Technical, or this Security Design.
5. **Role assignment authority.** §1.4 defines Roles but not who is authorized to grant them to a given identity.
6. **Data Protection scope for non-Secret content.** §1.6 requires encryption for Secrets and personal data, but leaves open whether Knowledge, Evidence, and ordinary Canonical Document content require the same protection level, or a lighter one.
7. **Audit Logging as a reuse of Audit Trail Entry, or a separate record.** §1.7 proposes extending Database Design (T2) §1.5's existing shape with security-specific `event_type` values rather than adding a new record type — not confirmed against T2.
8. **Per-CRM-module Principal scoping, still not confirmed.** Inherited unchanged from API Design (T7) §11 Open Question #5 / CRM Integration §11 Open Question #3.
9. **Principal Registry review cadence.** §1.2 expects periodic review but doesn't decide how often or by whom.
10. **No mitigation for volume/availability threats.** §1.8 flags that flooding or repeated-request abuse against a Collector or an external API endpoint has no named defense anywhere in the Business or Technical Design — a genuine, previously-undiscovered gap, not resolved here.
11. **Incident Response ownership and cadence.** §1.10 names Detection/Containment/Recovery/Post-Incident Review as concepts but doesn't assign who owns Post-Incident Review or how quickly Containment is expected to happen.
12. **Manual Import Submitter Principal, still unresolved.** Inherited unchanged from Collector Framework §12 Open Question #6 / API Design §11 Open Question #11.
13. **Engine-to-Engine authentication granularity.** §1.3 proposes each Engine (T4–T6) gets a distinct service identity, but doesn't decide whether that's per-Engine-type or per-Engine-instance.

---

Technical Design only. No implementation. No code. No infrastructure, vendor, or database changes. Stopping — waiting for Product Owner Review.
