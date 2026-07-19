# Knowledge Vault Module — Database Design

**Module:** Knowledge Vault
**Status:** Draft — Revision 2, Product Owner Review applied (PARTIAL PASS) — awaiting further Product Owner review.
**Phase:** Database design only. No SQL, no migrations, no Prisma, no Supabase, no TypeScript were written for this document.
**Based on:** `docs/KNOWLEDGE_VAULT_SPEC.md` (Revision 2 — **LOCKED**) and `docs/KNOWLEDGE_VAULT_UI.md` (Revision 2 — **LOCKED**). This document does not redesign, reinterpret, or add business logic; every table and field below traces back to an already-locked section of one of those two documents, cited inline as (Spec §N) or (UI §N).

**Why this document exists:** Development Increment 1 (2026-07-17) found that Knowledge Vault had skipped this phase entirely — the workflow went Business Design LOCKED → UI Design LOCKED → Development directly, with no `knowledge_entries` table ever designed or approved. Development was paused by Product Owner decision and no application code was touched to work around the gap (no mock data, no hardcoding) — this document is the missing phase, produced retroactively before Development resumes.

**Revision 2 changelog (this pass, Product Owner Review — 7 decisions):**
1. **Category locked to TEXT, not Enum.** §1.2, §1.5 updated — the 5-value constraint is application-validated, not database-typed.
2. **Tags locked to TEXT, comma-separated** — not a native array column. §1.2 updated. (Resolves former Open Question 3.)
3. **Last Updated locked to automatically maintained by the database** — not manually authored. §1.2 updated. (Resolves former Open Question 4.)
4. **Search mechanism locked to ILIKE**, against Title, Body, and Tags. §1.6, §1.7 updated. (Resolves former Open Question 6.)
5. **Read Only locked to application-level enforcement only — no RLS.** §1.8 updated. (Resolves former Open Question 5.)
6. **Business Code locked to none — Primary Key (Internal ID) only.** §1.3 confirmed as proposed. (Resolves former Open Question 2.)
7. **Content Authoring locked to outside the CRM — seed or import only.** §1.8 updated; no admin/CMS module is implied. (Resolves former Open Question 1.)

All Open Questions from Revision 1 are resolved by Decisions 1–7 above and are removed — none remain.

---

## 1. Database Design

### 1.1 Table

**One new table: `knowledge_entries`.**

No other table is introduced. Unlike Orders (four tables — header/line/payment/audit-log), Knowledge Vault has no line items, no payment events, and no audit trail requirement anywhere in the locked spec — it is a single flat list of standalone content records (Spec §1.4). No join table, no tag table, no category table — see §1.5 and §1.9 for why Category is not modeled as its own table.

### 1.2 Columns

| Column | Purpose | Business Data Type | Required / Optional |
|---|---|---|---|
| Internal ID | Primary Key — uniquely identifies the entry row internally (§1.3). | Internal ID (system-generated, same pattern as `customers.id`/`products.id`) | Required |
| Title | The entry's title (Spec §1.4). | Text | Required |
| Category | Which of the 5 locked categories this entry belongs to (§1.5). | Text — application-validated against exactly 5 fixed values (**locked, Decision 1: TEXT, not Enum**) | Required |
| Body | The knowledge text itself — **text only**, no rich text, no HTML, no attachments (Spec §1.4, Decision 4). | Text (long-form, plain text) | Required |
| Tags | Keywords used for search (Spec §1.4, §1.6). | Text — comma-separated list (**locked, Decision 2**) | Optional (may be empty) |
| Last Updated | Displayed on Knowledge Detail (Spec §1.4). | Date — **automatically maintained by the database** on every row change (**locked, Decision 3**), not manually authored | Required |
| Status | Active or Archived (§1.4 below). | Enum: `Active` / `Archived` | Required |

**Deliberately absent from this table** (Spec §1.4/§1.7/§1.9, Decision 6): any Product reference, Customer reference, Inventory reference, or Master Data reference. No column here points at any other table in this database.

### 1.3 Primary Key

**Internal ID** — a system-generated identifier, the same pattern already used by `customers.id`, `products.id`, and `product_batches.id` elsewhere in this codebase.

**Locked (Product Owner Review, Revision 2, Decision 6): no business code.** Unlike Orders (`Order Number`) or Product (`product_code`), Knowledge entries have no separate human-facing business code — Internal ID is the only identifier, confirmed as proposed. Search remains by Title/Tags/Body only (Spec §1.5); there is no "look up an entry by code" use case anywhere in this design.

### 1.4 Status

`Active` / `Archived` — restates Spec §1.4 exactly, no new values, no new meaning.

**Locked, enforced by this design (Spec §1.6 Decision 2; UI §1.3/§1.4 Decision 4):** the application's read path must never return an Archived entry, in any list, search result, or detail view — this is the exact rule Development Increment 1 already implemented at the query level (`.eq("status", "Active")`) rather than filtering client-side after the fact. This document treats that as the correct, binding pattern: **every read against this table must filter to `Active` at the query itself**, not as a UI-layer afterthought. See §1.10 for how this gets verified.

### 1.5 Category

**Locked (Product Owner Review, Revision 2, Decision 1): stored as TEXT, not a database Enum type** — exactly 5 valid values, enforced by the application, not the column type:

1. Product & Material Knowledge
2. Sales & Customer Knowledge
3. Business Process & Policy
4. Terminology / Glossary
5. Market & Industry Reference

These are the 5 categories locked by Spec §1.3 (Decision 3 — "no rename/addition/removal" without a new spec revision). The set is still closed and spec-revision-controlled — Decision 1 only changes *how* that closure is enforced (application validation on write/seed, per §1.10 Verification Rule 2) rather than a database-level Enum type. **Not a Master Data reference, not its own table** — this remains unchanged from Revision 1: Decision 6 (Spec) separately forbids any Master Data reference from this table regardless of how Category is typed. There is no category-management screen, no add/remove-category capability, and no dependency on `master_data` anywhere in this design.

### 1.6 Searchable Fields

**Locked (Product Owner Review, Revision 2, Decision 4): search mechanism is ILIKE** (case-insensitive pattern match), against exactly these three columns, per Spec §1.5 and UI §1.1:

- **Title**
- **Body**
- **Tags**

**Category is a filter, not a searched field** — UI §1.2 treats it as an equality selection (Category Filter chips), never as free-text search input. No other column (Internal ID, Last Updated, Status) is ever matched against a search query.

### 1.7 Indexes

(Business access patterns this data model must serve — no SQL, no index syntax.)

| Access pattern | Why it needs to be fast | Index target |
|---|---|---|
| Every single read, with no exception (§1.4) | Status = Active must be filtered on every query this module ever issues — the single most load-bearing filter in this design | `knowledge_entries` — Status |
| Default list order (UI §1.3, Decision 5: Title ASC) | Knowledge List always sorts by Title | `knowledge_entries` — Title |
| Category Filter + Entry Count (UI §1.2, Decision 6) | Every category chip's count and every filtered list view groups/filters by Category | `knowledge_entries` — Category |
| Keyword search against Title/Body/Tags (§1.6, Decision 4: ILIKE) | Search Bar substring matching | `knowledge_entries` — Title, Body, Tags (search-oriented, not a plain equality index — ILIKE pattern matching, an implementation-time index-strategy choice) |

No index is proposed for a hypothetical future query — every entry above ties directly to a locked spec/UI decision.

### 1.8 Read-only Rules

Restates Spec §1.6 (Decision 2) and UI §1.9 at the database-design level:

- **No write path exists in the application** for this table — confirmed already true of Development Increment 1's code, which only ever issues a `select`. This document does not change that.
- **This document proposes no INSERT/UPDATE/DELETE capability of any kind**, for any role, anywhere in the application (Spec §1.6 — permanent, not a phase-1 limitation).
- **Locked (Product Owner Review, Revision 2, Decision 5): Read Only is application-level only — no RLS.** No database/access-policy-level write block is introduced. This is the same category of trade-off `ORDERS_DATABASE.md` §13 names for `order_events`' append-only guarantee — accepted here as a deliberate, confirmed choice rather than an oversight.
- **Locked (Product Owner Review, Revision 2, Decision 7): Content Authoring happens entirely outside the CRM — seed or import only.** Every row in `knowledge_entries` originates from a direct database seed or import process, never from any application UI, admin panel, or future CMS-style module. No authoring capability of any kind is implied anywhere in this design.

### 1.9 Out of Scope

- Any Foreign Key or reference column to `customers`, `products`, `product_batches`, or `master_data` (Spec §1.7/§1.9, Decision 6).
- Any attachment, image, or file column — text only (Spec §1.4, Decision 4).
- Any table, trigger, or stored procedure supporting create/edit/delete/archive — none exists anywhere in this design (§1.8).
- A separate `knowledge_categories` table — Category is a fixed, application-validated list (§1.5), not a configurable, admin-managed list.
- A database Enum type for Category — locked to TEXT instead (Decision 1).
- A native array/list column for Tags — locked to comma-separated TEXT instead (Decision 2).
- Any version-history or edit-audit table (no equivalent of Orders' `order_events`) — nothing in the locked Spec or UI names a history/timeline requirement for Knowledge entries.
- Any soft-delete or `deleted_at` column — Status (`Active`/`Archived`, §1.4) already serves the only state transition this module has; there is no Delete capability to support with a separate mechanism.
- Any Row-Level Security policy — Read Only is application-level only (Decision 5).
- Any application UI, form, or admin/CMS module for authoring Knowledge entries — Content Authoring is seed/import only, outside the CRM (Decision 7).
- Any report or cache table reading from `knowledge_entries` — nothing in the locked Spec names a Reports/Dashboard/Market Intelligence dependency on Knowledge Vault data, in either direction.

### 1.10 Verification Rules

Business-level, testable statements the Product Owner can check once this design is implemented — no SQL, no test code:

1. Querying `knowledge_entries` through any application read path with Status = Archived must return zero rows, always, with no exception.
2. Every stored Category value must be one of exactly the 5 values named in §1.5 — since Category is TEXT, not a database Enum (Decision 1), this must be checked by whoever seeds/imports data (§1.8, Decision 7), not assumed from the column type alone.
3. The default (no search, no filter) Knowledge List order must be Title, ascending.
4. No column on `knowledge_entries` stores a Product, Customer, Inventory, or Master Data reference of any kind.
5. No column on `knowledge_entries` stores an attachment, image, or file of any kind.
6. No write endpoint, form, button, or code path exists anywhere in the application that can INSERT, UPDATE, or DELETE a row in this table (application-level Read Only, Decision 5 — no RLS is expected to be the backstop).
7. Selecting Category "All" plus each of the 5 individual categories accounts for every visible (Active) row exactly once — no entry is uncategorized, and no entry's Entry Count is double-counted across categories.
8. Last Updated changes automatically whenever a row is seeded or re-imported (Decision 3) — it is never a value manually chosen by whoever prepares the seed/import data.
9. Tags is a single comma-separated text value per row (Decision 2) — seed/import data must not rely on any other delimiter or a native array/list type.

---

## 2. Open Questions

None. Revision 1's six open questions are resolved by Decisions 1–7 above (Product Owner Review, Revision 2) and are not carried forward.

---

Database design only. No SQL written. No migrations. No implementation. Stopping — waiting for Product Owner Review.
