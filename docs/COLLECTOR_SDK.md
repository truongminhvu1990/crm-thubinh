# Jade Intelligence Platform — Collector SDK (Technical Design)

**Package:** T3 — Technical Design, Collector SDK
**Status:** Draft — **Revision 2** (supersedes Revision 1 in this same file — the Product Owner Decision expanded the requested structure: added SDK Principles, Collector Lifecycle, and Testing Strategy as their own sections, and renamed Scheduler/Retry/Failure Contracts to Scheduler Interface/Retry Strategy/Error Handling, and Extension Rules to Extension Model). Awaiting Product Owner Review.
**Phase:** Technical Design only. Interfaces and contracts only — no implementation, no working code, no chosen programming language, no chosen library/framework, no algorithm bodies. Signatures below are language-agnostic pseudocode used only to state a contract's shape (names, inputs, outputs) — not source code.

**Based on — Business Design (all 16, treated as LOCKED per this task's instruction; file headers stay "Draft," unedited, same convention established across every package of this platform):** `docs/JADE_INTELLIGENCE_PLATFORM.md` (1), `docs/CANONICAL_DATA_MODEL.md` (1.5), `docs/TAXONOMY_AND_ONTOLOGY.md` (1.6), `docs/EVIDENCE_AND_PROVENANCE_MODEL.md` (1.7), `docs/COLLECTOR_FRAMEWORK.md` (2), `docs/SOURCE_REGISTRY.md` (3), `docs/RAW_DATA_STORAGE.md` (4), `docs/PREPROCESSING_PIPELINE.md` (5A), `docs/UNDERSTANDING_PIPELINE.md` (5B), `docs/REASONING_PIPELINE.md` (5C), `docs/KNOWLEDGE_GENERATION_PIPELINE.md` (5D), `docs/KNOWLEDGE_GRAPH.md` (6), `docs/KNOWLEDGE_STORE.md` (7), `docs/CRM_INTEGRATION.md` (8), `docs/MONITORING.md` (9), `docs/DEPLOYMENT.md` (10). None of the sixteen is modified by this document.

**Based on — Technical Design:**
- **"System Architecture (T1)" was named in this task as a LOCKED input. Flagged, not silently resolved: no file named or resembling `SYSTEM_ARCHITECTURE.md` (or any "Package T1") exists anywhere in this repository** — checked `docs/` in full, same check `docs/DATABASE_DESIGN.md` (T2)'s own header already recorded for this exact gap. Per that document's own precedent (an `AskUserQuestion` was tried once for this class of gap during Package T2 and declined — the Product Owner re-sent the task instruction unchanged rather than supplying the missing content), this document does not re-block a second time on the same question. It proceeds grounded in what does exist and is actually LOCKED — the 16 Business Design documents above, plus Database Design (T2) below. See Open Question #1.
- **`docs/DATABASE_DESIGN.md` (Package T2) — exists, treated as LOCKED per this task's instruction** (its own header stays "Draft," unedited, same convention). This resolves the numbering ambiguity a prior session of this same package flagged (T2 and an earlier T3 draft were produced in concurrent, mutually-unaware sessions) — the Product Owner's own instruction here now explicitly fixes System Architecture as T1, Database Design as T2, Collector SDK as T3. Not modified by this document; referenced throughout, especially where this SDK's contracts must stay shape-consistent with Database Design §1.5's **Collector Instance** and **Canonical Document** record types.

---

## 1. Collector SDK

### 1.1 SDK Principles

Technical-level principles governing how this SDK's contracts themselves are designed — distinct from, and additive to, Collector Framework §2's business-level Design Principles, which these restate at the interface level rather than replace:

1. **Contracts, not implementations.** This SDK defines what a Collector, Registry, and Scheduler must look like from the outside. It defines zero method bodies, zero default behavior, and chooses no programming language — consistent with this task's "no implementation" instruction.
2. **One Collector Interface, every Collector Type.** Every Collector Type named in Collector Framework §5 (Website, RSS, Facebook, PDF, CRM, Excel, API, Manual Import, Future) implements the exact same interface (§1.2) — there is no per-Type variant contract.
3. **No AI-capable method exists on any contract.** Collector Framework Design Principle 2 ("no AI inside a Collector") is enforced structurally here, not just by policy: no method defined anywhere in this document accepts or returns anything resembling a summarized, classified, or entity-extracted result. If a future Collector Type needed such a method, that would be a Business Design change to Collector Framework §2 first, not an SDK extension.
4. **Contracts are storage-shape-aware, but storage-agnostic.** Where a contract's data (e.g. a `CollectorInstanceRecord`, §1.4) overlaps with a record type Database Design (T2) §1.5 already defines, this SDK reuses that record's shape by reference rather than inventing a second one — but, consistent with T2 §1.4, no database product or storage technology is chosen here either.
5. **Additive extensibility applies to contracts, not just schemas.** Database Design (T2) §1.1 Principle 5 states the schema must accommodate new types without reshaping existing tables; this SDK holds itself to the equivalent standard — a new Collector Type must be addable without altering any existing contract's method signatures (§1.9).
6. **The SDK never crosses the hand-off boundary.** Consistent with Collector Framework §4, no interface defined here reaches into AI Pipeline, Knowledge Store, or CRM Integration logic — the SDK's responsibility ends at delivering a Canonical Document past that boundary.
7. **Every contract must be independently verifiable.** Each interface below is scoped so it can be exercised and validated on its own, without requiring a live external Source or a running Scheduler/Registry — this principle is what §1.10's Testing Strategy is built on.

---

### 1.2 Collector Interface

The technical contract every Collector implementation — regardless of Collector Type — must satisfy. Mirrors the Collector Lifecycle (§1.3) as callable operations.

```
Collector
  getMetadata() -> CollectorTypeId, CollectorInstanceId, CollectorVersion
  discover(sourceConfig, discoveryState) -> List<DiscoveredItem>
  collect(discoveredItem) -> RawContent
  normalize(rawContent, sourceContext) -> CanonicalDocument
```

- `getMetadata()` identifies which Collector Type and instance is running (feeds the Registry Interface, §1.4, and the Traceability chain — Evidence & Provenance Model §9).
- `discover()` returns only what's newly available (Collector Framework §4's Discovery stage) — how "newly available" is tracked is Open Question #3.
- `collect()` returns the raw, source-native content, unmodified (Raw Data Storage's immutability guarantee begins the moment this returns, and corresponds to a **Raw Data Item** record, Database Design §1.5).
- `normalize()` is the only method permitted to produce a Canonical Document (Canonical Data Model §3) — its return shape is the same **Canonical Document** record Database Design §1.5 already defines (id, raw_data_item_id, source_id, source_type, collector_id, language, title, content, summary, author, published_time, collected_time, url, hash, lifecycle_status), not a new shape invented by this SDK.
- No method on this interface performs cleaning, language detection, summarization, entity/topic extraction, trend detection, or market-signal generation (Collector Framework §2, Design Principle 2; SDK Principle 3 above) — those methods simply do not exist on this contract.
- Hand-off to the AI Pipeline boundary (Collector Framework §4) is **not** a Collector Interface method — the SDK, not the Collector implementation, is responsible for taking a `normalize()` result and delivering it past the boundary (§1.3).

---

### 1.3 Collector Lifecycle

The technical sequence in which the SDK invokes Collector Interface (§1.2) methods, mapping directly onto Collector Framework §4's business-level Lifecycle (Discovery → Collection → Normalization → Canonical Document → Hand-off):

1. **Discovery.** The SDK calls `discover(sourceConfig, discoveryState)` once per scheduled/triggered run (§1.5). The returned `List<DiscoveredItem>` may be empty — an empty list is a normal outcome (Collector Framework §8's "Unavailable source" and ordinary no-new-content cases both surface this way), not an error.
2. **Collection.** The SDK calls `collect(item)` once per `DiscoveredItem`, independently. One item's failure does not stop the SDK from calling `collect()` on the remaining items (Collector Framework §8's Partial Collection, restated technically in §1.7).
3. **Normalization.** The SDK calls `normalize(rawContent, sourceContext)` once per successfully collected item, independently, with the same isolation guarantee as step 2.
4. **Canonical Document produced.** Each successful `normalize()` call yields one Canonical Document, validated by the SDK to match Database Design §1.5's Canonical Document record shape before proceeding — a Collector implementation that returns a malformed shape fails at this step rather than being passed on silently.
5. **Hand-off.** The SDK — never the Collector implementation — delivers each validated Canonical Document (and its originating Raw Data Item) to the Raw Data Store and Canonical Document Store (Database Design §1.3), and onward to the AI Pipeline boundary (Collector Framework §4). The Collector's own involvement with that document ends at step 3's return; it has no callback, no notification, and no further role.

This sequence runs once per triggered execution (§1.5's `ExecutionHandle`), and steps 2–4 run once per `DiscoveredItem` within that execution — a single execution can therefore produce many Canonical Documents, some `FailureRecord`s (§1.7), or both.

---

### 1.4 Registry Interface

The technical contract for the Collector Registry (Collector Framework §6) — the platform's bookkeeping of every Collector *instance*, its configuration, and its current operating status.

```
CollectorRegistry
  register(collectorTypeId, instanceConfig) -> CollectorInstanceId
  unregister(instanceId) -> void
  getInstance(instanceId) -> CollectorInstanceRecord
  listInstances(filter?) -> List<CollectorInstanceRecord>
  updateStatus(instanceId, status) -> void
  getStatus(instanceId) -> status  // Active | Paused | Broken
```

- A `CollectorInstanceRecord` is the same **Collector Instance** record Database Design §1.5 already defines (id, collector_type, source_id, configuration reference, status, scheduling_approach) — this SDK does not define a second, competing shape.
- `register()` is the technical entry point for Collector Framework §9's "adding a Collector is a Registry-level change only" guarantee — it must never require a corresponding change to the AI Pipeline, Knowledge Store, or CRM Integration contracts.
- The Registry Interface deliberately has no method that *runs* a Collector — that responsibility belongs entirely to the Scheduler Interface (§1.5), per Collector Framework §6's own distinction ("tracks which Collectors exist... does not decide when a Collector runs").
- Whether the Registry is also the owner of Discovery state (§1.2's `discoveryState` parameter) is Open Question #3 — Database Design §1.5's Collector Instance record has no explicit field for it today, which this document does not resolve.

---

### 1.5 Scheduler Interface

The technical contract for triggering a Collector Interface (§1.2) execution, mapping Collector Framework §7's four Scheduling concepts (Manual, Scheduled, Event-driven, Continuous) onto callable triggers.

```
Scheduler
  assignSchedule(instanceId, scheduleType, scheduleParameters) -> void
  triggerNow(instanceId) -> ExecutionHandle          // Manual
  onEvent(instanceId, eventType, eventPayload) -> ExecutionHandle   // Event-driven
  // Scheduled and Continuous triggers are internal to the Scheduler's own
  // timing mechanism and are not separately exposed as caller-invoked methods.
```

- Exactly one Scheduling approach is assigned per Collector instance at a time (Collector Framework §7) — `assignSchedule()` replaces, not adds to, any prior assignment for that instance.
- Whatever triggers a run, the Scheduler's only responsibility is invoking that instance's Collector Lifecycle (§1.3) once — the Scheduler contract does not itself interpret or transform anything the Collector returns.
- No cadence values, timing engine, or event-source implementation are chosen here — `scheduleParameters` and `eventType`/`eventPayload` are placeholders for whatever a later, still-undecided design fills in (Collector Framework §7 Open Question #3, carried forward as this contract's own Open Question #2).
- `ExecutionHandle` is a reference a caller can use to correlate a triggered run with its eventual Error Handling (§1.7) and Logging Contract (§1.8) output — no retry or status-polling behavior is implied by its shape alone.

---

### 1.6 Retry Strategy

The technical shape into which Collector Framework §8's Retry concept plugs — deliberately still no retry count, backoff formula, or algorithm, consistent with that document's own "business handling only" boundary. Modeled as a pluggable strategy, not a fixed rule, so a Collector Type or instance can vary it without changing the Collector Interface itself.

```
RetryPolicy
  isRetryable(failureRecord) -> boolean
  nextAttempt(failureRecord, attemptHistory) -> RetryDecision   // retry-now | retry-later | give-up
```

- `isRetryable()` distinguishes failures worth retrying (a transient network error) from ones that are not (a permanently revoked API key) — the specific rule for that distinction is not defined here (Open Question #4).
- `nextAttempt()` is the single place a concrete backoff/attempt-limit policy would eventually be plugged in — this contract states that such a decision point exists, not what the decision is (Collector Framework §8: "retrying is expected behavior, not which retry count or backoff policy applies").
- A retried attempt re-enters the Collector Lifecycle (§1.3) at `collect()` or `discover()`, never at `normalize()` alone — retrying never assumes previously-collected raw content is reused across attempts unless a future revision says otherwise (Open Question #5).
- This contract does not decide where `RetryPolicy` instances are configured (SDK default, per-Collector-Type, per-instance) — see Open Question #2, which mirrors Collector Framework §12 Open Question #3's still-unresolved Scheduling-ownership question.

---

### 1.7 Error Handling

How the SDK represents and propagates failures across the Collector Lifecycle (§1.3), technically restating Collector Framework §8's business-level failure categories (Collection failure, Unavailable source, Partial collection).

**Failure record shape:**

```
FailureRecord
  collectorInstanceId
  executionHandle
  timestamp
  failureType        // CollectionFailure | UnavailableSource | NormalizationFailure
  itemReference?      // present when the failure is item-level (partial collection), absent when run-level
  message
  retryable            // boolean, as judged by RetryPolicy.isRetryable() (§1.6)
```

**Propagation behavior:**

- A `collect()` or `normalize()` call that fails for one `DiscoveredItem` (§1.3, step 2 or 3) does not stop the SDK from continuing with the remaining items in that execution — this is the technical form of Collector Framework §8's Partial Collection ("8 of 10 RSS items normalize fine, 2 don't"). Each failed item produces one `FailureRecord` with its own `itemReference`; the successful items still produce ordinary `CanonicalDocument` output with no `FailureRecord` at all.
- An `UnavailableSource` failure (source completely unreachable) is run-level, not item-level — `itemReference` is absent, and Collector Framework §8's framing applies unchanged: this is non-fatal and expected, never platform-wide (Collector Framework Design Principle 5, "independent, isolated failure").
- `FailureRecord` is the object a `RetryPolicy` (§1.6) is evaluated against, and the object Monitoring (Monitoring §6–7) would observe for Health Status and Alerts — this contract does not decide whether Monitoring's own store (Database Design §1.5's Monitoring records) or the SDK itself is the system of record for storing these (Open Question #6).
- No `FailureRecord` is ever produced for an AI-analysis judgment — Collectors have no interpretive output to fail on (Collector Framework §3's "out of scope" list; SDK Principle 3).

---

### 1.8 Logging Contract

The technical shape of what a Collector execution must emit so Monitoring's Business Metrics, Health Status, and Audit Trail (Monitoring §5–7) have something concrete to observe — restated here as the SDK's obligation, not Monitoring's own design (which remains untouched).

```
CollectorLogEvent
  collectorInstanceId
  executionHandle
  timestamp
  stage        // Discovery | Collection | Normalization | HandOff
  outcome      // Started | Succeeded | Failed | PartiallySucceeded
  itemCount?   // number of items involved, where applicable
  failureRecordRef?   // link to a FailureRecord (§1.7), when outcome is Failed/PartiallySucceeded
```

- One `CollectorLogEvent` is emitted at the start and end of each Lifecycle stage (§1.3) for a given execution — this is the minimum shape required, not a mandated logging library, format, or transport.
- `outcome: PartiallySucceeded` on the Normalization stage is how a partial-collection run (§1.7) becomes visible to Monitoring without Monitoring needing to inspect individual `FailureRecord`s itself.
- Whether every Collector Type must emit identical event shapes, or may extend this minimum shape with Collector-Type-specific fields, is Open Question #7.
- This contract does not define Monitoring's Health Status thresholds or Alert routing (Monitoring §6, itself still open on alert ownership) — it only guarantees the raw events Monitoring would need exist.

---

### 1.9 Extension Model

The technical counterpart to Collector Framework §9's Extensibility Rules and Database Design §1.1 Principle 5 — restated as concrete SDK-level obligations for adding a new Collector Type.

Adding a new Collector Type requires exactly these steps, and no others:

1. Implement the Collector Interface (§1.2) — `getMetadata()`, `discover()`, `collect()`, `normalize()` — producing a `normalize()` output that matches the Canonical Document shape (§1.2, Database Design §1.5), indistinguishable from any other Collector Type's output.
2. Register at least one instance of it through the Registry Interface (§1.4).
3. Assign it a Scheduling approach through the Scheduler Interface (§1.5).

No other step is required or permitted. Specifically:

- A new Collector Type must never require a new or modified method on the AI Pipeline, Knowledge Store, or CRM Integration contracts (Collector Framework §9).
- A new Collector Type must never introduce a second hand-off shape — every Collector Type's `normalize()` output is a Canonical Document, full stop; there is no "extended" or "specialized" Canonical Document variant.
- A new Collector Type may extend the Logging Contract (§1.8) with additional fields (per §1.8's own open question) but must always emit the minimum required shape.
- A new Collector Type is free to define its own `RetryPolicy` (§1.6) parameters, but must implement the `RetryPolicy` contract's shape, not bypass it.
- A new Collector Type must not require a schema change to Database Design (T2)'s existing record types (§1.1 Principle 5 there) — any source-specific richness routes through Metadata (Canonical Data Model §6, Database Design §1.5's Metadata Entry), never a new column or table per Collector Type.

---

### 1.10 Testing Strategy

Business/technical-level testing concepts only — no test framework, tool, or test code is named or written here, consistent with this document's "no implementation" instruction.

- **Contract conformance, not live-source testing.** A Collector Type implementation should be verifiable against the Collector Interface (§1.2) using a fixture or mock source — a canned set of `DiscoveredItem`/`RawContent` inputs — never requiring a live connection to a real Facebook group, website, or feed. This follows directly from SDK Principle 7 (every contract independently verifiable).
- **Each Lifecycle stage testable in isolation.** `discover()`, `collect()`, and `normalize()` (§1.2, §1.3) should each be exercisable and checkable on their own — consistent with Collector Framework Design Principle 5's "independent, isolated failure," a Collector Type's test suite should be able to prove one stage's failure doesn't corrupt another stage's output.
- **Canonical Document conformance is the one guarantee every Collector Type's tests must prove.** Regardless of Collector Type, `normalize()`'s output must match Database Design §1.5's Canonical Document record shape — this is the single cross-cutting test every current and future Collector Type shares (Collector Framework Design Principle 3; SDK Principle 2).
- **Partial-collection behavior is testable via Error Handling (§1.7).** A test scenario with some items succeeding and some failing should verify: successful items still yield Canonical Documents, failed items yield `FailureRecord`s with correct `itemReference`s, and no failure blocks an unrelated item.
- **Retry Strategy (§1.6) is testable without a live retry.** `isRetryable()` and `nextAttempt()` can be exercised against a fabricated `FailureRecord` and `attemptHistory`, independent of any real Collector execution.
- **Registry (§1.4) and Scheduler (§1.5) integration is out of scope for a single Collector Type's own test suite.** A new Collector Type's tests should not need to stand up the whole Registry or Scheduler to prove its own Collector Interface conformance — that integration is a separate, platform-level testing concern, not named further here.
- **AI Pipeline output correctness is explicitly out of scope.** This Testing Strategy covers only what a Collector produces up to and including Hand-off (§1.3, step 5) — whatever the AI Pipeline does with a Canonical Document afterward is that (not-yet-designed) pipeline's own testing concern.

---

## 2. Open Questions

1. **System Architecture (T1) does not exist.** This task named it as a LOCKED input; no such document exists anywhere in the repository. This Collector SDK was produced directly from the Business Design's technical-shape implications and Database Design (T2) instead (see header). Carries forward Database Design §2 Open Question #1 unchanged — if a System Architecture document is produced later, both this document and Database Design should be checked against it for consistency.
2. **Retry policy ownership.** Is a `RetryPolicy` (§1.6) an SDK-wide default, a per-Collector-Type default, or a per-instance override? Mirrors Collector Framework §12 Open Question #3 (Scheduling ownership) unresolved in the same shape.
3. **Discovery state ownership.** §1.2's `discover()` takes a `discoveryState` parameter — is that state owned/persisted by the Registry (§1.4), by each Collector implementation itself, or by a separate SDK component not yet named? Database Design §1.5's Collector Instance record has no explicit field for it today. This is the direct technical form of Collector Framework §12 Open Question #2, still unresolved here.
4. **Retry-eligibility rule.** §1.6's `isRetryable()` distinguishes retryable from non-retryable failures, but the actual rule (which `failureType`/conditions qualify) is not defined.
5. **Retry re-entry point.** Does a retried attempt always restart at `discover()`/`collect()` (§1.3), or can it resume from a previously-collected but not-yet-normalized `RawContent`?
6. **Failure/Log system of record.** Are `FailureRecord` (§1.7) and `CollectorLogEvent` (§1.8) persisted directly into Database Design (T2) §1.5's Monitoring records, or held by the SDK and only later handed to Monitoring? Neither document decides this today.
7. **Logging shape extensibility.** Can individual Collector Types add fields to `CollectorLogEvent` (§1.8), or must every Collector Type emit an identical shape for Monitoring to rely on uniformly?
8. **Health-check method.** Should the Collector Interface (§1.2) expose a lightweight health-check/self-test method distinct from a real `discover()`/`collect()` run, to feed Monitoring's Health Status (Monitoring §4) without waiting for a scheduled execution?
9. **Interface versioning.** If a Collector Interface implementation changes its `normalize()` mapping later, does the SDK require an explicit version field on the interface itself (distinct from the Collector Instance record Database Design §1.5 already tracks), and how does that interact with Collector Framework §12 Open Question #7 (Collector versioning vs. already-produced Canonical Documents)?
10. **Testing conformance ownership.** Is contract-conformance testing (§1.10) a requirement enforced by the SDK itself (e.g. a shared test harness every Collector Type must pass before registration) or left entirely to each Collector Type's own implementation team? Not decided.

---

Technical Design only. No code written. No implementation. Stopping — waiting for Product Owner Review.
