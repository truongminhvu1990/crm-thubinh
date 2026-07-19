# Jade Intelligence Platform — Knowledge Store

**Package:** 7 — Knowledge Store
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no storage technology, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4), `docs/PREPROCESSING_PIPELINE.md` (Package 5A), `docs/UNDERSTANDING_PIPELINE.md` (Package 5B), `docs/REASONING_PIPELINE.md` (Package 5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (Package 5D), `docs/KNOWLEDGE_GRAPH.md` (Package 6) — all twelve treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the twelve is modified by this document. This is a full business-design elaboration of the "Knowledge Store" Platform Architecture §11 already named — not a rename or replacement of it.

---

## 1. Vision

The Knowledge Store is the platform's single, persistent repository of every published Knowledge item — the place Knowledge actually lives once Knowledge Generation Pipeline (Package 5D) has created it. Its job is narrow and disciplined: **it stores Knowledge, makes it retrievable, and tracks its lifecycle and versions.** It does not reason about anything — that already happened in Reasoning (Package 5C) and Knowledge Generation (Package 5D) — and it does not provide the relationship-navigation view over Knowledge — that is the Knowledge Graph (Package 6), a separate layer built on top of what the Store holds.

---

## 2. Design Principles

1. **The Knowledge Store stores Knowledge — nothing more.** It never performs reasoning and never performs navigation.
2. **Only Knowledge Generation Pipeline writes into the Knowledge Store.** Consistent with Knowledge Generation Pipeline §9's "Knowledge is created only there" rule — the Knowledge Store has no creation logic of its own; it receives already-created, already-validated Knowledge and persists it.
3. **Every Knowledge item remains exactly as traceable as every prior package already required.** Storing Knowledge never loosens its connection back to Evidence, Canonical Documents, Raw Sources, and Collectors.
4. **Versioning is preserved, never collapsed.** Consistent with Knowledge Generation Pipeline §10, the Knowledge Store retains every version of a Knowledge item, not just its latest — Superseded versions (§4) are retained, not deleted.
5. **The CRM is a consumer, never the owner.** The CRM may read from the Knowledge Store (Platform Architecture §12, one-directional/read-only/optional) but never writes into it, and the Knowledge Store's own design and operation are never the CRM's responsibility.
6. **Storage-technology-agnostic.** This document describes business behavior only — no specific storage technology is chosen, per explicit instruction.

---

## 3. Knowledge Definition

**Business meaning of a Knowledge item.** A Knowledge item is a persistent, structured record of a conclusion the platform has reached — a Trend, a Market Signal, a Risk, an Opportunity, a discovered Relationship, or any other finding that survived the full Knowledge Generation Pipeline (Evidence Validation, Confidence Assignment, Conflict Review) before being Created (restating Taxonomy & Ontology §4's Knowledge Entity Type and Knowledge Generation Pipeline §9's Knowledge Creation). Once Created, a Knowledge item's home is the Knowledge Store — this is where it persists, is organized, is versioned, and is retrieved from.

---

## 4. Knowledge Lifecycle

```
Candidate
   ↓
Published
   ↓
Updated
   ↓
Superseded
   ↓
Archived
```

This is the Knowledge Store's own storage-side view of a Knowledge item's life — distinct from, but picking up right where, Knowledge Generation Pipeline §4's creation-side lifecycle leaves off.

- **Candidate** — a Knowledge item has just been Created by Knowledge Generation Pipeline (§9 there) and has arrived at the Knowledge Store, but has not yet been made generally available (mirroring the Creation-vs-Publication gap Knowledge Generation Pipeline §11 already left open).
- **Published** — the Knowledge item has been made available to downstream consumers — the Knowledge Graph (§8) and, if applicable, CRM Integration (§9) — matching Knowledge Generation Pipeline §11's Knowledge Publication event.
- **Updated** — a newer version of this Knowledge item has been Created and Published (Knowledge Generation Pipeline §10's Versioning) — the item now has more than one version in the Store.
- **Superseded** — when a newer version becomes the current Published version, the prior version's state becomes Superseded. It remains fully retained and traceable, but is no longer presented as current/authoritative.
- **Archived** — the Knowledge item, or a specific version of it, is no longer expected to be actively relevant going forward, but remains permanently retained and traceable — the same "Archived means reduced relevance, never deletion" principle already established for Raw Data Storage §4 and Source Registry §4.

---

## 5. Knowledge Organization

**Business concepts only — no database design.** How Knowledge is grouped for retrieval (§7):

- **By Entity** — Knowledge organized around which Taxonomy & Ontology Entity Type(s) and specific instance(s) it's about (the "Knowledge — about — any Entity Type" relationship, Taxonomy & Ontology §7).
- **By Category** — Knowledge organized via the same Category structure Product and Knowledge already share (Taxonomy & Ontology §5, §8).
- **By Type of finding** — Knowledge organized by what kind of conclusion it represents: a Trend, a Market Signal, a Risk, an Opportunity, a discovered Relationship (Reasoning Pipeline §8–11).
- **By Source lineage** — Knowledge organized by which Source(s) it transitively traces back to (Source Registry, Raw Data Storage) — useful for "what do we know that came from this Source."
- **By time** — Knowledge organized by when it was Published, Updated, or Superseded (§4) — a chronological organizing concept, not a technical index.

These are organizing concepts a future retrieval capability (§7) can draw on — no database design, index, or schema is implied.

---

## 6. Knowledge Versioning

**Business rules — reuses the LOCKED Knowledge Generation Pipeline.** A Knowledge item evolves through tracked versions, and historical versions remain retained and traceable, never silently overwritten (restating Knowledge Generation Pipeline §10 directly, not redefining it). The Knowledge Store is where this versioning actually lives and persists — retaining every version is the Store's job (Design Principle 4), while Knowledge Generation Pipeline remains the only place a new version is ever created (Design Principle 2). The Knowledge Store's own Superseded state (§4) is how the Store represents "this version is retained but no longer current" in its own lifecycle terms.

---

## 7. Knowledge Retrieval

**Business meaning only.**

- **Find by Entity** — retrieving every Knowledge item connected to a specific Entity (Taxonomy & Ontology §4) — e.g. every piece of Knowledge about a specific Mine.
- **Find by Topic** — retrieving Knowledge items whose subject matter (Understanding Pipeline §8's Topic Detection) matches a given topic.
- **Find by Trend** — retrieving Knowledge items that are, or relate to, a specific detected Trend (Reasoning Pipeline §8; Taxonomy & Ontology §4's Trend Entity Type).
- **Find by Source** — retrieving Knowledge items that trace back to a specific registered Source (Source Registry §3) — the retrieval-side counterpart to §5's "By Source lineage" organization.
- **Find by Time** — retrieving Knowledge items based on when they were Published, Updated, or Superseded (§4).

These describe what a person or a future consumer (a Future Module, Platform Architecture §15, or CRM Integration, §9) should be able to ask the Knowledge Store — not a query language or technical index design.

---

## 8. Relationship with Knowledge Graph

**Clearly distinguished, restating and reinforcing `docs/KNOWLEDGE_GRAPH.md` §9's own distinction, now from the Store's side:**

- The **Knowledge Store** holds Knowledge itself — the actual persisted content of every Knowledge item, its versions, and its lifecycle state (§4).
- The **Knowledge Graph** (Package 6) is a separate navigation layer built on top of what the Knowledge Store — and the other layers (Evidence, Canonical Documents, Raw Sources, Sources) — already holds. It does not store Knowledge a second time.
- **Knowledge Retrieval (§7) and Graph Navigation (Knowledge Graph §6) are related but distinct capabilities:** Knowledge Retrieval finds Knowledge items directly (by Entity, Topic, Trend, Source, Time); Graph Navigation follows relationships between Knowledge and other node types to explore connections. A future consumer might use either, or both together — this document doesn't decide how they're combined, only that they remain conceptually distinct: one stores, one navigates.

---

## 9. Relationship with CRM

**Business meaning only — the CRM is a consumer, never the owner.**

- The CRM may, in the future, read from the Knowledge Store (one-directional, read-only, optional) — the same constraint Platform Architecture §12 already established, not redesigned here.
- The CRM never owns, writes to, or is responsible for the Knowledge Store's design, content, or operation — the Knowledge Store's business rules (this document), lifecycle (§4), and versioning (§6) are entirely this platform's own responsibility, independent of whatever the CRM does or doesn't do.
- The Knowledge Store must remain fully functional whether or not the CRM ever integrates with it (Platform Architecture Principle 4).

---

## 10. Business Examples

**Market Trend.** A Trend Knowledge item (Reasoning Pipeline §8; Knowledge Generation Pipeline's "New Market Trend" example) — organized by Type of finding and by Entity (§5), retrievable by Find by Trend or Find by Entity (§7), its lifecycle moving from Candidate through Published, potentially Updated/Superseded as new Evidence arrives (§4).

**Supplier Profile.** An accumulation of Knowledge items all connected to the same Supplier Entity (Taxonomy & Ontology §4) — organized By Entity, retrievable via Find by Entity to build a fuller picture of everything the platform knows about that one Supplier, even though each individual Knowledge item was Created separately over time.

**Mine Profile.** The same pattern as Supplier Profile, but for a Mine Entity — Knowledge about supply conditions, Risk (Reasoning Pipeline §10), and Relationships to Material ("Mine produces Material," Taxonomy & Ontology §7) all organized around the one Mine Entity.

**Price Knowledge.** A Knowledge item derived from Market Observation Evidence (Evidence & Provenance Model §6) — organized By Type of finding, retrievable by Find by Entity (the Product/Material it concerns) or Find by Time (when the price information was current).

**Historical Knowledge.** A Knowledge item that has itself been used as Historical Knowledge Evidence (Evidence & Provenance Model §6) for a newer Knowledge item — illustrating that the Knowledge Store doesn't only hold "current" Knowledge; it retains exactly the kind of older, still-valid Knowledge that future Reasoning (5C) and Knowledge Generation (5D) cycles can draw on as Evidence.

---

## 11. Out of Scope

- Any SQL, database schema, or storage technology — business meaning only, per explicit instruction.
- Any reasoning logic of any kind — Reasoning Pipeline (5C) and Knowledge Generation Pipeline (5D) already did that; the Knowledge Store performs none of it.
- Any navigation/relationship-traversal logic — that's the Knowledge Graph's job (Package 6), not the Store's.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, `docs/UNDERSTANDING_PIPELINE.md`, `docs/REASONING_PIPELINE.md`, `docs/KNOWLEDGE_GENERATION_PIPELINE.md`, or `docs/KNOWLEDGE_GRAPH.md` — all twelve referenced only, none modified.
- Any CRM code, schema, or module change — CRM Integration is named only as a future, optional, read-only consumer (§9), not designed here.
- Any specific query language, index design, or retrieval technology (§7) — retrieval capabilities are named at business level only.
- Designing exactly how Knowledge Organization (§5) or Knowledge Retrieval (§7) are technically implemented.

---

## 12. Open Questions

1. **Candidate-to-Published gap ownership.** §4's Candidate state mirrors Knowledge Generation Pipeline's own Open Question #2 (who decides when a Created-but-unpublished Knowledge item is released) — not resolved here either, only given a name in the Store's own lifecycle.
2. **Superseded vs. Archived scope.** Can a Knowledge item have some Superseded versions while its current version is still actively Published — and does Archived ever apply to just one version rather than the whole item? Not decided.
3. **Knowledge Organization overlap.** §5 names five organizing concepts — can one Knowledge item be organized under several simultaneously, and if so is there a primary concept for a given retrieval, or are they all equally available facets? Not decided.
4. **Retrieval combining Store and Graph.** §8 states the two are distinct, but doesn't decide whether a single retrieval is expected to combine both (find, then navigate) or whether they're always used as separate steps. Not decided.
5. **CRM read granularity.** §9 states CRM Integration is read-only/optional, but not whether a future integration would read individual Knowledge items, pre-organized bundles (§5), or something else — the same open question Platform Architecture §12 and Knowledge Generation Pipeline §11 already left for a future, separate CRM-side task.
6. **Historical Knowledge circularity.** §10's Historical Knowledge example shows Knowledge feeding back in as Evidence for new Knowledge — does the Store need to guard against or track how many "generations" deep this goes, the same concern Evidence & Provenance Model's own Open Question #5 already raised? Not decided, carried forward.
7. **Archival retention policy.** Consistent with Raw Data Storage's own open retention question, does Knowledge ever get deleted from the Knowledge Store, or is Archived (§4) always permanent retention with reduced relevance only? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
