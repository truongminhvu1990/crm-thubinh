# Knowledge Vault Module — UI Design Spec

**Module:** Knowledge Vault
**Status:** Draft — Revision 2, Product Owner Review applied (PARTIAL PASS) — awaiting further Product Owner review.
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level design description only.
**Based on:** `docs/KNOWLEDGE_VAULT_SPEC.md` (Revision 2 — **LOCKED**). This document does not redesign, reinterpret, or add business logic or business rules. Every element below traces back to an already-locked section of that spec, cited inline as (Spec §N).

**Revision 2 changelog (this pass, Product Owner Review — 6 decisions):**
1. **Route locked:** `/knowledge-vault`. (Resolves former Open Question 1.)
2. **Knowledge Detail locked:** `/knowledge-vault/[id]`, a routed sub-page. **No Drawer.** (Resolves former Open Question 2.)
3. **Sidebar locked:** add a "Knowledge Vault" entry, positioned after Market Intelligence and before Settings. (Resolves former Open Question 5.)
4. **Archived Entries locked:** do NOT display — excluded from Knowledge List, Search results, and Knowledge Detail entirely. (Resolves former Open Question 3.)
5. **Default Sort locked:** Title ASC. (Resolves former Open Question 4.)
6. **Categories locked:** each category displays Category Name + Entry Count. (Resolves former Open Question 6.)

All Open Questions from Revision 1 are resolved by Decisions 1–6 above and are removed — none remain.

---

## Design Principles

1. **Read-only, and visibly so.** No create, edit, delete, or archive control appears anywhere in this design — no control exists to disable, it is simply absent (same convention as `INVENTORY_UI.md` Design Principle 1, `MARKET_INTELLIGENCE_UI.md` Design Principle 1). This is a **permanent** property of the module (Spec §1.6, Decision 2), not a phase-1 limitation.
2. **Text only.** No image, file, or attachment control appears anywhere — Body content renders as plain text (Spec §1.4, Decision 4).
3. **No CRM entity references.** No screen in this design links out to, embeds, or displays a Product, Customer, Inventory, or Master Data record. A Knowledge entry is fully standalone content (Spec §1.4/§1.7/§1.9, Decision 6).
4. **No new business rule.** Every field, category, and filter here traces to something Spec §1 already names. This document only decides layout, placement, and interaction — never what data means or how it's computed.
5. **No AI, no chatbot, no natural-language interface.** Search is plain keyword/category matching only (Spec §1.1, §1.5) — no query box styled as a conversational input, no generated summaries or answers.
6. **Consistency where precedent exists.** List/Detail/Empty/Loading states reuse the same conventions already used by Products, Customers, Batches, Inventory, Reports, and Market Intelligence — no new visual language is introduced unless the locked spec requires it (it doesn't).

---

## 1. UI Design

### 1.1 Search Bar

A single text input, per Spec §1.5:
- Matches against **Title**, **Tags/Keywords**, and **Body content** (substring/partial match, same convention as Product List's `product_name`/`product_code` search).
- No autocomplete, no suggested queries, no natural-language input styling — it is a plain filter box, not a chat/ask box (Spec §1.1, §1.5, Design Principle 5).
- Typing narrows the Knowledge List (§1.3) in place; it never changes what data exists.
- Positioned at the top of the page, above the Knowledge Categories filter (§1.2).

---

### 1.2 Knowledge Categories

The 5 categories locked by Spec §1.3, rendered as filter controls (tabs or chips) plus an implicit "All" view.

**Locked (Revision 2, Decision 6):** each category displays its **Category Name + Entry Count** (e.g. "Terminology / Glossary (12)"). Entry Count reflects only visible (non-Archived, Decision 4) entries in that category.

- Product & Material Knowledge
- Sales & Customer Knowledge
- Business Process & Policy
- Terminology / Glossary
- Market & Industry Reference

Selecting a category narrows the Knowledge List (§1.3) to that category only; selecting "All" (or no category) shows entries across all 5. Categories are **display-only filter labels** — no add/edit/remove/reorder control exists for the category set itself (Spec §1.6, permanent read-only).

---

### 1.3 Knowledge List

A list/table of entries matching the current Search (§1.1) and Category filter (§1.2). Each row shows, per Spec §1.4's locked field set:
- **Title**
- **Category** badge
- **Last Updated** date
- A short plain-text excerpt of Body content, for scannability (a rendering choice over the existing Body field — not a new field)

No row exposes an edit, delete, or create affordance anywhere (Spec §1.6). Clicking/tapping a row opens Knowledge Detail (§1.4).

**Locked (Revision 2, Decision 5):** default sort order is **Title ASC**.

**Locked (Revision 2, Decision 4):** Archived entries (Status = Archived) are excluded from the Knowledge List entirely — never returned by browse or search, regardless of category or query.

---

### 1.4 Knowledge Detail

A single entry's full content, per Spec §1.4's locked field set exactly:
- **Title**
- **Category**
- **Body content** (full text, no truncation)
- **Tags / Keywords**
- **Last Updated**
- **Status** (Active / Archived — display only; since Archived entries are never displayed anywhere in this module, Revision 2 Decision 4, this field will only ever read "Active" for any entry a user can actually reach)

No edit, delete, or "create similar entry" control appears anywhere on this screen (Spec §1.6). No outbound link, embed, or reference to any Product, Customer, Inventory, or Master Data record (Spec §1.4/§1.7/§1.9, Decision 6) — Knowledge Detail shows only the entry's own fields.

**Locked (Revision 2, Decisions 1–2):** Knowledge Detail is a routed sub-page at `/knowledge-vault/[id]`. No Drawer, no in-page panel.

**Locked (Revision 2, Decision 4):** an Archived entry's detail URL is not reachable — attempting to view one behaves the same as any not-found ID (Empty/Not-found state, §1.5), never a "this entry is archived" message.

---

### 1.5 Empty State

Same muted-icon-plus-text convention already used across the app (Product/Batch/Inventory/Reports/Market Intelligence):

| Condition | Message (illustrative) |
|---|---|
| A category has no (visible) entries | "Chưa có nội dung trong danh mục này" |
| Search/category filter returns no matches | "Không tìm thấy kết quả" |
| The entire Knowledge Vault has no entries yet | "Chưa có nội dung trong Kho kiến thức" |
| Knowledge Detail requested for a nonexistent or Archived entry's ID | Same not-found state as any invalid ID — no distinct "archived" message (Decision 4) |

No "create the first entry" call-to-action appears in any empty state — there is no create capability anywhere in this module (Spec §1.6).

---

### 1.6 Loading State

No skeleton loaders exist anywhere in this codebase, so Knowledge Vault doesn't introduce one — same centered spinning indicator (`animate-spin`) already used by Product/Batch/Inventory/Reports/Market Intelligence, shown in place of the Knowledge List or Knowledge Detail content while it loads.

---

### 1.7 Mobile Layout

- Search Bar (§1.1): full width, top of page.
- Knowledge Categories (§1.2): horizontal scrollable chip row directly below the Search Bar.
- Knowledge List (§1.3): single-column stacked cards.
- Knowledge Detail (§1.4): full-screen view (own route, back navigation to the list) — no side-panel/drawer on mobile.

---

### 1.8 Desktop Layout

- Search Bar (§1.1) and Knowledge Categories (§1.2) sit in a single row at the top of the page.
- Knowledge List (§1.3): full-width table/card grid below the search/filter row.
- Knowledge Detail (§1.4): a routed sub-page (`/knowledge-vault/[id]`, **locked, Decisions 1–2**), matching the List/Detail pattern already used by Products, Customers, and Batches — no Drawer, confirmed over the alternative considered in Revision 1 (Inventory's Product Detail Drawer primitive).

---

### 1.9 Permissions (Read Only)

This codebase has no role-based access control anywhere (same confirmed precedent as `ORDERS_UI.md` §20, `INVENTORY_UI.md` §1.12, `REPORTS_UI.md` §1.10, `JADE_INTELLIGENCE_UI.md` §1.10, `MARKET_INTELLIGENCE_UI.md` §1.12). Knowledge Vault doesn't introduce one either — **locked (Spec §1.8, Decision 5): all CRM users, read-only, no RBAC** — this is a design constraint applied uniformly, not a permission system with roles.

| Action | Available? |
|---|---|
| View Knowledge Categories / Knowledge List / Knowledge Detail | Yes — any authenticated user, every category |
| Search / filter by category | Yes |
| Create, edit, delete, or archive a Knowledge entry | No — no control exposed anywhere in this module (Spec §1.6) |
| View a Product, Customer, Inventory, or Master Data record from within Knowledge Vault | No — no such reference exists (Spec §1.4/§1.7/§1.9) |
| Attach or view an image/file on an entry | No — text only (Spec §1.4, Decision 4) |

---

### 1.10 Navigation Flow

```
Knowledge Vault (/knowledge-vault) — dedicated page
├── Search Bar (§1.1)
├── Knowledge Categories filter (§1.2) — All / 5 locked categories
└── Knowledge List (§1.3)
      └── → Knowledge Detail (/knowledge-vault/[id]) (§1.4)
```

**Locked (Revision 2, Decision 1):** route is `/knowledge-vault`.

**Locked (Revision 2, Decision 3):** `components/Sidebar.tsx` gets a new "Knowledge Vault" entry (no pre-seeded disabled row existed — confirmed by direct check, same gap Market Intelligence had), positioned **after Market Intelligence ("Thị trường") and before Settings ("Cài đặt")**. No outbound links from any Knowledge Vault screen to another module's pages (Design Principle 3).

---

## 2. Open Questions

None. Revision 1's six open questions are resolved by Decisions 1–6 above (Product Owner Review, Revision 2) and are not carried forward.

---

UI Design only. No code written. No database changes. No implementation. Stopping — waiting for Product Owner Review.
