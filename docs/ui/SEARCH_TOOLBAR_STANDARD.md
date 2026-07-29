# Search Toolbar Standard

**Status:** APPROVED — implemented, in production use, closed for further migration as of this document.
**Owner component:** `components/ui/SearchToolbar.tsx` (wraps `components/ui/SearchInput.tsx`)
**Applies to:** every page/component in the CRM that places a text search box next to filter controls (selects, date inputs, buttons).

This document describes the layout standard as built, not a proposal. Every rule below is backed by a real file in this repo; where a rule isn't yet fully enforced everywhere, that's called out explicitly in §12 rather than glossed over.

---

## 1. Purpose

A production bug (Customers/Products search boxes collapsing to 0px width, filter dropdowns visually crowding into the empty space) was traced to a CSS flexbox interaction: the search box used `flex-1 min-w-0` next to a filter block with no width constraint of its own. Under the shrink algorithm, an item with `flex-basis: 0%` (`flex-1`) and no minimum floor absorbs zero of the "keep me visible" budget once the filter block overflows — it renders at literally 0px while the filter block eats the row.

The fix was generalized: extract the search+filter row into one shared component (`SearchToolbar`) so the width-safety mechanism lives in exactly one place, is impossible to accidentally omit, and never has to be hand-derived per page again. This document exists so that mechanism stays the only way toolbars are built going forward.

## 2. Scope

**In scope** — any toolbar row containing a text search box (`SearchInput`) placed beside one or more filter controls (native `<select>`, the `Select` component, date inputs, action buttons). This is the exact shape that produced the original bug.

**Out of scope** — a standalone `SearchInput` with no competing sibling in the same flex row (e.g. a modal's customer-lookup field, a detail-page member search, a plain full-width list search with no filter row). These cannot reproduce the collapse bug because there is no sibling to steal their width from; they use `SearchInput` directly with no wrapper. Examples already in the codebase: `app/knowledge-vault/page.tsx`, `app/settings/staff/page.tsx`, `components/marketing/VoucherFormModal.tsx`, `app/orders/new/page.tsx`.

**Known exception, not yet migrated** — `app/settings/permissions/audit/page.tsx`. Its search box sits in a single always-`flex-wrap` row alongside a `Select` and a date-range group (no `flex-col` → `flex-row` stacking transition at all). That's a structurally different layout, not a duplicate of the pattern this standard governs. Migrating it would change its responsive stacking behavior, which is outside what any approved ticket has asked for. Revisit only via an explicit Product Owner decision, not silently.

## 3. Layout Structure

Every toolbar governed by this standard has exactly two slots, produced by one component:

```tsx
<SearchToolbar search={<SearchInput ... />}>
  {/* filter controls, buttons */}
</SearchToolbar>
```

`components/ui/SearchToolbar.tsx`:

```tsx
export default function SearchToolbar({
  search,
  children,
  breakpoint = "lg",
  className,
}: SearchToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        breakpoint === "sm" ? "sm:flex-row" : "lg:flex-row",
        className
      )}
    >
      <div className="flex-1 min-w-[240px]">{search}</div>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}
```

- **Search slot** — `search` prop, always rendered first, always wrapped in `flex-1 min-w-[240px]`.
- **Filter slot** — `children`, rendered second, auto-wrapped in `flex flex-wrap gap-3`. Anything passed as children (selects, date inputs, buttons) wraps onto additional lines instead of shrinking the search box.
- The toolbar itself does **not** own the outer card chrome (`bg-card border border-border rounded-xl shadow-sm p-4 ...`). That wrapper varies slightly per page (some have `mb-6`, Sales Ledger adds `space-y-3` for a second filter row) and is left to the page, since it was never the buggy part.

## 4. Responsive Rules

- Below the active breakpoint: `flex-col` — search and filters each render full width, stacked vertically.
- At/above the active breakpoint: `flex-row` — search and filters sit side by side, search taking the flexible remainder, filters wrapping onto extra lines if they don't fit.
- The filter slot's own `flex-wrap` is what absorbs overflow — it is expected and correct for filters to spill onto a second (or third) line inside their own slot. The search box never shrinks to accommodate that; it holds its `min-w-[240px]` floor and grows into whatever remains.

## 5. Search Area Rules

- Always the `SearchInput` component (`components/ui/SearchInput.tsx`) — never a bare `<input>` built by hand for a toolbar search box.
- Always placed in `SearchToolbar`'s `search` prop, never given its own inline `flex-1`/`min-w-*` wrapper by a page.
- Minimum width is **240px**, fixed inside `SearchToolbar`. This is the platform default (Product Owner decision, Search Toolbar Standard rollout) — do not override it per page. If a specific page genuinely needs a different floor, that's a component change (see §13), not a page-level class.
- Text and caret color are explicit on the input (`text-card-foreground caret-card-foreground`) rather than inherited from an ancestor — this was a separate fix (typed text could inherit an ancestor's text color and become invisible against `bg-card`) and is baked into `SearchInput` itself, not something toolbar usage needs to think about.

## 6. Filter Area Rules

- Filter controls are passed as `SearchToolbar` children; do not build a separate `flex flex-wrap` div by hand around them — the component already provides it.
- Individual filter controls use a fixed or component-managed width (e.g. `sm:w-40`, `sm:w-52`, or a `Select` component's own `className`) — never `flex-1` on an individual filter. Filters are allowed to be as narrow or wide as their content needs; they are not competing for the remaining row space the way the search box is.
- Order filters left-to-right by how commonly they're changed (status/type filters before secondary ones like date ranges), matching existing usage in Orders, Customers, Products, Inventory.

## 7. Action Area Rules

- Action buttons (`components/ui/Button.tsx` — refresh, export, import, clear-filters, add-new) live in the same `children` slot as the filters, typically last. They wrap with everything else under `flex-wrap` — there is no separate, protected "always visible" action zone.
- "Clear filters" buttons are conditionally rendered (`{hasActiveFilters && <Button>...}`) in every existing usage — keep that convention; don't render a disabled clear button when there's nothing to clear.
- The primary "add new" action (`Thêm khách`, `Thêm sản phẩm`, etc.) is visually the last child and uses `variant="primary"` with `whitespace-nowrap`, matching Customers/Products/Orders.

## 8. Breakpoint Rules

`breakpoint` accepts `"lg"` (default) or `"sm"`. Current usage across the codebase:

| Breakpoint | Pages | Rationale |
|---|---|---|
| `lg` (default) | Customers, Products, Orders, Inventory (Products tab), Marketing Automation, Sales Ledger / Data Verification | 4+ filter controls — needs the extra width room a full desktop breakpoint gives before switching to row mode, otherwise filters wrap excessively on tablet-width screens. |
| `sm` | Inventory (Batches tab), Marketing Voucher, Marketing Campaigns, Marketing Segments | 1–2 filter controls only — safe to go row-mode as soon as `sm` (640px); the light filter load can't crowd the search box even at that narrower width. |

**Rule for new toolbars:** count the filter controls (including action buttons that always render). 3 or more → use the `lg` default. 1–2 → `sm` is acceptable but not required; `lg` is always the safe choice if unsure.

## 9. Accessibility Guidelines

Current state and forward guidance — not all of this is implemented yet, called out explicitly rather than asserted as done:

- **Implemented:** visible focus ring on both the search input and filter controls (`focus:border-primary focus:ring-2 focus:ring-primary/20`), keyboard-reachable clear ("×") button, sufficient placeholder/text contrast (`text-card-foreground` on `bg-card`, `text-muted-foreground` for placeholder — both pass standard contrast checks against the theme's white card background).
- **Not yet implemented — recommended for future work:** `SearchInput` has no `aria-label` and relies solely on `placeholder` for its accessible name; placeholder text is not a reliable accessible name for screen readers once the field has a value. Add an `aria-label` matching (or closely paired with) the placeholder wherever a toolbar's search box has no visible `<label>`. The clear button similarly has no `aria-label` (currently just an `X` icon) — add one (`aria-label="Xóa tìm kiếm"` or equivalent) before this pattern is treated as accessibility-complete.
- **Recommended:** when a toolbar's search debounces or filters asynchronously, ensure result-count changes are announced (e.g. via an `aria-live="polite"` region on the "N khách hàng · Hiển thị M" count line most pages already render) — not currently standardized, worth a follow-up ticket rather than a silent addition here.

## 10. Examples

**Full toolbar (4+ filters, `lg` breakpoint)** — `app/customers/page.tsx`:

```tsx
<div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
  <SearchToolbar
    search={
      <SearchInput
        data-testid="customer-search-input"
        placeholder="Tìm theo tên, mã hoặc số điện thoại..."
        value={searchTerm}
        onChange={(e) => handleSearchChange(e.target.value)}
        onClear={() => handleSearchChange("")}
      />
    }
  >
    <select data-testid="customer-type-filter" className="flex-1 sm:flex-none sm:w-40 ...">
      {/* options */}
    </select>
    {/* ...more selects, then Buttons */}
  </SearchToolbar>
</div>
```

**Light toolbar (1–2 filters, `sm` breakpoint)** — `app/marketing/voucher/page.tsx`:

```tsx
<SearchToolbar
  breakpoint="sm"
  search={<SearchInput placeholder="Tìm theo mã hoặc tên..." value={search} onChange={...} onClear={...} />}
>
  <Select options={[...]} value={statusFilter} onChange={...} className="sm:w-48" />
</SearchToolbar>
```

**Standalone search, no toolbar needed** — `app/knowledge-vault/page.tsx`:

```tsx
<SearchInput placeholder="Tìm theo tiêu đề, thẻ hoặc nội dung..." value={search} onChange={...} onClear={...} />
```

## 11. Do / Don't

**Do**
- Use `SearchToolbar` for any new page that pairs a search box with filters.
- Let filters wrap onto extra lines (`flex-wrap` is intentional, not a bug).
- Pick `breakpoint` using the rule in §8.
- Keep business/filter logic (state, `onChange`, API calls) entirely in the page — `SearchToolbar` only arranges layout, it never touches data.

**Don't**
- Don't write `flex-1 min-w-0` (or any inline `min-w-[Npx]`) around a `SearchInput` by hand — that's the exact pattern that caused the original bug and the exact thing `SearchToolbar` exists to eliminate.
- Don't wrap filters in your own `flex flex-wrap` div when using `SearchToolbar` — the component already does it; double-wrapping just adds a redundant layer.
- Don't give an individual filter `flex-1` — filters use fixed/component widths, only the search box competes for remaining space.
- Don't invent a third `breakpoint` value or a page-specific override className for the search slot's width — see §13 for how to propose a real change.

## 12. Migration Rules

If you find a toolbar still using the old inline pattern (a `SearchInput` inside a hand-rolled `flex-1` div, sibling to a filter block), migrate it the same way every page in this rollout was migrated:

1. Import `SearchToolbar` alongside the existing `SearchInput` import.
2. Move the existing `<SearchInput ... />` JSX, unchanged, into the `search` prop.
3. Move the filter controls (selects, inputs, buttons), unchanged, into `SearchToolbar`'s children — delete the hand-rolled `<div className="flex flex-wrap gap-3">` wrapper around them if one existed, since `SearchToolbar` provides it.
4. Choose `breakpoint` per §8; omit the prop entirely for the `lg` default.
5. Do not change any `value`/`onChange`/`onClear`/state logic in the process — this is a pure layout migration. Verify with `tsc --noEmit` and `eslint` on the touched file(s), and a visual check (screenshot or manual) that the toolbar renders unchanged before/after.

This exact procedure was used for all 9 current `SearchToolbar` consumers: `app/customers/page.tsx`, `app/products/page.tsx`, `app/orders/page.tsx`, `app/inventory/page.tsx` (both toolbars), `app/marketing/automation/page.tsx`, `app/marketing/voucher/page.tsx`, `app/marketing/campaigns/page.tsx`, `app/marketing/segments/page.tsx`, `components/salesLedger/SalesLedgerFilters.tsx`.

## 13. Future Extension Rules

- **Changing the 240px default, adding a breakpoint value, or changing the two-slot structure itself** are component-level, platform-wide changes — they affect all 9+ current consumers at once. Treat these as architecture decisions requiring Product Owner sign-off (the same process used to approve the 240px floor and the `lg`/`sm` breakpoint prop), not a change one page owner makes unilaterally.
- **A page that needs a genuinely different toolbar shape** (e.g. three slots, a search box that isn't first, a floor other than 240px) should not fork this pattern with page-specific CSS. Propose a new prop or variant on `SearchToolbar` itself so the one-component guarantee holds, and get it reviewed the same way this standard was.
- **New filter control types** (date-range pickers, multi-select chips, etc.) plug into the existing `children` slot with no changes needed to `SearchToolbar` — the component doesn't care what filters are, only that they're not `flex-1`.
- Any exception granted (like §2's Permission Audit page) must be recorded in this document's §2, not left as tribal knowledge — keep this file the single source of truth for what's in standard and what's a documented, approved exception.
