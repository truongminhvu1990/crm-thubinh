# Jade Intelligence Platform — Raw Data Storage

**Package:** 4 — Raw Data Storage
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no storage technology, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2), `docs/SOURCE_REGISTRY.md` (Package 3) — all six treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the six is modified by this document. This document is a full business-design elaboration of the "Raw Data Layer" Platform Architecture §9 already named, not a renaming or replacement of it.

---

## 1. Vision

Raw Data Storage is the permanent, unmodifiable repository of everything any Collector has ever collected, kept in its original captured form, before any normalization or AI processing ever touches it. It exists so that everything built on top of it — Canonical Documents, Evidence, Knowledge — can always be traced back to something real and unaltered, and so that if normalization or AI logic ever improves, historical raw material can be reprocessed without needing to re-collect it.

---

## 2. Design Principles

1. **Collected once, changed never.** Once a Collector hands off raw content, it is stored exactly as captured. No Collector, no AI Processing Layer, no Knowledge Store, nothing downstream, is ever permitted to modify it.
2. **Raw Data must never be modified by AI.** The AI Processing Layer reads from Raw Data (indirectly, via Canonical Documents — §7) but never writes back into Raw Data Storage.
3. **Append-only by nature.** New Raw Data is only ever added, never edited or replaced in place (§5).
4. **Raw Data Storage precedes and outlives everything built from it.** A Canonical Document, its Evidence, and any Knowledge derived from it can all change, evolve, or be reprocessed — the underlying Raw Data they trace back to remains exactly as first collected.
5. **Provenance's trail begins here.** Every item carries Source, Source Type, Collector, and Collection Time (Canonical Data Model §3, §8; Evidence & Provenance Model §4) from the moment it lands in Raw Data Storage.
6. **Storage-technology-agnostic.** This document describes business behavior only — no specific storage technology is chosen, per explicit instruction.

---

## 3. Raw Data Definition

**Business meaning:** Raw Data is the literal, unprocessed content a Collector acquired directly from a Source (Source Registry §3) — before Normalization (Collector Framework §4) turns it into a Canonical Document, and long before any AI Processing Layer stage ever touches it. It is the platform's ground truth: the actual content as it existed at the moment of Collection, nothing added, nothing removed, nothing interpreted.

---

## 4. Raw Data Lifecycle

```
Collected
   ↓
Stored
   ↓
Referenced
   ↓
Archived
```

- **Collected** — a Collector instance (Collector Framework §4) has just acquired the raw content from its assigned Source (Source Registry).
- **Stored** — the raw content is committed into Raw Data Storage exactly as collected, gaining a permanent place in the repository and beginning its Provenance trail.
- **Referenced** — the stored Raw Data is pointed to by one or more Canonical Documents (§7) — and, transitively, by Evidence and Knowledge built from those Canonical Documents (§8) — without ever itself being copied, altered, or consumed by that reference.
- **Archived** — the Raw Data is no longer expected to be actively normalized or reprocessed going forward, but remains permanently retained and referenceable (§9). Archived describes reduced active relevance, never deletion.

---

## 5. Storage Principles

- **Append-only.** Raw Data Storage only ever grows — new items are added; existing items are never edited, overwritten, or removed in the normal course of operation.
- **Immutability.** Once an item is Stored, its content is permanently fixed — no Collector, no AI Processing Layer, no person, is permitted to change what was actually collected (Design Principle 2).
- **Original Content Preservation.** Raw Data is kept in the same form and fidelity it was collected in. Normalization (Canonical Data Model §2) and any AI interpretation happen on derived representations, never by altering the original stored item.
- **Traceability.** Every item retains enough Provenance information (Source, Source Type, Collector, Collection Time) to support the full chain defined in Evidence & Provenance Model §9, from the moment it is Stored.

---

## 6. Raw Data Types

Business meaning only.

| Raw Data Type | Business Meaning |
|---|---|
| **HTML** | Raw web page content as captured (e.g. from a Website Source). |
| **JSON** | Raw structured data as returned by a source (e.g. an API Source). |
| **XML** | Raw structured/markup data as captured (e.g. certain feed or export formats). |
| **RSS** | The raw feed content as captured from an RSS Feed Source, prior to any per-item extraction. |
| **PDF** | The raw PDF file itself, as captured from a PDF Library Source. |
| **Image** | Raw image content, whether collected standalone or as part of another item's Attachments (Canonical Data Model §5). |
| **Audio** | Raw audio content, same standalone-or-attached framing as Image. |
| **Video** | Raw video content, same framing. |
| **Spreadsheet** | Raw spreadsheet file content, as captured from an Excel Source. |
| **CRM Export** | The raw rendering of a CRM record as read by a CRM Collector (Collector Framework §5) — the Raw Data form of what later becomes a Canonical Document's Content (Canonical Data Model §10's CRM Record example). |
| **Future Types** | Not closed — new Raw Data Types are addable without changing Raw Data Storage's own Storage Principles (§5) or its relationship to Canonical Documents (§7). |

---

## 7. Relationship with Canonical Document

Normalization (Collector Framework §4) reads a Raw Data item and produces a Canonical Document from it — this is a **one-way, additive transformation, never a modification of the Raw Data itself.** The Raw Data item continues to exist, unchanged, in Raw Data Storage, and the resulting Canonical Document keeps a durable reference back to exactly which Raw Data item it was normalized from. This is what "preserving traceability" means in practice: the Canonical Document doesn't just resemble its Raw Data, it can always be traced back to it, satisfying Canonical Data Model §8's chain.

This document assumes one Raw Data item normalizes into exactly one Canonical Document, never the reverse — flagged as an assumption worth confirming, not a settled rule (§12 Open Question #1).

---

## 8. Relationship with Evidence

Per Evidence & Provenance Model §5's Evidence Chain (`Raw Source → Canonical Document → Evidence → Knowledge`), **Evidence never points directly at a Raw Data item — it points at a Canonical Document.** Even the "Raw Document" Evidence Type (Evidence & Provenance Model §6, used when the literal original wording matters more than its normalized form) is itself still a reference back to the item stored here, not a bypass of Canonical Documents in principle — it simply means the Evidence cites the original wording rather than the normalized rendering.

Either way, the Raw Data content described in this document is what ultimately grounds Evidence's Provenance (Evidence & Provenance Model §4). Evidence's trustworthiness always terminates in something stored, immutable, and traceable here.

---

## 9. Retention Principles

Business rules only — no retention policy implementation.

- **Nothing is deleted by default.** Consistent with Append-only/Immutability (§5), the default behavior is indefinite retention.
- **Archival reflects relevance, not disposal.** Moving an item to Archived (§4) signals it's no longer expected to be actively reprocessed — it does not mean the item is removed or becomes untraceable.
- **Retention duration and limits are not decided here.** Whether any Raw Data is ever actually deleted (for legal, storage-cost, or privacy reasons) is explicitly not decided by this document (§12 Open Question #3) — the default assumption is indefinite retention unless a future governance decision states otherwise.
- **Retention must never break Traceability.** Any future retention or deletion policy, if one is ever adopted, must account for what happens to Canonical Documents, Evidence, and Knowledge that reference a Raw Data item being removed. Not designed here — only flagged as a constraint any future policy must respect.

---

## 10. Business Examples

Each example shows the full chain: **Raw Data → Canonical Document → Evidence → Knowledge.**

**Website Article.** *Raw Data:* the captured HTML page content, Stored with Provenance (Source = the specific Website, Collector = the Website Collector, Collection Time recorded). *Canonical Document:* Normalization extracts Title/Content/Author/Published Time/URL/Attachments (Canonical Data Model §10), keeping a reference back to the stored HTML. *Evidence:* the Canonical Document is drawn on as Evidence for a conclusion — e.g. rising discussion of a Material. *Knowledge:* a Trend Knowledge item cites that Evidence, traceable through the Canonical Document all the way back to the original stored HTML.

**Facebook Post.** *Raw Data:* the captured post content (text and any photos), Stored with Provenance (Source = the specific Facebook Group, Collector = the Facebook Collector). *Canonical Document:* Normalization produces Content/Author/Published Time/Attachments (the photos). *Evidence:* the Canonical Document, or a Market Observation drawn from it, becomes Evidence for a signal about color preference. *Knowledge:* a Knowledge item citing that Evidence, traceable back to the originally stored post content.

**PDF Report.** *Raw Data:* the raw PDF file itself, Stored with Provenance (Source = the specific PDF Library, Collector = the PDF Collector). *Canonical Document:* Normalization extracts Title/Content/Author, with the PDF file itself carried as an Attachment. *Evidence:* a fact drawn from the report's content becomes Evidence for a Risk or Trend Knowledge item. *Knowledge:* cites that Evidence, traceable back to the original stored PDF.

**CRM Record.** *Raw Data:* the raw CRM Export rendering of the record, as read by the CRM Collector, Stored with Provenance (Source = the CRM itself, Collector = the CRM Collector). *Canonical Document:* Normalization produces Title/Content per Canonical Data Model §10's CRM Record example. *Evidence:* the Canonical Document becomes Evidence for a Knowledge item cross-referencing internal sales patterns against external market chatter. *Knowledge:* cites that Evidence, traceable all the way back to the original CRM Export **snapshot** stored here — not the live CRM row itself, which may have since changed. This is a deliberate consequence of Immutability (§5): the platform's traceability holds even if the source CRM record is later edited or deleted, because what's stored is a point-in-time capture, not a live link.

---

## 11. Out of Scope

- Any SQL, database schema, or storage technology — business meaning only, per explicit instruction.
- Any actual retention or deletion policy or schedule (§9) — principles only, no specific durations or triggers decided.
- Any AI Processing Layer logic — Raw Data Storage only holds and preserves; what the AI Processing Layer does with what it reads (via Canonical Documents) is Platform Architecture §10's territory.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, `docs/COLLECTOR_FRAMEWORK.md`, or `docs/SOURCE_REGISTRY.md` — all six referenced only, none modified.
- Any CRM code, schema, or module change.
- Settling exactly how many Canonical Documents may derive from one Raw Data item, beyond the one-to-one assumption stated in §7 (§12 Open Question #1).

---

## 12. Open Questions

1. **One-to-one vs. one-to-many normalization.** §7 assumes one Raw Data item normalizes into exactly one Canonical Document — is that always true, or could a single Raw Data item (e.g. one PDF Report containing several distinct articles) ever normalize into more than one Canonical Document? Not decided.
2. **Re-normalization.** If normalization logic changes later (Collector Framework Open Question #7), does re-running it against the same stored Raw Data produce a new Canonical Document, or update the existing one in place? Not decided — affects whether a Canonical Document is ever itself mutable, which Canonical Data Model didn't fully settle either.
3. **Retention duration/deletion.** §9 states indefinite retention by default but leaves the door open to a future policy — who decides if/when one is needed, and under what circumstances (legal, cost, privacy)? Not decided.
4. **Raw Data Type detection.** Who or what determines a Raw Data item's Type (§6) at Storage time — the Collector itself, or a separate step? Not decided.
5. **Large/binary Raw Data handling.** Does a large Video or Audio item receive different Storage treatment than a small HTML page, from a business perspective (e.g. different retention expectations), or are all Raw Data Types treated uniformly? Not decided.
6. **CRM Export snapshot staleness.** Should Raw Data Storage ever re-collect an updated snapshot of the same CRM record over time (producing multiple Raw Data items for one record), and if so how does that relate to Source Registry's Collection Method? Not decided.
7. **Referenced-vs-Archived overlap.** §4 lists Referenced and Archived as sequential stages, but an item could still be actively referenced by existing Canonical Documents/Evidence/Knowledge even after new normalization activity against it has stopped — does Archived ever apply to an item still under active reference, or does it strictly require no more incoming references either? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
