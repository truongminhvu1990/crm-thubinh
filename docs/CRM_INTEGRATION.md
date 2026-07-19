# Jade Intelligence Platform — CRM Integration

**Package:** 8 — CRM Integration
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no API, no UI, no database schema, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4), `docs/PREPROCESSING_PIPELINE.md` (Package 5A), `docs/UNDERSTANDING_PIPELINE.md` (Package 5B), `docs/REASONING_PIPELINE.md` (Package 5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (Package 5D), `docs/KNOWLEDGE_GRAPH.md` (Package 6), `docs/KNOWLEDGE_STORE.md` (Package 7) — all thirteen treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the thirteen is modified by this document.

**Important, flagged up front:** this document describes what CRM Integration *could* look like at the business level. It does **not** authorize building any of it. Several of the CRM modules named in §5 are already governed by their own LOCKED Business Design specs that currently **conflict** with what's described here — most sharply, `docs/MARKET_INTELLIGENCE_SPEC.md` and `docs/REPORTS_SPEC.md` both explicitly ban AI/ML/LLM inside those modules, and `docs/KNOWLEDGE_VAULT_SPEC.md` explicitly locks that CRM module to no external references. These conflicts are called out individually in §5 and §9, not glossed over.

---

## 1. Vision

CRM Integration describes how the CRM — an existing, separate, independently-governed system — may someday read from the Jade Intelligence Platform's Knowledge Store and Knowledge Graph, without ever depending on the Platform to function, without ever owning any of the Platform's Knowledge, and without ever performing any AI itself. This document describes the *shape* of that possibility. It does not build it — and, as flagged above, several of the CRM modules it describes would need their own locked specs revised before any of this could actually be implemented.

---

## 2. Design Principles

1. **The CRM is a consumer only, never the owner.** The CRM may read; it never writes, governs, versions, or is responsible for anything in the Platform (restated, now at its most concrete, from Platform Architecture §12 and Knowledge Store §9).
2. **The CRM never performs AI.** The CRM reads already-finished Knowledge — Cleaning, Understanding, Reasoning, and Knowledge Generation (Packages 5A–5D) are entirely Platform-side. Nothing the CRM does ever re-implements, duplicates, or performs any AI Processing Layer stage.
3. **One-directional, read-only, always optional.** Every CRM feature this document describes must remain fully functional if the Platform is absent, slow, or unreachable — nothing the CRM does may ever block on the Platform (Platform Architecture Principle 4).
4. **Every consuming CRM module keeps its own governance.** This document does not unilaterally grant any CRM module new scope. Each module named in §5 remains governed by its own Business Design workflow (`docs/PROJECT_MANIFEST.md`), and several are already LOCKED under specs that currently conflict with consuming Platform Knowledge — actually implementing any of this requires that module's own new Revision and its own Product Owner approval, not just this document's existence.
5. **Traceability survives the boundary.** Anything a CRM screen shows that's sourced from the Platform must remain traceable all the way back through Knowledge → Evidence → Canonical Document → Raw Source (§8) — the CRM never presents a Platform-derived fact without the ability to show where it came from.
6. **Technology-agnostic.** No API, no UI, no database schema, no implementation is chosen anywhere in this document.

---

## 3. Integration Principles

- **Pull, not push.** The CRM reads from the Platform when it needs to, on its own schedule or trigger — the Platform never pushes data into the CRM unprompted.
- **Read the Knowledge Store and Knowledge Graph only — never the earlier layers directly.** CRM consumption is scoped to Knowledge (Knowledge Store, Package 7) and its relationships (Knowledge Graph, Package 6). The CRM never reads Raw Data Storage, Collectors, or the AI Processing Layer's intermediate stages (Preprocessing/Understanding/Reasoning) directly — those are entirely internal to the Platform.
- **No CRM write-back.** Nothing the CRM does — no user action, no CRM-side edit — ever writes into the Knowledge Store, Knowledge Graph, Evidence, or any earlier Platform layer.
- **Each CRM module opts in independently.** One CRM module consuming Platform Knowledge never implies another module does — the modules named in §5 are each independent, optional integration points, not a package deal.
- **Graceful absence.** Every integration point described in §5 must have a defined "Platform has nothing to say" or "Platform is unreachable" state that never blocks or breaks the underlying CRM screen (§6).

---

## 4. CRM Consumption Model

Business meaning only.

- **Reading Knowledge** — the CRM retrieves specific Knowledge items via the Knowledge Store's own Retrieval capabilities (Knowledge Store §7 — Find by Entity, Topic, Trend, Source, Time). Example: a Customer Detail screen retrieving Knowledge connected to Entities matching that customer's preferences.
- **Reading the Knowledge Graph** — the CRM may follow relationships from a starting Knowledge item or Entity (Knowledge Graph §6's Graph Navigation) to show connected context — not just "here's a Trend," but "here's what that Trend connects to."
- **Reading Evidence** — when a CRM screen shows a Platform-derived fact, it may also show, or link to, the specific Evidence item(s) behind it (Evidence & Provenance Model §3), supporting the Traceability requirement (§8).
- **Reading Source Information** — the CRM may show which Source (Source Registry §3) a piece of Knowledge or Evidence ultimately traces back to, giving a person context on how the information originated (Source Registry §7's Trust Level).

---

## 5. Supported CRM Modules

How each named module *could* consume platform knowledge — with explicit conflict flags where a module's own locked spec currently forbids it.

| CRM Module | How it could consume Platform Knowledge | Status / conflicts |
|---|---|---|
| **Customers** | Knowledge connected to a customer's preferred Material/Color/Origin (Taxonomy & Ontology §4) — surfacing relevant market Trends or Risks near a customer's known interests. | LOCKED CRM module — would need its own new Revision to build. |
| **Products** | Knowledge about the Supplier or Mine connected to a product's own Material/Origin — a Risk or Trend relevant to where that product's material came from. | LOCKED CRM module — would need its own new Revision. |
| **Orders** | Knowledge connected to specific ordered products/materials. | Orders is currently **BLOCKED** (no approved, populated schema) — doubly hypothetical until Orders itself is unblocked. |
| **Inventory** | Knowledge connected to a product's Material/Origin/Supplier, the same way Products might. | Inventory Phase 1 is LOCKED and explicitly read-only/independent — any consumption is a future-phase question, not decided here. |
| **Reports** | Platform-derived Trends surfaced alongside Reports' own internal aggregates. | **Direct conflict:** `docs/REPORTS_SPEC.md` (LOCKED) explicitly bans "AI, Prediction, Forecast... anywhere in Reports" and locks Reports' Independence (no shared business logic with any other module's service file). Not buildable under the current lock without a new Reports Revision explicitly carving out an exception. |
| **Market Intelligence** | Platform-derived Trends/Signals surfaced alongside Market Intelligence's own internal Rankings. | **Direct conflict, the sharpest in this document:** `docs/MARKET_INTELLIGENCE_SPEC.md` (LOCKED) explicitly bans AI/ML/LLM anywhere in the module and locks its own Independence ("computes its own aggregates directly from tables," no dependency on other modules' service code). Market Intelligence is already built and **live** at `/market-intelligence` under that exact ban — consuming this Platform's AI-derived Knowledge would be a fundamental redesign of an already-implemented, already-locked module, not a compatible extension. |
| **Knowledge Vault** | Related Platform Knowledge surfaced alongside Knowledge Vault's own internal reference entries. | **Direct conflict:** `docs/KNOWLEDGE_VAULT_SPEC.md` (LOCKED, Revision 2, Decision 6) states Knowledge Vault "no longer reads any existing CRM data," and Decision 7 keeps it fully separate from `/docs` — while Decision 7 is scoped to `/docs` specifically rather than this external Platform, Decision 6's standalone/no-external-references spirit runs directly counter to becoming a Platform consumer. Also compounds the existing "Knowledge Vault" naming collision (this CRM module vs. the Platform's own Knowledge Store/Knowledge Graph/Platform Architecture §15 Future Module) — surfacing Platform Knowledge inside a module also called "Knowledge Vault" would likely deepen that confusion, not resolve it. |
| **Future Modules** | Platform Architecture §15 already named 8 Platform-side Future Modules (Supplier/Mine/Pricing/Customer/Auction Intelligence, Knowledge Vault, API, Mobile App). Any future CRM module could, in principle, become a new consumer the same way the modules above could, following the same opt-in, independently-governed pattern (§3). | Not yet designed on either side. |

---

## 6. Read-only Boundary

**Can:**
- Read Knowledge, Knowledge Graph relationships, Evidence, and Source Information (§4) for display purposes.
- Choose not to display something the Platform offers — each CRM module's own design decides what, if anything, to surface.
- Operate fully with zero Platform data, at any time (Design Principle 3).

**Cannot:**
- Write, create, update, or delete anything in the Knowledge Store, Knowledge Graph, Evidence, Raw Data Storage, or any Platform layer.
- Trigger, request, or influence Collection, Preprocessing, Understanding, Reasoning, or Knowledge Generation (Packages 2, 5A–5D) — the CRM has no control surface over the Platform's own pipeline.
- Present a Platform-derived fact without a traceable path back to its origin (§8).
- Treat any Platform-derived Knowledge as more authoritative than a CRM module's own locked business rules — a Platform Trend can never override or redefine what a CRM module's own spec already defines as truth about its own data.

---

## 7. Synchronization Principles

Business concepts only — no implementation.

- **Read-time vs. cached.** Whether the CRM reads Platform data fresh on each request or from a periodically-refreshed cache is not decided here — either is compatible with "read-only, one-directional, optional," as long as staleness never blocks or breaks the CRM (Design Principle 3, §6).
- **No CRM-side reconciliation logic.** The CRM never merges, deduplicates, or reinterprets Platform Knowledge — it displays what the Knowledge Store already organized (Knowledge Store §5) as-is.
- **Versioned Knowledge is read as current by default.** When the CRM reads a Knowledge item, it reads the currently Published version (Knowledge Store §4) unless a module specifically chooses otherwise — whether any module would ever want to show Superseded/historical versions is a per-module design decision, not assumed here.
- **No guaranteed timeliness.** This document does not commit to how quickly new Platform Knowledge becomes visible in the CRM — no SLA, refresh interval, or real-time guarantee is defined.

---

## 8. Traceability

```
CRM-displayed insight
   ↓
Knowledge (Knowledge Store, Package 7)
   ↓
Evidence (Evidence & Provenance Model §3)
   ↓
Canonical Document (Canonical Data Model §3)
   ↓
Raw Source (Raw Data Storage §3)
```

This is the same chain Evidence & Provenance Model §9 and Knowledge Graph §8 already established, extended one link further to include the CRM as the outermost consumer. Any CRM screen showing a Platform-derived insight must be able to show, or link to, this full path — the platform-wide Traceability discipline, restated one final time at the point where a person actually sees the result.

---

## 9. Business Examples

**Customer profile enriched with market knowledge.** A Customer Detail screen shows Knowledge connected to Entities matching the customer's known preferences (e.g. favorite Color/Material) — illustrating §4's "Reading Knowledge." Would require the Customer module's own new Revision to actually build.

**Product page showing supplier intelligence.** A Product Detail screen shows Knowledge about the Supplier or Mine connected to that product's Material/Origin — illustrating §4's Knowledge Graph navigation (Product's Origin → connected Mine/Supplier Knowledge). Would require the Product module's own new Revision.

**Report using market trends.** A Reports screen shows a Platform-detected Trend alongside Reports' own internal revenue aggregates. **Explicitly flagged:** this directly conflicts with `REPORTS_SPEC.md`'s locked "no AI, no Prediction, no Forecast" and Independence rules — not buildable under Reports' current lock without a new Revision explicitly reopening that ban.

**Market Intelligence dashboard.** The CRM's own Market Intelligence page shows a Platform-detected Market Signal alongside its own internal Category/Color/Size Rankings. **Explicitly flagged:** this directly conflicts with `MARKET_INTELLIGENCE_SPEC.md`'s locked "no AI/ML/LLM" rule and Independence principle — Market Intelligence is already built and live under that exact ban, making this the most direct conflict in this document, not a compatible extension.

---

## 10. Out of Scope

- Any SQL, API, UI, or database schema — business meaning only, per explicit instruction.
- Any actual implementation or build-out of any module named in §5.
- Reopening, revising, or approving a new Revision for any CRM module's own locked spec (Market Intelligence, Reports, Knowledge Vault, Customer, Product, Inventory) — that remains entirely the CRM's own separate workflow; this Package does not substitute for it.
- Resolving the Market Intelligence / Reports "no AI" conflicts, or the Knowledge Vault naming/independence conflict (§5, §9) — flagged, not resolved.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, `docs/UNDERSTANDING_PIPELINE.md`, `docs/REASONING_PIPELINE.md`, `docs/KNOWLEDGE_GENERATION_PIPELINE.md`, `docs/KNOWLEDGE_GRAPH.md`, or `docs/KNOWLEDGE_STORE.md` — all thirteen referenced only, none modified.
- Any change to any existing CRM module's code, schema, or already-locked spec — nothing in this document authorizes touching Customers, Products, Orders, Inventory, Reports, Market Intelligence, or Knowledge Vault as they exist today.
- Designing the Knowledge Graph's or Knowledge Store's own retrieval/navigation mechanics beyond what Packages 6 and 7 already defined.

---

## 11. Open Questions

1. **Market Intelligence / Reports conflict resolution.** §5 and §9 flag that consuming Platform Knowledge directly conflicts with both modules' own locked "no AI" rules — does the Product Owner intend to eventually revise those CRM specs to carve out an explicit exception for Platform-sourced (not CRM-internal) Knowledge, or are those two modules simply excluded from ever consuming this Platform? Not decided.
2. **Knowledge Vault conflict resolution.** Does Knowledge Vault's "no external references, standalone" lock get revised, or is Knowledge Vault also simply excluded? Not decided — compounded by the ongoing "Knowledge Vault" naming collision.
3. **Per-module approval process.** This document names 7 concrete CRM modules as potential consumers — does each need its own individual new Revision/approval (most consistent with the CRM's existing per-module governance), or could one platform-wide "CRM Integration approved" decision cover several at once? Not decided.
4. **Staleness tolerance.** §7 declines to set a refresh interval or SLA — is any staleness acceptable for every module, or would some (e.g. Risk Detection feeding a Customer screen) need fresher data than others? Not decided.
5. **Presentation of Superseded/historical Knowledge.** Should any CRM module ever surface Superseded versions (e.g. "this Trend was revised last month"), and if so how? Not decided.
6. **Authentication/authorization for CRM reads.** The CRM has no role-based access control anywhere today (established precedent across every CRM module) — does CRM Integration need its own access control independent of that precedent, echoing Platform Architecture §14's own still-open question on this? Not decided.
7. **Orders dependency timing.** Orders integration (§5) is doubly hypothetical since Orders itself is BLOCKED — does CRM Integration's rollout need to wait for Orders specifically, or can the other modules proceed independently regardless of Orders' status? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
