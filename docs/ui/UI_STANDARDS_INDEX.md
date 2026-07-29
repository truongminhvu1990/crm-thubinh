# UI Standards Index

**Status:** APPROVED
**Purpose of this file:** central registry of every official UI Standard for the CRM Operating System. If a layout, component, or interaction pattern has been formally standardized (audited, approved by Product Owner decision, documented), it is listed here with a link to its standard document. If it isn't listed here, it isn't an official standard yet — treat it as an existing convention at most, not a locked rule.

---

## 1. Purpose

Multiple pages across this codebase independently reimplemented the same UI patterns (toolbars, cards, buttons) with small, accumulating inconsistencies — the Search Toolbar Standard exists precisely because one such inconsistency (`flex-1 min-w-0` vs. no floor at all) became a production bug. This index exists so that:

- Anyone building a new page can find the approved pattern for a given UI concern in one place, instead of copying whatever the nearest existing page happens to do.
- "Official standard" has one clear meaning: audited, approved via Product Owner decision, and documented under `docs/ui/`. Nothing is a standard by default just because it repeats across many files.
- Future standardization work (see §7) has a known home and a known process (see §6) instead of being decided ad hoc per page.

## 2. Standard Categories

Categories exist to organize `docs/ui/` as it grows, not to imply that every category currently has content. A category with no entries is a placeholder, not a gap that needs filling on its own — new entries are added only through the approval process in §6.

| Category | Covers | Current entries |
|---|---|---|
| **Layout & Toolbar Standards** | Page-level layout patterns: toolbars, filter bars, page headers, card containers | Search Toolbar Standard |
| **Form & Input Standards** | Text inputs, selects, currency/date inputs, validation/error presentation | None yet |
| **Table & List Standards** | Table layout, row actions, empty/loading states, pagination | None yet |
| **Component Usage Standards** | When/how to use shared components (`Button`, `Modal`, `AlertDialog`, `Badge`, `Card`, `StatCard`, etc.) | None yet |
| **Accessibility Standards** | Cross-cutting a11y rules (focus, labeling, contrast, keyboard nav) that apply platform-wide rather than to one component | None yet — partially covered ad hoc inside Search Toolbar Standard §9, pending its own standard |

## 3. Current Standards

| Standard | File | Category | Status | Revision |
|---|---|---|---|---|
| Search Toolbar Standard | [`docs/ui/SEARCH_TOOLBAR_STANDARD.md`](./SEARCH_TOOLBAR_STANDARD.md) | Layout & Toolbar Standards | APPROVED | Revision 1 |

## 4. Versioning

Each standard document tracks its own revision number, independent of this index:

- New standards start at **Revision 1**.
- A revision bump is required for any change to a standard's *rules* (e.g. changing the 240px search-box floor, adding a new breakpoint value, changing which pages are in/out of scope). Cosmetic edits (typo fixes, added examples that don't change a rule) do not require a revision bump.
- Each standard document should carry its own revision number and a short changelog for any bump, matching the convention already used elsewhere in `docs/` (e.g. `docs/INVENTORY_UI.md`'s "Revision 3 changelog").
- This index always reflects the **current** revision of each standard, not its history — revision history lives in the standard's own file.
- Superseding or retiring a standard does not delete its file; mark its Status in this index as `SUPERSEDED` or `RETIRED` and note the replacement, so old links and prior audits remain traceable.

## 5. Ownership

- **Product Owner** — owns the decision to establish, approve, revise, or retire a standard. No standard is "official" (i.e., listed in §3) without an explicit Product Owner approval, matching the process already used for the Search Toolbar Standard (Production Audit → approved rollout scope and architecture decisions → approved standardization → approved documentation).
- **Development Engineer** — authors and maintains the technical content: writes the standard document, keeps it accurate against the actual implementation, flags when code and documentation drift apart, and proposes candidate standards (§7) for Product Owner review. Does not unilaterally declare something an official standard — that requires the approval in §6, consistent with the existing rule that business/architecture decisions are not made unilaterally by the engineering role.
- **This index** is maintained alongside each standard's approval — a new standard is added to §3 in the same change that creates it, not as a separate later step.

## 6. Approval Process

The process already followed for the Search Toolbar Standard, formalized here as the process for every future standard:

1. **Audit** — an engineering audit surveys current usage of the pattern in question across the codebase (what exists, what's inconsistent, what's risky), without changing code.
2. **Product Owner decision** — the Product Owner reviews the audit and approves (a) whether to standardize at all, (b) the scope (which pages/patterns are covered), and (c) any concrete architecture decisions the standard will encode (e.g. the 240px floor, the `lg`/`sm` breakpoint rule).
3. **Implementation** — approved decisions are implemented in code (e.g. extracting a shared component), scoped exactly to what was approved. No page-specific workarounds; if a page doesn't fit the approved pattern, that's flagged back to the Product Owner rather than special-cased silently.
4. **Documentation** — a standard document is written under `docs/ui/`, describing the pattern as built (not as aspiration), including any explicitly approved exceptions.
5. **Registration** — the standard is added to this index (§3), with category, status, and revision.
6. **Revision** — any later change to an established standard's rules re-enters this process at step 2 (Product Owner decision) before the document or index is updated.

## 7. Future Standards

The following are **candidates only** — none are approved, none are scheduled, and nothing in this section commits to building or documenting any of them. They're listed because they're existing patterns/components already reused across many files without a formal standard behind them, which is the same condition that existed for toolbars before the Search Toolbar Standard. Turning any of these into an official standard requires going through §6, starting with an audit, the same as toolbars did.

- **Card container standard** — `bg-card border border-border rounded-xl shadow-sm p-4 ...` is hand-repeated as a className string on nearly every list/toolbar page rather than coming from a shared wrapper component.
- **Component usage standards** for existing shared components that have no documented usage rules yet: `Button` (variant/size conventions), `Modal`, `AlertDialog`, `Badge`, `Select`, `Card`, `StatCard`, `CurrencyInput`.
- **Table/List standard** — row action visibility (hover-only vs. always-visible), empty-state and loading-state presentation, pagination placement — already flagged as inconsistent in prior usability reviews (`docs/CUSTOMERS_USABILITY_REVIEW.md`).
- **Accessibility standard** — cross-cutting rules (labeling, focus order, keyboard navigation, `aria-live` regions for async result updates) rather than the pattern-specific accessibility notes currently living inside individual standards (e.g. Search Toolbar Standard §9).

Any of these moving from "candidate" to "current standard" requires a Product Owner decision to open the audit, per §6 — this list is not a queue or a roadmap commitment.
