# Jade Intelligence Platform — Source Registry

**Package:** 3 — Source Registry
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no API, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7), `docs/COLLECTOR_FRAMEWORK.md` (Package 2) — all five treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — same convention established for every prior package). None of the five is modified by this document.

---

## 1. Vision

Every information source the platform ever touches — a specific Facebook Group, a specific website, a specific RSS feed — is registered as its own independent, identifiable, governed record, entirely separate from whichever Collector (if any) happens to be assigned to collect from it. A Source can be proposed, approved, and trusted (or not) *before* any Collector ever touches it. This separation lets the platform reason about "what sources do we know about and trust" independently from "what collection mechanisms are currently running" — the latter is `docs/COLLECTOR_FRAMEWORK.md` §6's Collector Registry; this document is the former.

---

## 2. Design Principles

1. **Sources and Collectors are independent concepts.** A Source is a real-world thing being observed (a specific Facebook Group, a specific website). A Collector is the acquisition mechanism that collects from it (Collector Framework §3–4). A Source can be registered and approved before any Collector exists for it; a Collector instance is always associated with exactly one registered Source.
2. **One Source, one authoritative definition.** Regardless of how many times it's referenced — in a Collector's configuration, in a Canonical Document's Source field, in Evidence's Provenance — a Source has exactly one registered definition the whole platform treats as authoritative.
3. **Governed lifecycle, not ad hoc creation.** A Source doesn't become collectible just because a Collector happens to point at it — it must pass through registration and approval first (§4, §9).
4. **Trust is a property of the Source, not the Collector.** How much the platform trusts information from a given Source (§7) is a fact about the Source itself, independent of which specific Collector mechanism happens to acquire from it.
5. **Business-owned, not technically-owned.** A Source has a business Owner (§8) — a person or role accountable for it — distinct from whichever engineer maintains the Collector code that reads from it.
6. **Extensible, like everything else in this platform.** New Source Types are addable without requiring changes to the Collector Framework, AI Pipeline, Knowledge Store, or CRM.

---

## 3. Source Definition

**Business meaning:** A Source is the registered, authoritative definition of one specific real-world place, publication, feed, or system the platform may collect information from — not "Facebook" in general, but *this specific* Facebook Group; not "an RSS feed" in general, but *this specific* feed. A Source exists as a record in the Source Registry whether or not a Collector is currently configured to collect from it. The Source is what the platform knows and governs; the Collector is merely the mechanism that acts on that knowledge.

---

## 4. Source Lifecycle

```
Proposed
   ↓
Approved
   ↓
Active
   ↓
Paused
   ↓
Archived
```

- **Proposed** — someone has identified a candidate Source worth adding, and it has been registered as a proposal — not yet vetted or approved for collection.
- **Approved** — the proposed Source has been reviewed and accepted as legitimate to collect from (§9) — it may not yet have an assigned Collector or be actively collected.
- **Active** — the Source is approved **and** currently has a Collector instance actively collecting from it.
- **Paused** — the Source remains approved and registered, but collection from it has been deliberately suspended. Distinct from Collector Framework §8's "Unavailable source," which is a Collector-level, often-transient technical condition — Paused is a deliberate Source-level status decision.
- **Archived** — the Source is no longer actively used and is not expected to resume. Retained for record-keeping — historical Canonical Documents and Evidence that came from this Source must still resolve their Provenance (Evidence & Provenance Model §4) even after it's Archived — but it is no longer a collection target.

---

## 5. Source Types

Business meaning only. Deliberately more granular in places than Collector Framework §5's Collector Types — see the note below the table.

| Source Type | Business Meaning |
|---|---|
| **Facebook Group** | A specific, named Facebook Group where market-relevant discussion happens. |
| **Facebook Page** | A specific, named Facebook Page — distinct from a Group, typically a business or organization's own public page. |
| **Website** | A specific, named industry website. |
| **RSS Feed** | A specific, named RSS/Atom feed. |
| **PDF Library** | A defined collection or location of PDF reports (a folder, a repository, a publisher's archive) — represents a body of PDF material, not one single file. |
| **CRM** | The CRM system itself, registered once as a Source (Platform Architecture §7's CRM-as-input relationship). |
| **Excel** | A specific, named spreadsheet file or location. |
| **API** | A specific, named external API endpoint. |
| **Manual Upload** | The general facility through which a staff member directly submits material — registered as a Source Type in its own right. |
| **Future Sources** | Not closed — extensible per Design Principle 6. |

**Note on granularity:** Source Types here are more specific than Collector Framework §5's Collector Types (e.g. one "Facebook" Collector Type can point at either a Facebook Group or a Facebook Page Source; one "PDF" Collector Type can acquire from a PDF Library Source). This is intentional, not a mismatch — a Source describes *what* is being observed at business-meaningful granularity, while a Collector Type describes *how* acquisition happens at a coarser, mechanism level. The exact mapping rules between the two are not fully decided (§12 Open Question #2).

---

## 6. Source Attributes

Business meaning only — no technical schema.

| Attribute | Business Meaning |
|---|---|
| **Name** | The human-readable label staff use to refer to this Source. |
| **Type** | Which Source Type (§5) this Source is. |
| **Owner** | The accountable person or role for this Source (§8). |
| **Language** | The primary language content from this Source is expected to be in — a starting expectation only; the AI Processing Layer's own Language Detection (Platform Architecture §10) still runs per-document regardless. |
| **Region** | The geographic market/region this Source is associated with, where relevant (e.g. a Facebook Group focused on a specific country's jade trade). |
| **Status** | Where the Source currently sits in its Lifecycle (§4). |
| **Trust Level** | How much the platform trusts information from this Source (§7). |
| **Collection Method** | Which Scheduling approach (Collector Framework §7) and Collector Type (Collector Framework §5) is expected or assigned for this Source — a cross-reference from the Source's own record to how it's actually collected. |

---

## 7. Trust Model

**Business meaning, no scoring algorithm.** Trust Level is a business judgment about how much weight information originating from a given Source deserves — a well-established industry publication might reasonably warrant a different baseline trust than an anonymous public Facebook Group post. Trust Level exists as an attribute of a Source (§6) and is meant to *inform* — not automatically dictate — how Evidence and Knowledge derived from that Source's Canonical Documents are eventually judged (Evidence & Provenance Model §7's Confidence is a related but separate concept; a Source's Trust Level is one reasonable input a Confidence judgment might draw on). No formula, scale, or calculation method is defined here.

---

## 8. Source Ownership

Business concepts only. Every registered Source has an accountable **Owner** — a person or role responsible for:
- The Source's registration being accurate.
- Deciding when it should be Paused or Archived (§4, §9).
- Answering "why do we collect from this."

Ownership is a governance concept, not a technical/engineering responsibility — the Owner is accountable for the Source's business legitimacy and continued relevance, not for maintaining the Collector code that reads from it (Design Principle 1's Collector/Source independence).

---

## 9. Source Governance

Business rules for Approval, Change, and Retirement:

- **Approval** — a Proposed Source (§4) requires explicit review and approval before it can become Active. This document does not name who approves (§12 Open Question #1), only that approval is a required, non-skippable gate.
- **Change** — modifying a Source's registered Attributes (§6) — its Trust Level, its Owner, its Region — is a governed action, not a routine edit, since it can affect how Evidence and Knowledge already derived from that Source are judged going forward.
- **Retirement** — moving a Source to Archived (§4) is a deliberate governance decision, not an automatic consequence of a Collector being removed or paused. A Source can outlive any particular Collector instance that once served it, and its retirement is judged on its own terms.

---

## 10. Business Examples

How different Source Types are registered *before* any Collector uses them.

**Facebook Group.** A staff member proposes a specific Facebook Group as a candidate Source (Proposed). It's reviewed and Approved, given a Trust Level, an Owner, and a Region. Only after that does a Facebook Collector instance (Collector Framework §5–6) get configured to actually collect from it — at which point the Source becomes Active. If that Collector instance is later removed or replaced, the Source itself remains registered (its Status may move to Paused if nothing currently collects from it, but it is not deleted) — the Source's identity and history persist independently of any one Collector.

**PDF Library.** An industry association's report archive is proposed as a PDF Library Source. Once Approved, a PDF Collector is pointed at it to begin acquiring individual reports over time — each report becomes its own Canonical Document (Collector Framework §10), but all of them trace back to the one registered PDF Library Source.

**CRM.** The CRM itself is registered once as a Source (Approved, Active, Owner = the platform's own operating team). A CRM Collector instance then reads from it (Collector Framework §5). Registering the CRM as a Source happens once, independent of whichever specific CRM tables or records the Collector actually reads over time.

In every case: registration and approval happen first, at the Source level — only afterward does any Collector instance get associated with that Source to begin actual collection.

---

## 11. Out of Scope

- Any SQL, database schema, or API design — business meaning only.
- Any Trust Level scoring algorithm or formula (§7).
- Any specific approval workflow or tooling (§9) — that approval is required is stated; how it's executed is not.
- The Collector Framework's own Registry (Collector Framework §6) — this document defines Source *definitions*, not Collector *instance* tracking; the two are related but distinct (§2, Design Principle 1).
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, `docs/EVIDENCE_AND_PROVENANCE_MODEL.md`, or `docs/COLLECTOR_FRAMEWORK.md` — all five referenced only, none modified.
- Any CRM code, schema, or module change.
- Designing how a Source's Trust Level actually factors into Evidence & Provenance Model's Confidence (§7 there) — named as a relationship, not designed.

---

## 12. Open Questions

1. **Approval authority.** Who is authorized to approve a Proposed Source (§9)? Not decided.
2. **Source-to-Collector-Type mapping.** §5's Source Types are more granular than Collector Framework §5's Collector Types (e.g. Facebook Group / Facebook Page vs. one "Facebook" Collector Type) — is the mapping strictly many-Source-Types-to-one-Collector-Type, or could it vary? Not fully decided.
3. **Multiple Collectors per Source.** Can more than one Collector instance ever be assigned to the same Source at once (redundancy, or two acquisition methods for one Source), or is it strictly one-to-one? Not decided.
4. **Trust Level change effects.** When a Source's Trust Level changes (§9), does that retroactively affect the Confidence of Evidence/Knowledge already derived from it, or only apply going forward? Not decided — mirrors Collector Framework Open Question #7's versioning question.
5. **Paused-vs-Archived duration.** §4 separates a deliberate Paused status from Archived, but doesn't state how long a Source may remain Paused before a Retirement decision (§9) is expected. Not decided.
6. **Language/Region as commitment vs. hint.** §6 frames Language and Region as "starting expectations" — is a mismatch (content in an unexpected language) ever treated as a Source-level data-quality signal, or purely informational? Not decided.
7. **Relationship to "External Reference."** Evidence & Provenance Model §6 named "External Reference" as a lightweight Evidence Type not backed by a full Collector-sourced item — does an External Reference ever need to trace back to a registered Source, or can it exist independent of the Source Registry entirely? Not decided.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
