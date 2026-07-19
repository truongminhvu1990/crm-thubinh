# Jade Intelligence Platform — Collector Framework

**Package:** 2 — Collector Framework
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no database schema, no API design, no implementation, no code were written for this document.

**Based on:** `docs/JADE_INTELLIGENCE_PLATFORM.md` (Package 1), `docs/CANONICAL_DATA_MODEL.md` (Package 1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (Package 1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (Package 1.7) — all four treated as **LOCKED** per this task's instruction (their own file headers stay "Draft," unedited — the same convention established for every prior package in this platform; the lock is tracked by the Product Owner Decision, not a header edit). None of the four is modified by this document.

---

## 1. Vision

A pluggable Collector Framework capable of ingesting information from many source types — today's and tomorrow's — while every single one of them produces the exact same Canonical Document (Canonical Data Model §3). Collectors exist to do exactly two things: **acquire** and **normalize**. They are deliberately "dumb" on purpose — every act of interpretation, understanding, or analysis belongs to the AI Processing Layer (Platform Architecture §10) and only the AI Processing Layer. A Collector that tried to be clever about what it collects would be the single fastest way to break the platform's "AI reads only Canonical Documents" guarantee.

---

## 2. Design Principles

1. **Acquisition and normalization only.** A Collector's job ends the moment it has produced a valid Canonical Document. It never analyzes, interprets, summarizes, classifies, or extracts meaning from what it collects.
2. **No AI inside a Collector.** Language Detection, Translation, Summarization, Topic/Entity Extraction, Trend Detection, Market Signals (Platform Architecture §10) never run inside a Collector. A Collector's output is a plain Canonical Document — never a partially-analyzed one.
3. **One common contract, many implementations.** Every Collector, regardless of source type, is a plug-in behind the same business-level contract (Platform Architecture §8's "pluggable Collectors" principle, made concrete here).
4. **Collectors are the platform's only boundary to the outside world** (restated from Platform Architecture §8) — no other layer ever reaches outward.
5. **Independent, isolated failure.** One Collector's failure, backlog, misconfiguration, or removal never affects any other Collector or any core layer (§8).
6. **Configuration over hardcoding.** Each Collector instance is parameterized (which group, which feed URL, which folder) rather than hardcoding a specific source.
7. **Zero-impact extensibility.** Adding a new Collector never requires changing the AI Pipeline, the Knowledge Store, or the CRM (§9 — restated from Canonical Data Model §9 as this Framework's own responsibility to guarantee).

---

## 3. Collector Responsibilities

**In scope — a Collector always does exactly these:**
- Discover what's available to collect from its configured source (§4).
- Acquire the raw content.
- Normalize that raw content into a Canonical Document (Canonical Data Model §3), populating Source, Source Type, Collector, Title, Content, Author, Published Time, Collected Time, URL, Attachments, and Metadata as best it can from what its source actually provides.
- Hand off the finished Canonical Document to the AI Pipeline boundary (§4).

**Out of scope — a Collector never does these:**
- **No AI analysis of any kind** — no interpretive cleaning, no language detection, no summarization, no entity/topic extraction, no trend detection, no market signal generation. All of this is AI Processing Layer territory only (Platform Architecture §10).
- **No judgment calls** about a document's importance, truthfulness, or relevance — that's an AI Processing Layer / Knowledge Store concern, never a Collector's.
- **No writing into the Knowledge Store.** A Collector's only output is a Canonical Document, handed off — it never writes Knowledge directly (only the AI Processing Layer writes into the Knowledge Store, Platform Architecture §11).
- **No cross-Collector coordination or shared state** (Design Principle 5).

---

## 4. Collector Lifecycle

```
Discovery
   ↓
Collection
   ↓
Normalization
   ↓
Canonical Document
   ↓
Hand-off to AI Pipeline
```

- **Discovery** — the Collector determines what is available to collect right now from its configured source (which posts are new since last run, which RSS items haven't been seen, which files are waiting in a Manual Import folder).
- **Collection** — the Collector acquires the raw content for what Discovery identified: the raw, source-native material, unmodified.
- **Normalization** — the Collector transforms that raw material into the one universal Canonical Document shape (Canonical Data Model §2, §3), mapping source-specific facts onto the Canonical Document's fields and routing anything that doesn't fit into Metadata (Canonical Data Model §6).
- **Canonical Document** — the result: a complete, valid Canonical Document, indistinguishable in shape from one produced by any other Collector.
- **Hand-off to AI Pipeline** — the Collector's job ends here. The Canonical Document passes to the Raw Data Layer / AI Processing Layer boundary (Platform Architecture §6), and the Collector has no further involvement with what happens to it.

---

## 5. Supported Collector Types

Business meaning only — parallel to Platform Architecture §7's Source Types, now framed as the Collector itself.

| Collector Type | Business Meaning |
|---|---|
| **Website** | Acquires articles, listings, or pages from a configured industry website. |
| **RSS** | Acquires items from a configured RSS/Atom feed. |
| **Facebook** | Acquires publicly visible posts/discussion from a configured Facebook group. |
| **PDF** | Acquires and extracts content from a configured PDF report or document. |
| **CRM** | Acquires already-existing CRM data, read-only, as one input source — the platform reading *from* the CRM, never the reverse (Platform Architecture §7's dual-relationship note carried forward). |
| **Excel** | Acquires structured data from a configured spreadsheet file. |
| **API** | Acquires data from a configured external API endpoint. |
| **Manual Import** | Accepts a staff member's direct submission — a document, a note, a link — that no automated Collector reaches. |
| **Future Collectors** | This list is not closed — the Extensibility Rules (§9) guarantee a new Collector Type can be added without touching any other layer. |

---

## 6. Collector Registry

Business-level description only — not a technical design.

- Every **Collector instance** — not just its Type, but its specific configuration (e.g. "the Facebook Collector configured for Group X" is a distinct instance from "the Facebook Collector configured for Group Y") — has a stable identity the platform refers to consistently. This is the identity that appears in a Canonical Document's own Collector field (Canonical Data Model §3) and in the Traceability chain (Evidence & Provenance Model §9).
- The Registry is the platform's inventory of every Collector instance that currently exists: what source it's configured against, and its current operating status (active, paused, broken) — a bookkeeping concept, not a database design.
- Adding, pausing, or removing a Collector instance is a Registry-level change only — it never requires touching the AI Pipeline, Knowledge Store, or CRM (§9).
- The Registry tracks *which* Collectors exist and their current state — it does not decide *when* a Collector runs (that's Scheduling, §7).

---

## 7. Scheduling

Business concepts only — no implementation, no engine, no cadence values chosen.

- **Manual** — a person (or a Manual Import submission itself) triggers collection directly, on demand.
- **Scheduled** — a Collector runs on a recurring cadence set for it (e.g. "check this feed every hour") — the specific cadence is a per-Collector configuration choice, not fixed by this Framework.
- **Event-driven** — a Collector runs in response to something happening elsewhere (a new file appearing, an external notification) rather than on a timer.
- **Continuous (future)** — a Collector that is effectively always running or listening rather than triggered — named as a future capability, not required now.

Each Collector instance (§6) is associated with exactly one Scheduling approach at a time.

---

## 8. Failure Handling

Business handling only — no algorithms, no retry counts, no backoff policy.

- **Collection failure** — when a Collector cannot successfully acquire content it attempted to (source unreachable, access denied, malformed content), the failure is recorded against that Collector instance. It never silently looks like "there was nothing new."
- **Retry** — a failed collection attempt may legitimately be tried again. This document states that retrying is expected behavior, not which retry count or backoff policy applies (an implementation decision, out of scope).
- **Partial collection** — a Collector may succeed on some items from a run and fail on others (8 of 10 RSS items normalize fine, 2 don't). The successful items still proceed to Normalization and hand-off — a partial failure never blocks the items that did succeed.
- **Unavailable source** — when a Collector's source is completely unreachable (a group has gone private, a website is down, an API key has expired), the Collector simply produces nothing that cycle. This is a non-fatal, expected condition — never a platform-wide failure, and it never blocks any other Collector (Design Principle 5).

---

## 9. Extensibility Rules

**A new Collector must require zero changes to the AI Pipeline, the Knowledge Store, or the CRM.**

Because every Collector's only output is a Canonical Document (§3, §4), and every Collector Type shares the same business-level contract (§2), adding a new Collector Type or a new Collector instance never requires modifying the AI Pipeline's logic, the Knowledge Store's structure, or any CRM code. Adding a new Collector only ever requires two things: (1) building the Collector itself, and (2) registering it (§6) with a Scheduling approach (§7) — nothing else in the platform needs to know it was added. This restates, and makes this Framework's own guarantee, what Canonical Data Model §9 already established at the data-model level.

---

## 10. Business Examples

Three Collector Types, walked through the full Lifecycle (§4), all landing on the same Canonical Document shape — none of them performing any AI analysis at any stage.

**RSS Collector.** *Discovery:* checks the configured feed and finds 3 items not seen before. *Collection:* fetches full content for those 3 items. *Normalization:* maps each item's title/description/link/publish date into Title/Content/URL/Published Time, records the feed name in Metadata. *Canonical Document:* 3 new Canonical Documents, same shape as any other Collector produces. *Hand-off:* all 3 pass to the AI Pipeline boundary — the RSS Collector's involvement ends there.

**Manual Import Collector.** *Discovery:* a staff member submits a document directly — the submission itself is the discovery event, nothing to poll for. *Collection:* the submitted file/note/link is captured as-is. *Normalization:* staff-provided fields (e.g. a title they typed) map directly; anything not provided is left blank rather than guessed; the submitting staff member is recorded in Metadata. *Canonical Document:* one new Canonical Document, same shape as the RSS-sourced ones above. *Hand-off:* identical.

**CRM Collector.** *Discovery:* identifies CRM records that are new or changed since the last collection run. *Collection:* reads the relevant CRM data, read-only (Platform Architecture §7). *Normalization:* renders the record's relevant fields into Title/Content (per Canonical Data Model §10's CRM Record example), records which CRM table/record in Metadata. *Canonical Document:* produced with exactly the same shape as the RSS and Manual Import examples above. *Hand-off:* identical.

In every case, cleaning, language detection, summarization, and every other AI Processing Layer stage happen later, only after hand-off — never here (Design Principle 2).

---

## 11. Out of Scope

- Any SQL, database schema, API design, or code — business meaning only, per explicit instruction.
- Any AI analysis performed by a Collector, at any stage — explicitly forbidden by this task and by Design Principle 2.
- Any specific retry count, backoff policy, or failure-detection algorithm (§8).
- Any specific scheduling engine or cadence values (§7).
- The actual Collector Registry implementation (§6) — described as a business concept only.
- Any change to `docs/JADE_INTELLIGENCE_PLATFORM.md`, `docs/CANONICAL_DATA_MODEL.md`, `docs/TAXONOMY_AND_ONTOLOGY.md`, or `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` — all four referenced only, none modified.
- Any CRM code, schema, or module change — the CRM Collector (§5) only ever reads, per Platform Architecture §7.
- Designing the AI Pipeline's own behavior after hand-off — that boundary is where this document's responsibility ends.

---

## 12. Open Questions

1. **Collector instance vs. Collector Type identity.** Is "the Facebook Collector for Group X" a separately registered identity from "the Facebook Collector for Group Y," or the same Collector Type under different configuration but one identity? §6 assumes the former but doesn't formally decide it.
2. **Discovery state ownership.** How does a Collector know what's "new since last run" (§4) — tracked centrally by the Registry (§6), or independently by each Collector? Not decided.
3. **Scheduling ownership.** Who sets a Collector's cadence (§7) — a platform administrator, a per-source default, or the Collector itself? Not decided.
4. **Failure visibility.** §8 states failures are "recorded," but not who is notified, how urgently, or whether a persistently-failing Collector is ever automatically paused. Not decided.
5. **Partial-collection record-keeping.** In a partial collection (§8), do the failed items get any placeholder so a future retry doesn't silently re-attempt the same failure forever, or are they simply absent until the next Discovery cycle? Not decided.
6. **Manual Import authorization.** Who is allowed to submit via Manual Import (§5, §10), and is any approval step involved before a manually submitted item is normalized? Not decided.
7. **Collector versioning.** If a Collector's normalization logic changes later (e.g. it starts mapping a field differently), do Canonical Documents it already produced get reconciled, or does the change only apply going forward? Not decided — relevant to Evidence & Provenance Model's traceability guarantees over time.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
