# Knowledge Vault Module — Business Design Spec

**Module:** Knowledge Vault
**Status:** Draft — Revision 2, Product Owner Review applied (PARTIAL PASS) — awaiting further Product Owner review.
**Phase:** Business design only. No code, no SQL, no migrations were written for this document.

**Revision 2 changelog (this pass, Product Owner Review — 7 decisions):**
1. **`docs/PROJECT_MANIFEST.md` is not updated.** (Resolves former Open Question 1 — declined, not adopted.)
2. **Knowledge Vault is permanently Read Only** — no Create, no Edit, no Delete, with no future phase implied. §1.6 restated as an unconditional lock rather than a current-scope statement.
3. **The 5 Knowledge Categories (§1.3) are locked as-is** — no rename, no addition, no removal. (Resolves former Open Question 3.)
4. **No Attachments — text only.** Removed from Knowledge Structure (§1.4). (Resolves former Open Question 4.)
5. **Permissions locked:** all CRM users, Read Only, no RBAC — no role-based or category-based scoping of any kind. (Resolves former Open Question 5.)
6. **Knowledge Entries must not reference Products, Customers, Inventory, or Master Data.** The "Related CRM Reference" field is removed from Knowledge Structure (§1.4); Data Sources (§1.7) narrowed to Internal Knowledge records only — Knowledge Vault no longer reads any existing CRM data. (Resolves former Open Question 6, more strictly than proposed.)
7. **`/docs` is kept completely separate from Knowledge Vault** — no dependency, link, or content overlap in either direction. (Resolves former Open Question 7.)

All Open Questions from Revision 1 are resolved or declined by Decisions 1–7 above and are removed — none remain (former Open Question 2 is addressed in Self Review, not by a numbered decision — see the chat response for this revision).

---

## 1. Business Design

### 1.1 Module Purpose

Knowledge Vault is a **read-only** structured repository for business knowledge used by CRM users — jade/gemstone knowledge, sales and customer-service reference material, internal process/policy reference, and glossary/terminology. Today this kind of knowledge lives in staff memory, informal notes, or outside the CRM entirely; Knowledge Vault gives it one organized, searchable home inside the system.

It is explicitly **not** a chatbot, not a Q&A assistant, and not a recommendation engine. Users browse and search structured entries directly — there is no natural-language interface and no generated answer of any kind.

### 1.2 Business Scope

In scope:
- Browsing Knowledge Vault entries by category.
- Searching entries by keyword/title/tag (§1.5).
- Reading a single entry's full content.

Knowledge entries are fully standalone content — they do not reference Products, Customers, Inventory, or Master Data (Decision 6, §1.4, §1.7).

Out of scope is covered fully in §1.9. This document does not address how entries are authored or maintained — see Self Review for this revision.

### 1.3 Knowledge Categories

**Locked (Product Owner Review, Revision 2, Decision 3)** — exactly these 5 categories, as proposed in Revision 1, no rename/addition/removal:

| Category | Content |
|---|---|
| **Product & Material Knowledge** | Jade types/grades, gemstone characteristics, care & maintenance guidance |
| **Sales & Customer Knowledge** | Negotiation guidance, customer-service reference, answers to common customer questions |
| **Business Process & Policy** | Internal procedure reference, pricing-policy reference, return/exchange-policy reference (reference only — the authoritative policy itself, if it drives any system behavior, lives in its owning module) |
| **Terminology / Glossary** | Definitions of trade/grading terminology used in this business (e.g. jade grading terms, color/category vocabulary) — authored independently as static text, with no live link to Product/Master Data records (Decision 6) |
| **Market & Industry Reference** | General, static reference context about jade sourcing/origins and industry background |

This is a **static reference library**, distinct in kind from Market Intelligence (computed trends/rankings over live transaction data) and from Reports (computed operational breakdowns). Knowledge Vault entries are authored content, not query results.

### 1.4 Knowledge Structure

Conceptual shape of a single Knowledge entry (no schema, table, or field is being proposed or committed here — Database Design will formalize this if approved):

- **Title**
- **Category** (§1.3)
- **Body content** (the knowledge text itself — **text only**, Decision 4)
- **Tags / Keywords** (for search, §1.5)
- **Last Updated** date
- **Status** (Active / Archived) — display state only, not a workflow

**Locked (Product Owner Review, Revision 2):** no attachments/images of any kind (Decision 4 — removed the Revision 1 open question, text only). No "Related CRM Reference" field — Knowledge entries do not reference Products, Customers, Inventory, or Master Data in any form (Decision 6 — removed entirely, not merely made optional).

### 1.5 Search Rules

- Search by **Title**, **Tags/Keywords**, and **Category** filter.
- Simple keyword match against Body content (substring/partial match, same pattern as existing CRM search — e.g. Product List's `product_name`/`product_code` search).
- No semantic search, no natural-language question answering, no ranking by relevance model — keyword and category matching only, consistent with §1.1's "not a chatbot" constraint.
- Search only narrows what is displayed; it never changes underlying data.

### 1.6 Read-only Rules

**Locked (Product Owner Review, Revision 2, Decision 2):** Knowledge Vault is **permanently** Read Only — no Create, no Edit, no Delete, for any role, with no future write phase implied by this document.

- Knowledge Vault has **no create, edit, delete, or archive UI** anywhere in this module.
- No business logic in this module ever writes to Knowledge entries or to any other module's data.
- How entries get authored or updated in the first place is explicitly not designed here — see Self Review for this revision.

### 1.7 Data Sources

**Locked (Product Owner Review, Revision 2, Decision 6):** Knowledge Vault's only data source is its own content — it does not read Products, Customers, Inventory, or Master Data in any form.

- **Internal Knowledge records** — the entries themselves (§1.4). This is a new conceptual data source; no table, column, or storage mechanism is proposed in this document.
- **No existing CRM data of any kind** — Revision 1 proposed reading existing master data for glossary/cross-reference purposes; this is withdrawn (Decision 6). Knowledge Vault is fully standalone.
- **No external APIs, no web scraping, no external data of any kind** — every entry is authored content already inside this CRM's ownership, never fetched from outside.
- No AI, no Machine Learning, no LLM, no OCR, no Image Recognition — restated per the task's explicit constraints; none of these are a data source or a processing step anywhere in this module.

### 1.8 Permissions

**Locked (Product Owner Review, Revision 2, Decision 5):** all CRM users have **read-only** access to all of Knowledge Vault. **No RBAC** — no role-based or category-based scoping of any kind. Every user sees every category.

No write permission exists for any role within this module's scope — Knowledge Vault is read-only for everyone, including admins (§1.6). Any future authoring capability would be a separate, not-yet-designed module or process.

### 1.9 Out of Scope

- AI, Machine Learning, LLM, chatbot, or any conversational/Q&A interface.
- OCR, Image Recognition, Web Scraping, external APIs — no external data of any kind.
- Any create, edit, delete, or archive capability, for any role, at any time (Decision 2 — permanent, not phased).
- Any new database migration, table, or schema — this document proposes no implementation.
- Redesigning or modifying any existing (locked) CRM module or its data.
- **Any reference from a Knowledge entry to Products, Customers, Inventory, or Master Data**, in any form (Decision 6).
- Any attachment or image on a Knowledge entry — text only (Decision 4).
- Any RBAC, role-based, or category-based permission scoping — uniform read access for all CRM users only (Decision 5).
- Any change to `docs/PROJECT_MANIFEST.md` (Decision 1).
- Any dependency, link, or content overlap with `/docs` (Decision 7).
- Any recommendation, personalization, or ranking logic — Knowledge Vault surfaces the same content to a search/browse action, it does not suggest content based on user behavior (same AI-adjacent ban already applied to Jade Intelligence's rejected rules).
- Authoring/maintenance workflow for Knowledge entries — not designed in this document (see Self Review for this revision).

---

## 2. Open Questions

None. Revision 1's seven open questions are resolved or declined by Decisions 1–7 above (Product Owner Review, Revision 2) and are not carried forward.

---

Business Design only. No code written. No database changes. No UI changes. Stopping — waiting for Product Owner Review.
