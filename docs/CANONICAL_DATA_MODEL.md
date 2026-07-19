# Jade Intelligence Platform — Canonical Data Model

**Package:** 1.5 — Canonical Data Model
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no JSON schema, no TypeScript, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1, Revision 1 — **LOCKED**). Not modified by this document. `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6, Draft) is referenced for cross-context only, also not modified — per this task's explicit "do not modify any previous package" instruction.

---

## 1. Vision

Every source the platform ever collects from — a Facebook post, a website article, an RSS item, a PDF report, a CRM record, an Excel file, an API response, or a source not yet invented — must normalize into **one universal business object**: the Canonical Document. From the moment a raw item is normalized onward, the AI Processing Layer, the Knowledge Store, and everything built on top of them never need to know, and never ask, where a document originally came from. AI reads only Canonical Documents.

This is the concrete shape behind two things Platform Architecture already locked: the Collector Framework's "one common interface" (Package 1 §8) and the "source-agnostic core" principle (Package 1 §3.6). The Canonical Data Model is what that interface's output, and that agnosticism, actually consist of.

---

## 2. Design Principles

1. **One universal shape.** Every Collector, regardless of source type, ultimately produces data conforming to one Canonical Document definition — no source-specific variants, no structurally different shapes depending on origin.
2. **Source-blindness for AI.** Source, Source Type, and Collector are recorded as fields *on* the Canonical Document (for traceability, §8) — they are not different processing paths. The AI Processing Layer's stages (Platform Architecture §10) never branch on where a document came from.
3. **Normalization happens once, at the boundary.** Converting a source-specific raw item into a Canonical Document happens exactly once, at the Collector → Raw Data Layer boundary (Platform Architecture §6). It is never redone, and never done ad hoc, later in the pipeline.
4. **Traceability is non-negotiable.** Normalizing many different source shapes into one universal shape must never lose the ability to trace a document back to its original raw content and source (§8).
5. **Additive extensibility.** Supporting a new source type must never require changing the Canonical Document's own definition (§9). Source-specific detail belongs in Metadata (§6) or Attachments (§5), never as a new top-level field bolted on for one source.
6. **Collected facts don't change.** Once a Canonical Document is normalized, its collected facts (Content, Source, Collected Time, etc.) are stable — only its lifecycle Status (§4) and the Knowledge later derived from it move forward.

---

## 3. Canonical Document

The universal business object every source normalizes into. Business meaning only — no technical schema, no field types, no storage format.

| Field | Business Meaning |
|---|---|
| **Document ID** | The one stable identity a Canonical Document is known by throughout the platform, regardless of source — what every downstream layer (AI Processing, Knowledge Store, traceability) refers to when pointing at this exact document. |
| **Source** | The specific source instance the content came from — e.g. which specific Facebook group, which specific website, which specific RSS feed, which specific CRM. The identifiable "where," at the specific-instance level. |
| **Source Type** | The general category of source — Facebook, Website, RSS, PDF, CRM, Excel, API, or a Future Source (Platform Architecture §7). Lets the platform report and govern by source category without per-Collector logic. |
| **Collector** | Which specific Collector (Platform Architecture §8) produced this document — the accountable component if this document's normalization ever needs investigating. |
| **Language** | Which language the content is written in. A *discovered* fact about the content — typically set by the AI Processing Layer's Language Detection stage (Platform Architecture §10), not dictated by the Source or Collector. |
| **Title** | A short, human-readable label for the document's content — how a person browsing the Knowledge Store, or a future UI, identifies it at a glance. |
| **Content** | The substantive body content of the document — the primary material the AI Processing Layer works on. |
| **Summary (future)** | A short, AI-produced condensation of Content. Explicitly a future field — produced later by the AI Processing Layer's Summarization stage (Platform Architecture §10), never populated at collection time. |
| **Author** | Whoever is credited as having created, posted, or published the original content, where known. May be unknown or blank for some source types. |
| **Published Time** | When the original content was published or posted at its source — distinct from when the platform collected it. |
| **Collected Time** | When the platform's Collector actually captured this document. Always known and always recorded, even when Published Time isn't available. |
| **URL** | A reference back to where the original content can be found, where such a location exists. Some sources (Manual Import, an internal PDF) may not have one. |
| **Attachments** | Any non-text media bundled with the document (§5) — a first-class part of the Canonical Document, never lost during normalization. |
| **Metadata** | The flexible, source-specific extra information a Collector can attach without changing the Canonical Document's own definition (§6) — the escape valve that keeps the model universal. |
| **Hash** | A business-level fingerprint of the document's content, used to support duplicate/identity recognition (§7). Named here as a business concept only — no algorithm is chosen. |
| **Status** | Where this document currently sits in its lifecycle (§4): Collected, Normalized, AI Processed, Knowledge Created, or Archived. |

---

## 4. Document Lifecycle

```
Collected
   ↓
Normalized
   ↓
AI Processed
   ↓
Knowledge Created
   ↓
Archived
```

- **Collected** — a Collector has captured the raw item; it exists in the Raw Data Layer (Platform Architecture §9), not yet in Canonical Document shape.
- **Normalized** — the raw item has been transformed into the one universal Canonical Document shape (§3). From this point on, nothing downstream needs to know the original source format.
- **AI Processed** — the AI Processing Layer (Platform Architecture §10) has run its stages — Cleaning through Market Signals — against this Canonical Document.
- **Knowledge Created** — the AI Processing Layer's output has produced one or more Knowledge items (Taxonomy & Ontology §4's Knowledge Entity Type) in the Knowledge Store, each traceable back to this Canonical Document (§8).
- **Archived** — the document has reached the end of its active lifecycle. Still retained (Raw Data Layer's append-only, indefinite-retention principle, Platform Architecture §9), but no longer actively processed or surfaced as current.

---

## 5. Attachment Model

An Attachment is a piece of non-text media that travels with a Canonical Document as a first-class, individually addressable part of it — not just inline content. A Facebook post's photos, a PDF report's own file, a website article's embedded video are all Attachments of the Canonical Document they arrived with.

Covered types:
- **Images**
- **Videos**
- **PDF** (the document file itself, when the Canonical Document's primary source *is* a PDF Report, or a PDF included as supporting material for another source type)
- **Audio**
- **Future attachments** — the model must accommodate new attachment types without changing the Canonical Document's own definition (Design Principle 5).

Each Attachment always remains attached to exactly one parent Canonical Document — it is not an independent top-level object in this model (see §12 Open Question #4 on whether that should change).

---

## 6. Metadata Model

**Flexible metadata.** Metadata is an open-ended, source-specific bag of extra facts a Collector believes are worth keeping about a document, that don't fit any of the universal fields in §3 — a Facebook post's like/share/comment counts, a website article's byline structure, a PDF report's page count, a CRM record's originating table/row reference.

Business meaning: Metadata lets each Collector preserve source-specific richness **without** forcing every other Collector, or the Canonical Document itself, to carry fields that only make sense for one source type. **Collectors may contribute source-specific metadata without changing the Canonical Document.** The AI Processing Layer and Knowledge Store are never required to understand any particular Collector's Metadata content to do their own job — Metadata is optional, additive, and owned by whichever Collector contributed it.

---

## 7. Identity Rules

Business rules for recognizing duplicate identity — no algorithm.

- Two documents from the **same Source**, carrying the **same source-provided identity** (the same post, the same article, the same file), collected at different times, are the same document re-collected — not two documents.
- Two documents from **different Sources or Source Types** that carry substantially the same Content (e.g. a Facebook post cross-posted verbatim to a website) are duplicates of each other **at the content level**, even though their Source and Collector identities differ entirely — they should be recognized and linked as duplicates, never silently treated as two unrelated facts (this is the business rule Platform Architecture §10's Duplicate Detection stage exists to enforce).
- Content-level identity is judged independently of Source identity — a document can be a duplicate of another by Content while having a completely different Source.
- **Hash** (§3) is the business concept that supports recognizing content-level duplicates — this document states that such a fingerprinting concept exists, not which algorithm produces it.
- A Canonical Document's **Document ID never changes**, even once it's recognized as a duplicate of another document. How duplicates get linked or merged is a Knowledge Store concern (Platform Architecture §11), not an identity change to the Canonical Document itself.

---

## 8. Traceability

Every Knowledge item must trace back through an unbroken chain:

```
Knowledge Item
   ↓
Canonical Document
   ↓
Raw Source (Raw Data Layer, Platform Architecture §9)
   ↓
Collector (Platform Architecture §8)
   ↓
Collection Time
```

No Knowledge item is acceptable output if any link in this chain is missing. This restates and grounds Platform Architecture §10's traceability constraint ("nothing enters the Knowledge Store as an unattributed AI output") in terms of the Canonical Document defined here, and matches Taxonomy & Ontology §7's `Knowledge — about — any Entity Type` relationship — every Knowledge item's "about" always resolves back through this exact chain.

---

## 9. Extensibility Rules

**Future collectors must require zero changes to the AI Pipeline, the Knowledge Store, or the CRM.**

Because every Collector's output is normalized into the one Canonical Document shape (§2, §3) before anything else touches it, adding a brand-new Collector for a brand-new source type only ever requires two things:

1. Building the new Collector itself (Platform Architecture §8).
2. Defining how it maps its source-specific raw content into a Canonical Document — routing source-specific detail into Metadata (§6) and Attachments (§5), never into a new top-level field.

Because the AI Pipeline, the Knowledge Store, and any future CRM Integration (Platform Architecture §12) only ever consume Canonical Documents, none of them need to change when a new Collector is added. This is the direct business payoff of Design Principle 1 (One Universal Shape) and the reason this Canonical Data Model exists at all.

---

## 10. Business Examples

How five very differently-shaped sources all become the *same* Canonical Document. Business examples only — no field names beyond the ones already defined in §3.

| Source Example | Its own real-world shape | Becomes, in the Canonical Document |
|---|---|---|
| **Facebook Post** | Post text, photos, a poster's name, a post time, a group link, like/share/comment counts | Content = post text · Author = poster's name · Published Time = post time · URL = post link · Attachments = photos · Metadata = like/share/comment counts, group name |
| **Website Article** | Headline, byline, article body, embedded images, a publish date, a page URL, a site section/category | Title = headline · Content = article body · Author = byline · Published Time = publish date · URL = page URL · Attachments = images · Metadata = site name, article section |
| **RSS Item** | Feed item title, description/summary, link, publish date, an optional media enclosure | Title = item title · Content = item description · Published Time = item's publish date · URL = item link · Attachments = enclosure media (if present) · Metadata = feed name |
| **PDF Report** | A cover title, body text across pages, a stated author/publisher, the PDF file itself, no natural online "publish time" | Title = report title · Content = extracted body text · Author = stated author/publisher · Attachments = the PDF file itself · Metadata = page count, report series |
| **CRM Record** | An existing CRM row (e.g. a product or purchase) read as a Source (Platform Architecture §7) | Title = a business-meaningful label from the record · Content = a business-meaningful rendering of the record's relevant fields · Published Time = the record's own creation time · Metadata = which CRM table/record this came from |

All five end up in exactly the same Canonical Document shape — same fields, same lifecycle (§4), same traceability chain (§8) — regardless of how differently each source represents information natively. This is what "AI must never know whether data originated from Facebook, Website, RSS, PDF, CRM, Excel, API, or a Future Source" means in practice.

---

## 11. Out of Scope

- Any SQL, database schema, JSON schema, or TypeScript type definition — this document stays at business meaning only, per explicit instruction.
- Any hashing or deduplication algorithm (§7) — business rules only, no algorithm chosen.
- Any specific storage technology for the Canonical Document, Attachments, or Metadata.
- Any actual Collector, AI Pipeline, or Knowledge Store implementation.
- Designing the Summarization output itself — Summary (§3) is named only as a future field, not designed here.
- Any CRM code, schema, or module change — the CRM stays untouched, consistent with every package of this platform.
- Modifying `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1) or `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6) — both referenced only, neither edited, per this task's explicit instruction.

---

## 12. Open Questions

1. **Document ID scope/stability.** Is a Document ID assigned once at Normalization and never reused, even once a document is Archived — or could IDs ever be recycled? Not decided.
2. **Language field granularity.** Exactly one Language per Canonical Document, or could a document legitimately contain more than one (e.g. a bilingual post)? Not decided.
3. **Duplicate-linkage ownership.** §7 says duplicates should be recognized and linked — but which layer owns recording that link: the AI Processing Layer's Duplicate Detection stage writing into the Knowledge Store, or the Canonical Document itself carrying a reference to what it duplicates? Not decided.
4. **Attachment identity.** Does an Attachment ever get its own traceable identity independent of its parent Canonical Document (so Knowledge could reference it directly), or is it always only reachable through its parent (§5, as currently written)? Not decided.
5. **Archived meaning.** Does Archived mean only "no longer actively re-processed," or does it also affect visibility/queryability from the Knowledge Store side? Not decided.
6. **CRM-as-Source Content mapping.** For a CRM Record (§10), what business text actually becomes Content — a fixed template per CRM entity type, or something more free-form? Not decided; likely needs its own revision once CRM-as-a-source is designed in more depth.
7. **Boundary with Taxonomy & Ontology.** Should Content/Metadata carry any Entity Type or Relationship tags (Taxonomy & Ontology, Package 1.6) at Normalization time, or is all Taxonomy-level tagging strictly an AI Processing Layer / Knowledge Store concern that happens *after* normalization? Not decided — affects exactly where "canonical" ends and "processed" begins.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
