# Jade Intelligence Platform — Taxonomy & Ontology

**Package:** 1.6 — Taxonomy & Ontology
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no schema, no code, no implementation were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1, Revision 1 — **LOCKED**, confirmed by explicit Product Owner decision this session). This is a completely independent platform project, not a CRM module — nothing below modifies any existing CRM code, schema, or UI.

**Canonical Data Model note:** this task instructed continuing from "the LOCKED Canonical Data Model." No such document exists anywhere in this repository (checked `docs/` and the full working tree) — per explicit Product Owner instruction this session, this pass does **not** depend on one. Entity Types (§4) are derived directly from this task's own instructions and from the vocabulary Platform Architecture already established (Sources §7, AI Processing Layer §10, Knowledge Store §11, Future Modules §15) — not from a prior canonical-data-model artifact. If a Canonical Data Model is produced later, it should be checked against this document for consistency (§11 Open Question #3).

---

## 1. Vision

One shared business vocabulary for the entire Jade Intelligence Platform — every Collector, every stage of the AI Processing Layer, every item in the Knowledge Store, and every future CRM screen that ever reads from it, all describing the same real-world concepts with the same names. Without this, the same market fact collected from two different sources (a Facebook post calling a color "Táo xanh" and an industry website calling it "Apple Green") would be stored, counted, and trended as if they were two different things — silently fragmenting the very market knowledge this platform exists to consolidate (`docs/JADE_INTELLIGENCE_PLATFORM.md` §1, §10).

---

## 2. Why Taxonomy exists

A Taxonomy is a classification system — it answers *"what kind of thing is this, and where does it sit relative to other things of its kind?"* Every Entity Type (§4) needs a consistent place in a hierarchy (§8) and a consistent set of Categories (§5) so that:

- The AI Processing Layer's Topic Extraction and Entity Extraction stages (Platform Architecture §10) always classify the same real-world concept into the same slot, regardless of which Collector or source language produced the raw item.
- Trend Detection and Market Signals (Platform Architecture §10) can roll counts and patterns up a hierarchy correctly (e.g. a rising trend in a specific Species should be visible when looking at its parent Material too).
- Anything that later reads from the Knowledge Store (a Future Module, or the CRM via §12's optional integration) can filter, group, and compare using one stable set of classification labels instead of reconciling different sources' inconsistent labels itself.

Without a Taxonomy, every Collector and every downstream consumer would need its own private understanding of "what category does this belong to" — exactly the kind of fragmentation Platform Architecture's Vision (§1) exists to prevent.

---

## 3. Why Ontology exists

Taxonomy alone only answers "what kind of thing" and "where in the hierarchy" — it doesn't answer *"how do things of different kinds relate to each other."* A Mine isn't a type of Material sitting under it in a tree; a Mine *produces* Material. A Trend isn't a type of Price Event; a Trend *affects* Price. An Ontology names these relationships (§7) as first-class, reusable vocabulary — the same relationship name must mean the same thing everywhere it's used.

This matters specifically because:

- Entity Extraction (Platform Architecture §10) doesn't just tag "this raw item mentions a Mine" — it needs to express *what that Mine did* (produced a Material, is located in a Province, is owned by a Company) in a consistent way, or that information is lost.
- Market Signals (Platform Architecture §10) are frequently about relationships, not isolated facts — "a Trend affecting Price" is only expressible if "affects" is a defined, reusable relationship type rather than free text.
- A future Knowledge Store consumer (§15's Future Modules, or CRM Integration §12) needs to traverse these relationships (e.g. "show me every Risk connected to this Origin") — which requires the relationship vocabulary to be fixed in advance, the same way the entities themselves are.

---

## 4. Entity Types

The business-level "nouns" of the platform's shared vocabulary. Each Entity Type is defined at the concept level only — no attributes, no schema, no storage format (Out of Scope, §12 of Platform Architecture and this document's own header). Where a name overlaps with an existing CRM concept (Product, Customer), the definition below is explicitly the *platform's* market-level meaning, not a reference to a specific CRM database row (Naming Rules, §9).

| Entity Type | Business Definition |
|---|---|
| **Product** | A class of sellable/tradeable jade/jewelry item as discussed in the market — a market-level concept, not necessarily one specific CRM product row. |
| **Material** | The substantive raw material a Product is made of or discussed in relation to. |
| **Origin** | The general geographic/source origin associated with a Material or Product — broader and less specific than Mine. |
| **Mine** | A specific, named extraction site that produces Material. |
| **Supplier** | A business entity that sells or trades Product or Material. |
| **Market** | A named trading context, venue, or channel where Product is bought, sold, or discussed (a region's trading circle, a specific trading community, etc.). |
| **Color** | A describable color attribute associated with a Product or Material — a prime example of where many Synonyms (§6) converge on one concept. |
| **Transparency** | A describable clarity/transparency attribute of a Material. |
| **Texture** | A describable surface or structural texture attribute of a Material. |
| **Species** | A precise classification beneath Material — a specific kind of Material (finer-grained than Material itself, see Hierarchy §8). |
| **Treatment** | A describable process applied to a Material or Product (e.g. dyeing, bleaching, or the absence of any treatment) — relevant to market trust/authenticity signals. |
| **Certificate** | A documented authentication or grading record associated with a Product. |
| **Laboratory** | The issuing body of a Certificate. |
| **Customer** | A market participant who buys — a market-level concept, not necessarily one specific CRM customer row. |
| **Company** | A business entity in the market, broader than Supplier (may include competitors, industry organizations, or a Mine/Supplier's owning company). |
| **Country** | A national geography entity. |
| **Province** | A sub-national geography entity, nested under Country (Hierarchy, §8). |
| **Auction** | A market event type where a Product changes hands through bidding. |
| **Price Event** | A single observed data point — a Product or Material priced, sold, or quoted at a specific point in time. The atomic unit Trend Detection builds on. |
| **Trend** | A pattern detected across many Price Events or mentions over time (Platform Architecture §10). |
| **Event** | A general market occurrence, broader than Auction or Price Event (e.g. a mine closure, a new regulation, an industry conference). |
| **Risk** | A market-relevant risk signal or concept (supply risk, authenticity risk, regulatory risk) associated with an Origin, Mine, Supplier, or Material. |
| **Knowledge** | The umbrella entity type for any structured output of the AI Processing Layer — a summary, an extracted fact, a Trend, a Market Signal — always linked back to the entities it's about and the raw item(s) it was derived from (Platform Architecture §10's traceability constraint). |

This list is not closed — new Entity Types are added through the process in §10, not invented ad hoc by a Collector or the AI Processing Layer at runtime.

---

## 5. Categories

A Category is a labeled position in a hierarchical classification tree (§8) that an Entity Type instance — most often a Product or Material — is placed into. Categories are how the Taxonomy (§2) actually gets applied to real entities: every Product/Material instance the platform knows about belongs to exactly one most-specific Category at any point in the hierarchy it's been classified to.

Categories are a platform-level concept, defined and governed independently of the CRM's own `product_category` master data (`crm-thubinh`'s Settings module) — whether the two should be seeded from each other or kept fully separate is a real, unresolved tension between "shared vocabulary" and "platform independence" (§11 Open Question #2), not decided here.

---

## 6. Synonyms

**Rule: many labels, one concept.** Every canonical concept (most commonly an instance of Color, Material, Species, Treatment, or Origin — the descriptive/attribute-like Entity Types) has exactly one canonical name plus any number of Synonyms that all resolve to it. A Synonym may be a spelling variant, a colloquial market term, or a translation into a different language.

Example (as given): **"Apple Green"**, **"Green Apple"**, and **"Táo xanh"** must all resolve to the same one Color concept — regardless of which Collector, source language, or phrasing produced the raw mention.

Synonym resolution is what makes the following possible:
- **Duplicate Detection** (Platform Architecture §10) recognizes that two differently-worded raw items are talking about the same thing.
- **Entity Extraction** (Platform Architecture §10) tags the same canonical concept no matter which language or phrasing the source used.
- **Trend Detection** (Platform Architecture §10) counts mentions correctly — a trend in "Apple Green" demand must include the "Táo xanh" mentions, not miss a third of them because they used a different label.

Synonyms are additive and low-friction (§9, §10) — adding a new known variant of an existing concept does not require the same review weight as adding a whole new Entity Type or Category.

---

## 7. Relationships

The Ontology's core vocabulary — typed, reusable connections between Entity Types (§4).

| Subject | Relationship | Object |
|---|---|---|
| Product | belongs to | Origin |
| Product | made of | Material |
| Product | has | Color / Transparency / Texture / Treatment |
| Product | certified by | Certificate |
| Certificate | issued by | Laboratory |
| Mine | produces | Material |
| Mine | located in | Province |
| Province | located in | Country |
| Supplier | sells | Product |
| Supplier | operates in | Market |
| Company | owns | Mine / Supplier |
| Customer | buys | Product |
| Auction | offers | Product |
| Price Event | records price of | Product |
| Trend | affects | Price Event |
| Trend | derived from | Price Event / Knowledge |
| Event | impacts | Mine / Supplier / Market / Material |
| Risk | associated with | Origin / Mine / Supplier / Material |
| Knowledge | about | any Entity Type |

This table names the relationship vocabulary itself, not cardinality or directionality constraints (e.g. whether a Product can belong to more than one Origin) — those are not decided here (§11 Open Question #6).

---

## 8. Hierarchy

Parent-child chains distinct from the Ontology's typed relationships (§7) — these are pure classification hierarchies (is-a / part-of):

- **Country → Province** — a Province is part of exactly one Country.
- **Material → Species** — a Species is a specific kind of Material (finer-grained, §4).
- **Product → Category** (§5) — a Product is classified into a Category, which may itself sit under a broader parent Category.
- **Knowledge → Category** — Knowledge items (§4) are classified into Categories the same way Product/Material are, distinct from — and not to be confused with — the CRM's separate, already-built "Knowledge Vault" module's own category scheme (`docs/KNOWLEDGE_VAULT_SPEC.md` §1.3), which governs an unrelated, CRM-internal set of reference content (§11 Open Question #4).

Geography (Country → Province) and Material (Material → Species) are the two hierarchies named explicitly by this task; Category (§5) is the general-purpose hierarchy Product and Knowledge both use.

---

## 9. Naming Rules

- Every canonical concept has exactly one canonical name. Which language that canonical name is recorded in is not decided here (§11 Open Question #1) — the market this platform observes spans at least Vietnamese, English, and likely Chinese source material.
- A canonical name must be unique within its own Entity Type — no two different Color concepts share one canonical name.
- **Renaming a canonical concept is a governed change**, not a routine edit — it can silently change the meaning of historical Trend and Knowledge data that already reference it, so it follows the same Business-Design-first discipline as the rest of this platform (Platform Architecture §3, Principle 8).
- **Adding a Synonym to an existing canonical concept is additive and low-friction** (§6) — it does not require the same review weight as a rename, a merge, or a new Entity Type.
- **Merging two previously-separate canonical concepts into one, or splitting one into two, is a taxonomy-level change** requiring review — both can silently change what historical Knowledge means.
- Where a Taxonomy name overlaps with an existing CRM term (Product, Customer — §4), the definition here is always the platform's own market-level meaning; it is never assumed to mean the specific CRM database concept unless a future CRM Integration (Platform Architecture §12) explicitly maps the two together.

---

## 10. Future Extension

- New Entity Types, Categories, or Relationship types are proposed and added through the same Business-Design-first governance this whole platform follows (Platform Architecture §3, Principle 8) — never invented ad hoc by a Collector or the AI Processing Layer at runtime.
- A new source type (a new Collector, Platform Architecture §7-§8) may surface concepts the current Taxonomy doesn't yet cover — when that happens, this document is revisited as a new Revision, rather than the Collector inventing its own local vocabulary.
- Synonyms (§6, §9) are the intended low-friction extension point — most new terminology should enter as a new Synonym on an existing canonical concept, not as a whole new Entity Type.
- **Backward compatibility:** a Taxonomy change must never invalidate Knowledge already stored referencing an existing concept — a concept gaining a Synonym, or moving within a hierarchy, should only ever add context, never break an existing reference.

---

## 11. Open Questions

1. **Primary canonical language.** Canonical names need a designated primary language (Vietnamese, English, or a language-neutral scheme) — not decided. The market this platform observes spans multiple languages.
2. **Category alignment with the CRM.** Should this platform's Category taxonomy (§5) be seeded from the CRM's existing `product_category`/`product_color` master data, or kept fully independent? Shared vocabulary favors alignment; platform independence (Platform Architecture Principle 1) favors separation — not resolved here.
3. **Canonical Data Model reconciliation.** This document was built without a Canonical Data Model (see header note). If one is produced later, it needs to be checked against this Taxonomy & Ontology for consistency — not yet a decided process.
4. **"Knowledge" naming overlap.** Three different things now share "Knowledge" naming: this document's **Knowledge** Entity Type (§4/§8), the Platform Architecture's **Knowledge Store** (§11) and **Knowledge Vault** Future Module (§15), and the CRM's separate, already-built **Knowledge Vault** module (`docs/KNOWLEDGE_VAULT_SPEC.md`) — an unrelated, CRM-internal read-only reference-content feature. Worth an explicit Product Owner check, the same way the "Jade Intelligence" name collision was flagged in Package 1.
5. **Depth of Species/Treatment/Certificate/Laboratory.** How finely should these subdivide (e.g. is Species one flat list, or its own sub-hierarchy)? Not decided — likely clearer once real source-data volume is known.
6. **Relationship cardinality and directionality.** §7 names the relationship vocabulary but not its constraints (e.g. can a Product belong to more than one Origin? Can a Mine be owned by more than one Company over time?) — not decided.
7. **Ambiguous Synonym resolution.** How the platform handles a term that could plausibly map to two different canonical concepts depending on context — not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
