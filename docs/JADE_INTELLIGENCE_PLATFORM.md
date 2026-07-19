# Jade Intelligence Platform — Business Architecture

**Package:** 1 — Platform Architecture
**Status:** Draft — Revision 1, awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no React, no migrations, no implementation, no code were written for this document.

**Relationship to the CRM:** This is a **completely independent platform project** — not a CRM module, not built inside `crm-thubinh`'s existing module set, and not a change to any existing CRM code. The CRM's own `Market Intelligence` module (`docs/MARKET_INTELLIGENCE_SPEC.md` / `docs/MARKET_INTELLIGENCE_UI.md`, both LOCKED, live at `/market-intelligence`) is explicitly untouched by this document and remains exactly as it is. No CRM module, schema, or UI is modified, referenced as a dependency, or redesigned anywhere below.

---

## 1. Vision

A single, independent system that continuously collects, understands, and organizes jade/jewelry market information from many outside sources — public groups, industry sites, RSS feeds, reports, manual notes, and eventually the CRM's own data — turning scattered raw information into structured, trustworthy market knowledge that the business can draw on. The CRM never depends on this platform to function; the platform exists to eventually make the CRM (and other future tools) smarter, never to make it fragile.

---

## 2. Business Goals

- Build one central place where market information from many different sources accumulates over time, instead of staying scattered across staff memory, bookmarks, screenshots, and group chats.
- Turn raw, messy, multi-language source material into clean, structured, searchable knowledge.
- Surface market signals (emerging trends, pricing chatter, supply/demand talk) staff can act on — sourced from *outside* the business, complementing rather than duplicating the CRM's own internal Market Intelligence module (which only ever reads the CRM's own sales data).
- Make it possible to add new source types over time without re-architecting the system.
- Never put the CRM's stability, schedule, or scope at risk — the CRM must run, ship, and operate normally whether this platform is present, degraded, or entirely absent.
- Lay a foundation that future specialized intelligence modules (§15) can build on without each one re-inventing collection, cleaning, and storage from scratch.

---

## 3. Architecture Principles

1. **Independence.** A separate platform — its own codebase, its own deployment — not a module inside the CRM repository. Nothing in this platform is built, deployed, or released as part of the CRM.
2. **Pluggable Collectors.** Every source type is implemented as an interchangeable Collector behind one common interface (§8). Adding a new source type means adding a new Collector — it never requires changing the platform's core layers.
3. **The CRM never depends on a specific Collector.** The platform's core (Raw Data Layer, AI Processing Layer, Knowledge Store) never hardcodes assumptions about any one Collector, and — if the CRM ever integrates (§12) — it only ever talks to the Knowledge Store's own read surface, never to a Collector directly, and never in a way that fails if one Collector is broken or removed.
4. **Loose, one-directional coupling to the CRM.** Integration is Platform → CRM (read-only) only. The CRM is never a hard dependency the platform needs to function, and the platform is never a hard dependency the CRM needs to function.
5. **Layered pipeline.** Sources → Collector Framework → Raw Data Layer → AI Processing Layer → Knowledge Store → (optional) CRM Integration / Future Modules. Each layer only talks to its immediate neighbor.
6. **Source-agnostic core.** The AI Processing Layer and Knowledge Store treat every raw item the same way once collected, regardless of which Collector produced it.
7. **Human-in-the-loop by default.** AI-derived output (summaries, extracted entities, trends, market signals) is assistive and reviewable, not automatically-authoritative fact injected anywhere without a traceable path back to its source.
8. **Business Design First.** Same principle the CRM itself follows: no implementation before business approval, no schema before database design approval, no UI before UI design approval.

---

## 4. High-Level Platform Architecture

At the business level, the platform is a straight pipeline with one optional branch back toward the CRM:

```
Sources (§7)
  → Collector Framework (§8) — one pluggable Collector per source type
  → Raw Data Layer (§9) — everything collected, stored as-is, untouched
  → AI Processing Layer (§10) — cleaning through market-signal generation
  → Knowledge Store (§11) — the platform's single source of processed market knowledge
      → CRM Integration (§12) — optional, read-only, one-directional
      → Future Modules (§15) — Supplier/Mine/Pricing/Customer/Auction Intelligence,
        Knowledge Vault, API, Mobile App — all read from the Knowledge Store, never
        from Collectors or the AI Processing Layer directly
```

No layer is allowed to skip a neighbor (e.g. a Future Module never reads the Raw Data Layer directly; the CRM never reads a Collector directly).

---

## 5. Core Components

| Component | Role |
|---|---|
| **Collector Framework** (§8) | Pluggable adapters, one per source type, each producing raw items with common metadata. |
| **Raw Data Layer** (§9) | Append-only record of everything ever collected, in its original form. |
| **AI Processing Layer** (§10) | Turns raw items into cleaned, structured, summarized, signal-bearing knowledge. |
| **Knowledge Store** (§11) | The queryable destination for everything the AI Processing Layer produces. |
| **CRM Integration surface** (§12) | The one place the CRM is ever allowed to read from — optional, read-only. |
| **Orchestration** | Triggers Collectors on their own schedules and moves new raw items through the AI Processing Layer's stages in order. Framed here only as a required capability — no specific scheduler/technology is chosen. |
| **Monitoring** | Visibility into whether a given Collector or pipeline stage has silently stopped producing data — a business necessity (a broken Collector that fails silently is worse than one that visibly fails), not a specific tool choice here. |

---

## 6. Data Flow

1. A Collector (§8) fetches from its source and emits one or more **raw items**, each carrying: source type, source identifier, source reference (URL/file/etc. where applicable), collection timestamp, and the untouched raw content.
2. Every raw item lands in the **Raw Data Layer** (§9) exactly as collected — nothing is interpreted, cleaned, or discarded at this step.
3. The **AI Processing Layer** (§10) picks up new raw items and runs them through its stages in order: Cleaning → Language Detection → Translation (where applicable) → Duplicate Detection → Summarization → Topic Extraction → Entity Extraction → Trend Detection → Market Signals.
4. Structured output from each stage is written to the **Knowledge Store** (§11), always keeping a traceable link back to the raw item(s) it came from — nothing enters the Knowledge Store without provenance.
5. **Future Modules** (§15) and, optionally, the **CRM Integration surface** (§12) read from the Knowledge Store. Nothing ever flows back from the Knowledge Store into the Raw Data Layer or a Collector — the pipeline is strictly one-directional.

---

## 7. Supported Source Types

Collectors must be pluggable (Architecture Principle 2) and the CRM must never depend on a specific Collector (Architecture Principle 3) — both apply to every row below.

| Source Type | What its Collector does |
|---|---|
| **CRM** | Reads already-existing CRM data (e.g. products, purchases) as one *input* to the platform — this is the platform reading *from* the CRM, the reverse direction of §12's CRM Integration. Read-only, non-blocking: if the CRM is unreachable, this Collector simply yields nothing that cycle, the same as any other failed Collector. |
| **Public Facebook Groups** | Collects publicly visible posts/discussion from jade/jewelry-related Facebook groups. |
| **Industry Websites** | Collects articles/listings/news from jade/jewelry industry websites. |
| **RSS** | Subscribes to and collects items from RSS/Atom feeds relevant to the market. |
| **PDF Reports** | Ingests PDF market/industry reports (from wherever they're sourced) as raw documents. |
| **Manual Import** | Lets a staff member manually submit a piece of market information (a document, a note, a link) the automated Collectors don't reach. |
| **Future Sources** | Any source type not listed above — the Collector Framework (§8) must be able to accommodate one without changing any other Collector or any core layer. |

**On the CRM appearing as both a Source Type here and an integration target in §12:** these are two independent, non-symmetric relationships. The platform optionally *reading* CRM data (this section) does not imply the CRM depends on the platform, and the CRM optionally *reading* the Knowledge Store (§12) does not imply the platform depends on the CRM. Either direction must degrade gracefully if the other side is unreachable.

---

## 8. Collector Framework

- **One common interface.** Every Collector, regardless of source type, conforms to the same contract at the business level: given its own configuration, it produces a stream/batch of raw items, each carrying the common metadata named in §6 step 1.
- **Independent lifecycle.** A Collector can be added, removed, paused, or left broken without affecting any other Collector or any layer downstream of the Raw Data Layer.
- **Configuration-driven, not hardcoded.** Each Collector instance is parameterized by its own configuration (which Facebook group, which RSS URL, which website, which folder for Manual Import) — the platform core never hardcodes a specific source.
- **No shared state between Collectors.** One Collector's failure, backlog, or rate-limiting never blocks another.
- **Collectors are the platform's only boundary to the outside world.** No other layer (Raw Data Layer, AI Processing Layer, Knowledge Store) ever reaches out to an external source, an external API, or the CRM directly — only a Collector does.

---

## 9. Raw Data Layer

- An append-only record of everything any Collector has ever produced, kept in its original, uninterpreted form.
- Purpose: one durable record of "what was actually collected and when," independent of how the AI Processing Layer currently interprets it — if the AI Processing Layer's logic changes or improves later, historical raw items can be reprocessed without re-collecting them.
- Never mutated by anything downstream — the AI Processing Layer reads from it but never writes back into it.
- Retains full provenance (source type, source identifier, source reference, collection timestamp) alongside the raw content itself, for every item, indefinitely (retention policy is an open question — see §17).

---

## 10. AI Processing Layer

Each stage below is described at business-goal level — no specific model, vendor, or algorithm is chosen here (see §17 Open Question #3).

- **Cleaning** — strips formatting noise, boilerplate, and non-substantive content (ads, navigation text, repeated headers/footers) from a raw item down to its substantive content.
- **Language Detection** — determines which language a raw item is written in (jade/jewelry market chatter may span Vietnamese, Chinese, English, and others).
- **Translation (optional)** — where a genuine business need exists, translates an item into a working language. Explicitly optional and deferrable per item, not a mandatory step every item must pass through.
- **Duplicate Detection** — recognizes when a new raw item is substantially the same as one already processed (e.g. a post cross-posted to several Facebook groups, an RSS item re-published on a website), so the Knowledge Store isn't flooded with repeats.
- **Summarization** — condenses a cleaned item into a short, human-readable summary.
- **Topic Extraction** — identifies what subject(s) a piece of content is about (e.g. a jade category, a market event, a pricing discussion).
- **Entity Extraction** — identifies named things mentioned in the content (place names, supplier names, mine names, material/product types) at a business-information level.
- **Trend Detection** — identifies patterns emerging across many processed items over time (e.g. a topic or entity mentioned with rising frequency).
- **Market Signals** — turns a detected trend, or a sufficiently notable individual item, into a concrete, business-facing signal (e.g. "rising discussion volume about X") that a Future Module or a staff member could act on.

**Traceability constraint (Architecture Principle 7):** every output of this layer — a summary, an extracted entity, a detected trend, a market signal — always keeps a traceable link back to the raw item(s) it was derived from. Nothing enters the Knowledge Store as an unattributed AI output.

---

## 11. Knowledge Store

- The structured, queryable destination for everything the AI Processing Layer produces: cleaned items, summaries, topics, entities, trends, and market signals — each still linked back to its originating raw item(s) for provenance and auditability (§10).
- The **only** read surface for Future Modules (§15) and, optionally, the CRM Integration surface (§12).
- The **only** thing that ever writes into it is the AI Processing Layer — no Collector, no Future Module, and no CRM code writes into the Knowledge Store directly.
- Described here in business terms only — "the platform's single source of truth for processed market knowledge" — not as a specific database or storage technology, which is an implementation decision outside this document's scope.

---

## 12. CRM Integration

- **One-directional, read-only, optional.** If a future CRM feature wants to draw on this platform's knowledge, it may query the Knowledge Store (or a purpose-built read surface in front of it) — the reverse of §7's CRM-as-Source relationship.
- **Not designed here.** This document states the constraint any future integration must honor; it does not design the actual integration surface (API shape, authentication, which CRM screen would consume it, etc.). Building that would be a separate, CRM-side Business Design task under the CRM's own workflow (`docs/PROJECT_MANIFEST.md`'s Development Workflow), requiring its own Product Owner approval — and, per this task's explicit instruction, it must never modify the CRM's existing, LOCKED Market Intelligence module.
- **The CRM must be fully functional with this platform absent, degraded, or unreachable.** No current or future CRM feature may hard-depend on this platform being available.
- The CRM's Sidebar today already reserves a navigation entry for a future "Kho kiến thức" (Knowledge Vault) surface — a plausible eventual landing point for this integration, consistent with §15's Knowledge Vault Future Module, though wiring any of that up is out of scope for this document.

---

## 13. Scalability

- Each layer (Collector Framework, AI Processing Layer, Knowledge Store) scales independently — they're decoupled by the Raw Data Layer and Knowledge Store boundaries, so scaling one doesn't require touching another.
- New Collectors add horizontally, without any change to existing Collectors or to any core layer (Architecture Principle 2).
- The Raw Data Layer is expected to grow unbounded over time (append-only, §9) — a retention/archival policy is not decided here (§17 Open Question #6).
- AI Processing Layer stages (§10) should be independently scalable — duplicate detection load, for example, grows differently than summarization load, and the framework must allow each stage to scale on its own.
- Source volume varies wildly by type — an RSS feed is low-volume/high-frequency, a PDF report is high-volume/low-frequency — the Collector Framework must not assume uniform load across source types.

---

## 14. Security

- Each Collector holds only the credentials/access it personally needs for its own source (e.g. a specific group's access, a specific website's access) — credentials are scoped per-Collector, never shared platform-wide (consistent with Architecture Principle 2's independence).
- Collecting from Public Facebook Groups and Industry Websites must respect each source's own terms of access — this document does not decide the specific compliance approach (§17 Open Question #4).
- Raw content collected from public sources may incidentally contain personal data (names, phone numbers appearing in group posts) — a handling/redaction policy is not decided here (§17 Open Question #5).
- The CRM Integration surface (§12), if and when built, must be read-only and independently access-controlled — this platform should not assume the CRM's current "no role-based access control" precedent applies to it.
- Platform credentials and secrets (source logins, API keys) never live inside the CRM codebase or the CRM's environment — full separation, consistent with Architecture Principle 1's independence.

---

## 15. Future Modules

None of the following are designed by this document — they are named only to establish the roadmap this Package 1 architecture must not foreclose. All of them read from the Knowledge Store (§11) only, per §4.

| Future Module | Business framing |
|---|---|
| **Supplier Intelligence** | Market knowledge specifically about suppliers — reliability, pricing patterns, sourcing chatter. |
| **Mine Intelligence** | Knowledge specifically about jade mines/origins — supply conditions, sourcing news. |
| **Pricing Intelligence** | External market pricing signals and trends — distinct from the CRM's own internal Market Intelligence, which only ever reads the CRM's own sales data. |
| **Customer Intelligence** | External market knowledge relevant to customer segments/preferences — distinct from the CRM's existing, unrelated "Jade Intelligence" recommendation engine (see §17 Open Question #1). |
| **Auction Intelligence** | Knowledge about auction activity/results in the jade/jewelry market. |
| **Knowledge Vault** | A browsable/searchable staff-facing surface over the Knowledge Store itself. |
| **API** | A programmatic read surface over the Knowledge Store for other systems, potentially including the CRM (§12). |
| **Mobile App** | A mobile-facing client for browsing platform knowledge. |

---

## 16. Out of Scope

- Any CRM code, schema, or existing CRM module change — the CRM's Market Intelligence module (LOCKED) and every other CRM module are untouched by this document.
- Any SQL, database schema, or migration.
- Any React, UI, or frontend code.
- Any actual implementation of a Collector, the AI Processing Layer, or the Knowledge Store.
- Any specific technology, vendor, cloud provider, or AI model/vendor selection — this document stays at the business/architecture level (§17 Open Question #3).
- Any of the 8 Future Modules (§15) — named as roadmap only, none designed here.
- Any legal/compliance/terms-of-service determination for collecting from public Facebook groups or industry websites (§14, §17 Open Question #4).
- The actual CRM Integration surface (§12) — the constraint is stated, the surface itself is not built.
- Predicting future prices — the same "no prediction" boundary the CRM's own Market Intelligence module holds is carried forward as a business goal here too, even though (unlike the CRM's module) this platform explicitly does include AI processing (§10).

---

## 17. Open Questions

1. **Name collision.** "Jade Intelligence Platform" shares its name with the CRM's existing, already-implemented "Jade Intelligence" module (the customer-product recommendation engine on Customer Detail — `docs/AI_JADE_SPEC.md` / `docs/JADE_INTELLIGENCE_UI.md`, both LOCKED, live). These are two unrelated systems. Confirm whether this is an intentional umbrella brand covering both, or whether one should be renamed to avoid confusion going forward.
2. **AI boundary confirmation.** `docs/MARKET_INTELLIGENCE_SPEC.md` (LOCKED) explicitly bans AI/ML/LLM inside the CRM. This platform is independent and explicitly includes an AI Processing Layer (§10). The two instructions are consistent (one governs a CRM module, the other governs a separate platform) but the boundary is worth an explicit Product Owner sign-off given how close the two projects sit to each other.
3. **AI approach/vendor.** Whether the AI Processing Layer (summarization, topic/entity extraction, trend detection) runs on internally-hosted models, third-party AI APIs, or classical NLP techniques is not decided here — a real cost, data-privacy, and vendor-lock-in decision for a later phase.
4. **Collection legality/compliance.** The approach to Public Facebook Groups / Industry Website collection (terms of service, rate limits, robots.txt, consent) is flagged in §14 but not resolved.
5. **Personal-data handling.** Retention/redaction policy for personal data incidentally present in collected public content (names, phone numbers) is not decided.
6. **Raw Data Layer retention.** Unbounded growth is noted (§13) but no retention/archival window is set.
7. **CRM Integration surface design.** §12 states the constraint (read-only, optional, non-blocking) but does not design the actual surface — that is future, CRM-side Business Design work under the CRM's own workflow, once this platform architecture itself is approved.
8. **Ownership/hosting.** Whether this platform is run by the same team as the CRM, a separate internal team, or a third-party vendor is not stated — it affects the Security (§14) and Integration (§12) assumptions this document currently states only at the "must be independent" level.

---

Business Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
