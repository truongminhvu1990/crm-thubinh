# Jade Intelligence Platform — Knowledge Graph

**Package:** 6 — Knowledge Graph
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no graph database design, no Neo4j, no RDF, no ontology language, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3), `docs/RAW_DATA_STORAGE.md` (Package 4), `docs/PREPROCESSING_PIPELINE.md` (Package 5A), `docs/UNDERSTANDING_PIPELINE.md` (Package 5B), `docs/REASONING_PIPELINE.md` (Package 5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (Package 5D) — all eleven treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the eleven is modified by this document. **This document directly resolves Knowledge Generation Pipeline §14 Open Question #3** ("is the Knowledge Graph a separate structure, or another view of the Knowledge Store?") — see §9.

---

## 1. Vision

The Knowledge Graph is the business navigation layer that lets the platform — and anyone consuming it — move between Knowledge, Entities, Evidence, and Sources by following their actual relationships. Instead of treating each Knowledge item as an isolated record, the Knowledge Graph makes explicit how everything connects: which Knowledge is backed by which Evidence, which Entities a piece of Knowledge is about, which Sources ultimately stand behind it. It is a way of *navigating* what the rest of this platform already holds, not a second place where facts live.

---

## 2. Design Principles

1. **The Knowledge Graph is a navigation layer, not a storage technology.** It represents relationships between things the platform already has (Knowledge, Entities, Evidence, Sources); it does not introduce a new place where those things are independently stored.
2. **Every graph relationship is grounded in something real.** A connection in the Knowledge Graph is never invented for navigation convenience — it always corresponds to a real relationship already established elsewhere in this platform's locked design.
3. **No new relationship vocabulary.** Relationship Types (§5) reuse the LOCKED Taxonomy & Ontology's own Relationships — the Knowledge Graph doesn't invent a separate relationship language.
4. **Traceability is a graph property, not just a document property.** Because the Knowledge Graph makes Evidence Chain connections explicit and navigable, tracing from any Knowledge node back to its Raw Source (§8) isn't just possible in principle — it's a path you can actually walk through the graph.
5. **The graph grows; it is never redesigned by growth.** Adding new Knowledge, Entities, Evidence, or Sources naturally adds new nodes and relationships (§7) — it never requires redesigning the graph's own node/relationship vocabulary.
6. **Technology-agnostic.** No graph database, no Neo4j, no RDF, no ontology language, no implementation is chosen anywhere in this document.

---

## 3. Graph Concepts

- **Node** — a single thing the Knowledge Graph represents: a specific Knowledge item, a specific Entity, a specific piece of Evidence, a specific Source, and so on (§4). A node is not a new object the graph creates — it's a graph-navigable representation of something that already exists elsewhere in the platform.
- **Relationship** — a named, typed connection between two nodes (§5), reusing the Taxonomy & Ontology's own Relationship vocabulary plus the platform's own structural connections (e.g. Knowledge "supported by" Evidence, Evidence & Provenance Model §3).
- **Path** — a sequence of nodes connected by relationships, followed from one node to another — e.g. from a Knowledge node, through the Evidence supporting it, through the Canonical Document(s) that Evidence came from, to the Raw Source and Collector that originally collected it (§8). A Path is what makes a chain of reasoning or provenance walkable, not just theoretically traceable.
- **Context** — the surrounding nodes and relationships that give a single node richer meaning — e.g. a Knowledge node's Context might include every Entity it's about, every Evidence item supporting it, and every other Knowledge item connected to those same Entities. Context is what makes the graph useful for exploration, not just point-to-point tracing (§12 Open Question #2 on how far Context extends).

---

## 4. Node Types

Business meaning only.

| Node Type | Business Meaning |
|---|---|
| **Knowledge** | A node representing one Knowledge item (Taxonomy & Ontology §4's Knowledge Entity Type; created only by Knowledge Generation Pipeline §9). |
| **Entity** | A node representing one instance of any Taxonomy & Ontology Entity Type (§4 there — a specific Product, Material, Origin, Mine, Supplier, etc.). |
| **Evidence** | A node representing one Evidence item (Evidence & Provenance Model §3). |
| **Canonical Document** | A node representing one Canonical Document (Canonical Data Model §3). |
| **Raw Source** | A node representing one Raw Data item (Raw Data Storage §3). |
| **Source** | A node representing one registered Source (Source Registry §3). |
| **Future Node Types** | Not closed — new Node Types can represent new kinds of things the platform comes to hold, without redesigning the graph's own concepts (Design Principle 5). |

---

## 5. Relationship Types

**Reuses the LOCKED Taxonomy & Ontology. Business meaning only.** Two kinds of Relationship Types populate the Knowledge Graph:

- **Ontology Relationships** (`docs/TAXONOMY_AND_ONTOLOGY.md` §7) — connections between Entity nodes themselves (e.g. Product *belongs to* Origin, Mine *produces* Material, Supplier *sells* Product, Trend *affects* Price) — reused exactly as already defined, never redefined here.
- **Structural/Provenance Relationships** — connections the platform's own prior packages already established between node types: Knowledge *supported by* Evidence (Evidence & Provenance Model §3), Evidence *drawn from* Canonical Document (Evidence & Provenance Model §5's Evidence Chain), Canonical Document *normalized from* Raw Source (Canonical Data Model §7), Raw Source *collected from* Source (Source Registry §3, Raw Data Storage §3's Provenance).

No new Relationship Type is invented by this document — only these already-implied connections are formally named as graph-navigable for the first time.

---

## 6. Graph Navigation

Business meaning only.

- **Find related Knowledge** — starting from a Knowledge or Entity node, follow relationships to discover other Knowledge connected to it — other Knowledge about the same Entity, or Knowledge that was itself used as Historical Knowledge Evidence (Evidence & Provenance Model §6) for this one.
- **Find supporting Evidence** — starting from a Knowledge node, follow its "supported by" relationships (§5) to see every Evidence item behind it — the same information Evidence & Provenance Model §9's Traceability Rules already require, now navigable as a graph query rather than only a documented rule.
- **Find connected Entities** — starting from a Knowledge or Evidence node, follow relationships to see which Entities (§4) it's about, and from there, which Ontology Relationships (§5) connect those Entities to others.
- **Find Source history** — starting from a Source node, follow relationships forward to see every Raw Source, Canonical Document, Evidence, and Knowledge that ultimately traces back to it — a full picture of everything the platform has ever built from one particular Source.

---

## 7. Graph Evolution

**Business meaning only.** The Knowledge Graph grows exactly as the rest of the platform grows: every new Canonical Document adds a node; every new Evidence item adds a node and relationships to its Canonical Document(s); every new or versioned Knowledge item (Knowledge Generation Pipeline §9–10) adds or updates a node and its relationships; every newly-recognized Entity or Relationship (Understanding Pipeline §6–7, Reasoning Pipeline §7) adds nodes and relationships. The graph never needs to be redesigned to accommodate this growth — it only gains new nodes and relationships within the Node Types (§4) and Relationship Types (§5) already defined (Design Principle 5).

When a Knowledge item is versioned (Knowledge Generation Pipeline §10), the graph reflects this the same way — the prior version's node and relationships remain, never removed, and the new version's node/relationships are added alongside them, so a traversal can distinguish current Knowledge from Knowledge as it existed at an earlier version if needed (§12 Open Question #1).

---

## 8. Traceability

Any Knowledge node in the graph can always be walked, relationship by relationship, back to a Raw Source node:

```
Knowledge
   ↓ (supported by)
Evidence
   ↓ (drawn from)
Canonical Document
   ↓ (normalized from)
Raw Source
   ↓ (collected from)
Source
```

This is the same chain Evidence & Provenance Model §9 already mandated in words — the Knowledge Graph is what makes that chain an actual, followable path rather than only a documented rule. No Knowledge node may exist in the graph without this path being complete, consistent with every prior package's traceability requirement.

---

## 9. Relationship with Knowledge Store

**Clearly distinguished, business concepts only:**

- The **Knowledge Store** (Platform Architecture §11) is where Knowledge — and the AI Processing Layer's other output — actually lives: the platform's single source of truth for processed market knowledge.
- The **Knowledge Graph** (this document) is a way of navigating and understanding the relationships between what the Knowledge Store, and the rest of the platform, already holds. It is **not** a second place where Knowledge, Entities, Evidence, or Sources are independently stored.
- Put simply: **the Knowledge Store answers "what do we know"; the Knowledge Graph answers "how does what we know connect to everything else."**

This directly resolves Knowledge Generation Pipeline §14 Open Question #3: the Knowledge Graph is not a separate storage structure competing with the Knowledge Store — it is a navigation layer over it, and over the other node types named in §4, each of which already lives in its own designed layer (Canonical Documents in normalized form, Raw Sources in Raw Data Storage, Sources in the Source Registry).

---

## 10. Business Examples

- **Product ↔ Origin** — an Ontology Relationship ("Product belongs to Origin," Taxonomy & Ontology §7) connecting two Entity nodes directly — no Knowledge or Evidence involved, just the Ontology's own structure made walkable.
- **Supplier ↔ Mine** — either an Ontology Relationship ("Company owns Mine/Supplier"), or a Relationship Discovery finding (Reasoning Pipeline §7) connecting a specific Supplier Entity to a specific Mine Entity based on cross-document Evidence — showing that some graph relationships come directly from the locked Ontology, while others are discovered findings that got promoted through Knowledge Generation.
- **Trend ↔ Price** — an Ontology Relationship ("Trend affects Price Event," Taxonomy & Ontology §7, Platform Architecture) connecting a Trend Entity node to a Price Event Entity node.
- **Knowledge ↔ Evidence ↔ Source** — a full structural path: a Knowledge node connected to the Evidence node(s) that support it, each Evidence node connected (through its Canonical Document and Raw Source) back to the Source it ultimately came from — the exact Traceability path described in §8, shown here as a concrete worked example.

---

## 11. Out of Scope

- Any graph database design, Neo4j, RDF, or ontology language selection — business meaning only, per explicit instruction.
- Any SQL, database schema, or code.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, `docs/SOURCE_REGISTRY.md`, `docs/RAW_DATA_STORAGE.md`, `docs/PREPROCESSING_PIPELINE.md`, `docs/UNDERSTANDING_PIPELINE.md`, `docs/REASONING_PIPELINE.md`, or `docs/KNOWLEDGE_GENERATION_PIPELINE.md` — all eleven referenced only, none modified.
- Any CRM code, schema, or module change.
- Designing how Graph Navigation (§6) is actually queried or presented to a person — this document describes what navigation means at a business level, not a query language or UI.
- Any new Relationship Type beyond Taxonomy & Ontology §7's Ontology Relationships and the structural/Provenance relationships named in §5.
- Performance or scale characteristics of graph traversal — Platform Architecture §13's Scalability principles apply generally; this document adds no graph-specific scaling detail.

---

## 12. Open Questions

1. **Node identity across versions.** When a Knowledge item is versioned (§7), does its graph node represent the Knowledge item's identity across all versions (with version history as an internal detail), or does each version get its own distinct node? Not decided — a direct continuation of Knowledge Generation Pipeline Open Question #5 (versioning granularity).
2. **Context boundary.** §3 describes Context as "surrounding nodes and relationships" without bounding how far out it extends — one relationship-hop, several, or does it vary by use case? Not decided.
3. **Conflicting Evidence in the graph.** Evidence & Provenance Model §8 preserves Conflicting Evidence rather than resolving it — does the graph represent a conflict as two Evidence nodes both connected to the same Knowledge (or to competing Knowledge Candidates), structurally distinguished from non-conflicting support? Not decided.
4. **Discovered vs. extracted relationships.** Reasoning Pipeline §7's Relationship Discovery can infer a Relationship across multiple Evidence items with no single document stating it outright — does that appear in the graph identically to a Relationship Understanding extracted directly from one document, or is it distinguished somehow? Not decided.
5. **Graph paths and Raw Data retention.** Raw Data Storage §9 leaves open whether Raw Data is ever deleted — if a Raw Source node is ever removed under a future retention policy, what happens to graph paths that currently terminate there? Not decided — echoes Raw Data Storage's own Open Question #3.
6. **Multiple Sources corroborating one fact.** If the same underlying fact is corroborated by Evidence from several different Sources, does "Find Source history" (§6) treat each Source's contribution as a separate path, or does the graph offer any aggregated view across Sources? Not decided.
7. **Future Node/Relationship Type governance.** §4's Future Node Types and Design Principle 5 allow the graph's vocabulary to grow — does adding a new Node Type require the same Business-Design-first governance already established for new Entity Types (Taxonomy & Ontology §10), or is it lighter-weight since it's "just" a navigation layer over things that already exist? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
