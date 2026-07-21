# Data Scope Rollout — UI Design Spec

**Sprint:** v4.1 — Data Scope Rollout
**Module:** Cross-cutting (how Data Scope becomes visible on 8 already-existing screens) — not a new product module
**Status:** Draft — Revision 2. Product Owner issued 4 scoped Decisions (46–49) against Revision 1; applied below, nothing else changed. Awaiting Product Owner Review.
**Phase:** UI design only. No React, no HTML, no CSS, no components were written for this document — screen-level business description only.
**Based on:** `docs/DATA_SCOPE_ROLLOUT_SPEC.md` (LOCKED) and `docs/DATA_SCOPE_ROLLOUT_DATABASE.md` (LOCKED). This document does not redesign either, does not redesign Permission Center, does not redesign any of the 8 frozen modules' existing screens, and does not decide anything either locked document left open. It defines only how those documents' already-locked Own/Team/All model becomes **visible** on screens that already exist — no new page is proposed anywhere in this document.

**What this document is not:** a new module, a new list/detail screen, or a toggle letting a staff member change their own scope (Data Scope is configured per role in Permission Center's Role Detail, §3.2 of `PERMISSION_UI.md` — already built, not touched here; an ordinary staff member only ever *sees* the consequence of their role's configured scope, never sets it themselves from these screens).

---

## 1. Scope Indicator

One small, consistently-styled, **read-only** badge — the single UI element this entire rollout introduces, reused verbatim across every scoped screen below rather than invented per-page. Shows exactly one of three labels: **"Của tôi" (Own)**, **"Nhóm" (Team)**, **"Tất cả" (All)** — the resolved Data Scope for the signed-in staff member's role, for the specific resource that screen/widget reads.

- **Always shown, even when the value is "Tất cả."** Omitting the indicator when scope is All (to reduce clutter) would make its absence ambiguous — a viewer couldn't tell "this screen has no scope concept" from "this screen just hasn't loaded its scope yet." Showing it unconditionally, in a muted/low-emphasis style, matches this codebase's established "show 0, don't hide it" honesty principle (`INVENTORY_UI.md` §1.8, carried through every subsequent module).
- **Never a control.** No dropdown, no toggle — a viewer cannot change what this badge shows from the page it's on. Changing it means an Owner/Manager reconfiguring that role's Data Scope in Permission Center, an entirely separate, already-built screen this document does not touch.
- **Placement:** immediately beside each screen's existing page-title/count line (e.g., next to "N khách hàng" on Customer List) — never its own new header row, section, or page.
- **Per-resource, not per-page, wherever a page contains more than one independently-scoped resource** (Dashboard, §6; Reports BI, §7) — Requirement "Dashboard widgets must remain independent per resource" applies to the indicator too: a page showing both a Customers-derived and a Customer-Purchases-derived number gets two indicators, one per resource, never one indicator asserted for the whole page.
- **Exactly one indicator per resource per screen — never repeated across every table/card that happens to represent the same resource (Decision 46).** If a single screen renders the same resource's data in more than one place (e.g., several Reports BI sections all reading Customer Purchases, or two Dashboard cards both derived from Customers), that resource gets **one** Scope Indicator on that screen, not one per section/card. This is distinct from, and doesn't relax, the rule above: *different* resources on the same screen still each get their own indicator — Decision 46 only rules out showing the *same* resource's indicator more than once where it would otherwise be redundant.
- **Never paired with a count of what's hidden.** The indicator states the *rule in effect* ("Của tôi"), never a comparison to what a broader scope would show ("Của tôi — 12 trên tổng 40" is exactly the pattern the Requirements forbid) — covered again, explicitly, in §11.

### 1.1 Search Within Scope (Decision 48)

Every existing search box on every List screen in this document (Customers, Orders, Sales Ledger, Marketing Segments/Campaigns, and any search embedded in a Reports BI/Dashboard widget) **searches only within the already-scoped result set** — search is applied as one more `AND` condition alongside the scope filter already built into the query (`DATA_SCOPE_ROLLOUT_DATABASE.md` §5), the same combining logic Search already uses with ordinary Filters everywhere in this codebase (`PERMISSION_UI.md` §10). **A search box never becomes a way to reach beyond a viewer's Data Scope** — typing a query does not, and must not, expand the underlying dataset back out to Team or All for the duration of that search. No change to any search box's existing placement, placeholder, or debounce behavior — only its underlying result set is affected, and only by narrowing further, never by widening.

---

## 2. Customers UI

Reuses `app/customers/page.tsx` (List) and `app/customers/[id]/page.tsx` (Detail) exactly as they exist today — no new route.

- **List:** the existing count line ("N khách hàng") already reflects the server-filtered result once Customers' Data Scope is wired in (`DATA_SCOPE_ROLLOUT_DATABASE.md` §2 rule 1) — no separate "before/after" count is ever shown. Scope Indicator (§1) appears beside it.
- **Detail, direct-URL access to an out-of-scope customer:** renders the **exact same "not found" treatment** this page already uses for a genuinely nonexistent ID — never a distinguishable "you don't have permission to view this" message, which would itself confirm the record exists (Requirement: "never reveal filtered records"). This is not a new empty/error state — it's reusing the page's existing not-found path for one more reason than before.
- **Decision 44's Owner-only fallback:** if a customer's `assigned_staff_id` can never resolve to any staff (a data-integrity edge case, `DATA_SCOPE_ROLLOUT_DATABASE.md` §9) and an Owner is viewing it, a small, plain note — "Chưa xác định nhân viên phụ trách" (No responsible staff member on record) — may appear near the existing assignment field, since this describes a fact about *that row's own data quality*, not about what any other role can or cannot see elsewhere. Not a new field, a qualifier on the existing "Assigned Staff" display.

---

## 3. Orders UI

Reuses `app/orders/page.tsx`, `app/orders/[id]/page.tsx`, `app/orders/new/page.tsx` exactly as they exist.

- Same List/Detail treatment as Customers (§2) — Scope Indicator on the List, "not found" (not "forbidden") for an out-of-scope Detail direct-access attempt.
- **Orders' name-matching ownership (`DATA_SCOPE_ROLLOUT_DATABASE.md` §2 rule 3, Decision 43)** is invisible to the UI by design — a viewer never sees "matched by name" vs. "matched by id" anywhere; Own/Team either includes a given order or it doesn't, with no exposed reasoning that could hint at *why* a specific row is or isn't visible (which would itself be a partial reveal).
- **Decision 44's Owner-only fallback** applies the same way as Customers (§2) — an unresolved `sales_owner` value, visible only to Owner, gets the same plain "Chưa xác định người phụ trách" qualifier near the existing Sales Owner field, nothing more.
- `app/orders/new/page.tsx` (Create) is a **write path, out of this rollout's scope entirely** (`DATA_SCOPE_ROLLOUT_SPEC.md` §2 — Data Scope governs reads) — no change to the Create form is proposed here.

---

## 4. Customer Purchases UI

Customer Purchases has no standalone list page — it's the `CustomerPurchaseHistory.tsx` section already embedded in Customer Detail. **This is the one place a single page combines two independently-scoped resources**, worth being explicit about: reaching Customer Detail at all already required passing Customers' own scope check (§2); *within* that page, the Purchase History section applies **Customer Purchases' own, separately-resolved scope** (`DATA_SCOPE_ROLLOUT_SPEC.md` §3 — a purchase's owner is whoever closed that specific sale, not necessarily the customer's assigned staff member).

- A Scope Indicator (§1) is added to the Purchase History section's own existing header, distinct from any indicator Customer Detail's other sections might carry — consistent with "independent per resource," extended here from Dashboard widgets to any page combining more than one resource.
- If Customer Purchases' scope legitimately filters out some (not all) of a visible customer's purchase rows, the list simply renders shorter — same Empty State/partial-list treatment as any other scoped list (§10), never a note about how many rows were excluded.
- Sales Ledger reuses this exact same resolution (`DATA_SCOPE_ROLLOUT_DATABASE.md` §1) — nothing about Customer Purchases' own UI changes to accommodate that reuse.

---

## 5. Sales Ledger UI

Reuses `app/reports/sales-ledger/page.tsx` (List) and `app/reports/sales-ledger/[id]/page.tsx` (Detail) exactly as they exist — no new route, no new Verification Mode state beyond what Data Verification already built.

- Same List/Detail Scope Indicator and not-found treatment as Customers/Orders (§2, §3).
- Since the `sales_ledger` view passes `customer_purchases.salesperson`/`salesperson_id` straight through unchanged (`DATA_SCOPE_ROLLOUT_DATABASE.md` §1), Sales Ledger's Scope Indicator always shows the **same value** as Customer Purchases' for the same role — this is a correctness property worth stating, not a coincidence a future change should be allowed to break silently.

---

## 6. Dashboard UI

Reuses `app/dashboard/page.tsx` and its existing card components — no new card, no new page.

- **Each distinct resource shown on the Dashboard gets its own Scope Indicator** (Decision 40, restated as a UI requirement here): the customer-count card shows Customers' resolved scope; the revenue card shows Customer Purchases' resolved scope. **Never one indicator for the whole Dashboard.** If more than one card happens to derive from the *same* resource (e.g., two different Customer-Purchases-based figures), they share that one resource's single indicator rather than each repeating it (Decision 46, §1) — Decision 40's "independent per resource" and Decision 46's "not repeated per same resource" apply together, not in tension: independence is about different resources never sharing one indicator; non-repetition is about the same resource never getting more than one.
- **The Commission widget is explicitly excluded from this rollout** (`DATA_SCOPE_ROLLOUT_SPEC.md` §3, §6 — `sales_commissions` isn't one of the 8 named resources). Its card shows **no Scope Indicator at all**, rather than a misleading one — an absent indicator here means "this widget isn't part of Data Scope," a different, deliberately distinct visual state from "Tất cả" (which means "scoped, and the scope happens to be All"). This distinction matters precisely because the two could otherwise look identical and mislead a viewer into thinking Commission is scoped when it structurally isn't.
- Every widget's number is computed from its own already-scoped query (`DATA_SCOPE_ROLLOUT_DATABASE.md` §5) — no card ever shows a client-side-recomputed or partially-filtered total.

---

## 7. Reports BI UI

Reuses the existing `/reports` page and its section components (`RevenueDashboardCards`, `CategoryAnalysisSection`, `ProductAnalysisSection`, `CustomerAnalysisSection`, `StaffAnalysisSection`, `ProfitSection`, `RevenueTrendChart`, `AnalysisTable`) — no new report, no new page.

- Same per-resource Scope Indicator principle as Dashboard (§6) — each report section shows the scope of whichever resource it actually reads (almost always Customer Purchases, `DATA_SCOPE_ROLLOUT_DATABASE.md` §1). Per Decision 46 (§1), if several sections on the same `/reports` page all read Customer Purchases, that resource's indicator appears **once** on the page, not once per section — `RevenueDashboardCards`, `CategoryAnalysisSection`, `ProductAnalysisSection`, `CustomerAnalysisSection`, `ProfitSection`, `RevenueTrendChart`, and `AnalysisTable` share the one indicator rather than each carrying its own copy.
- **Staff Analysis is the one section requiring special care, flagged explicitly rather than glossed over:** the underlying `reports_staff_analysis` function joins both `customer_purchases.salesperson_id` (in scope) and `sales_commissions.salesperson_id` (out of scope, same Commission gap as Dashboard, §6) into one result. This document does not propose splitting that function — it proposes the UI show **two indicators within that one section**, one on the revenue-derived columns ("Của tôi"/"Nhóm"/"Tất cả") and a distinct "Chưa áp dụng phạm vi dữ liệu" (Data Scope not applied) label on the commission-derived columns, so the section doesn't imply a single, uniform scope over data that structurally isn't uniformly scoped. These two remain separate from the page-level Customer-Purchases indicator above, since they describe Staff Analysis's own mixed nature specifically.

### 7.1 Export (Decision 47)

`ExportButtons.tsx` (existing export functionality) exports **exactly** whatever the on-screen, already-scoped query returned — never a separate, unscoped export path, and never an export larger than what the same viewer would see by scrolling the page itself. Concretely:

- **The export button always exports the current Data Scope's result set** — a Sales rep with Own scope exports their own rows; the file never silently contains Team's or All's rows just because the export mechanism runs as a separate query from the on-screen render.
- **No "Export All" option is offered unless the viewer's resolved scope for that resource is actually "All."** For an Own- or Team-scoped viewer, the export control offers only the equivalent of "export what I can see" — there is no second, broader export choice sitting alongside it that would let a narrower-scoped viewer pull a wider dataset than the screen itself shows them.
- This applies to every export path in this rollout's 8 resources, not only Reports BI — if Sales Ledger, Customer List, or any other screen named in this document ever gains its own export control, the same rule governs it: export scope always matches view scope, exactly, with no separate "export everything" affordance for anyone below "All."

---

## 8. Marketing UI

Reuses the existing Marketing pages (`/marketing/segments`, `/marketing/campaigns`, and the rest of the Marketing group) — no new page.

- **Segments and Campaigns each carry their own Scope Indicator**, since they resolve against different fields (`marketing_segments.created_by` vs. `marketing_campaigns.owner_staff_id`, `DATA_SCOPE_ROLLOUT_DATABASE.md` §1/§5) — the same "independent per resource" principle extended from Dashboard/Reports BI to Marketing's own two sub-resources. A combined Marketing overview screen, if one shows both segment and campaign counts side by side, shows two indicators, not one.
- List/Detail treatment (Scope Indicator, not-found for out-of-scope direct access) matches every other resource in this document.

---

## 9. Activity Log UI

**The one resource in this rollout without a clean, existing multi-staff browsing page to reuse for every role** — worth stating plainly rather than inventing one (which "do not create duplicate pages" and "reuse existing pages" both rule out):

- **Staff Detail's own activity feed** (`getActivityLogsByStaff`, already scoped to exactly one staff member by page design) is the natural "Own" surface — a staff member viewing their own Staff Detail page already sees only their own logged actions, which happens to already match what "Own" scope means for this resource. No change needed here for Sales/Marketing/Viewer's locked "Own" setting (Decision 39) — it's already true today, incidentally, not because this rollout added anything.
- **Permission Center's Audit History (`PERMISSION_UI.md` §9) and the Ops Console's broader Audit Overview** are the only existing screens showing *other* staff members' activity — both currently gated by `settings.manage`, which in the current seed only Owner holds. **This creates a real gap this document surfaces rather than papers over:** Decision 39 locks Manager's Activity Log scope to "Team," but no existing, reusable page lets a Manager browse their team's activity today — the only multi-staff view is gated more restrictively than "Team" would require. This document does not propose building one (that would be a new page, out of scope for a UI-reuse-only rollout) — it's named directly in §17 as a real, unresolved consequence of Decision 39 meeting today's actual screen inventory.
- Wherever Activity Log data *is* shown (Staff Detail's feed, Permission Center's/Ops Console's audit pages), the Scope Indicator (§1) still applies for whichever role is viewing it, once/if that viewer is even allowed onto the page at all — the indicator doesn't solve the access-gate mismatch above, it only labels what's visible on whatever a viewer can already reach.

---

## 10. Empty State

One rule, applied identically across all 8 resources — extending the existing muted-icon-plus-one-line-text convention (`INVENTORY_UI.md` §1.8) with exactly one addition:

- **A scope-caused empty result and a genuinely-empty table must look identical.** If a Sales rep's Own-scoped Customer List has zero rows because they have no assigned customers yet, it renders the exact same "Chưa có khách hàng nào" empty state as an Owner would see on a brand-new, truly empty database — never a distinguishable "no results match your scope" message, since that would itself confirm data exists elsewhere (Requirement: "never reveal filtered records," "do not expose hidden data counts"). The Scope Indicator (§1) sitting beside the empty state already provides all the context a legitimate viewer needs ("I'm seeing Own, and I have none yet") without the empty-state message itself needing to reference scope at all.

---

## 11. Permission Messages

- **The Scope Indicator (§1) is the only permission-related messaging this rollout introduces.** It states the rule in effect, never a comparison, a count, or a reason tied to a specific hidden record.
- **No "X records hidden," "N more available to other roles," or similar comparative language appears anywhere** — this is the Requirements' "do not expose hidden data counts" and "never reveal filtered records" translated directly into copy rules, not just a technical query-layer guarantee.
- **Out-of-scope direct-URL access to a Detail page always reads as "not found," never as "forbidden"** (§2, §3, §5, §8) — a distinguishable permission-denied message would itself leak that the record exists; this codebase's existing not-found treatment already does the right thing without any new copy being written.
- **The one exception, and it's about a row's own data quality, not about another viewer's restricted access:** Decision 44's Owner-only "unresolved ownership" note (§2, §3) — this describes a fact about the specific row Owner is looking at, never a statement about what a lower-scoped role can or cannot see.

---

## 12. Loading Behaviour

No new loading pattern — every screen in this document keeps its existing spinner-in-place convention (`INVENTORY_UI.md` §1.9, unchanged since). One principle worth stating explicitly, since Data Scope is new: **the loading state must cover scope resolution and data retrieval as one unit, not two** — a viewer must never see an unscoped preview flash before the scoped result replaces it. This isn't a new UI affordance to build; it's a direct consequence of Data Scope filtering being applied during query construction (`DATA_SCOPE_ROLLOUT_DATABASE.md` §5, Decision 41) rather than as a client-side post-filter — there is structurally only one fetch, so there is only one loading state, already guaranteed by the locked design rather than something this document needs to additionally specify.

---

## 13. Audit Visibility

Two distinct things, kept separate exactly as the locked Business Design (§9) already separates them:

- **Activity Log's own visibility as a resource** is covered in §9 above (with the Manager/Team gap flagged in §17).
- **Changes to a role's Data Scope setting itself** are already logged (`role_data_scope` entity, Permission Center's existing Audit Integration) and already shown on Permission Center's existing Audit History page (`PERMISSION_UI.md` §9) — this rollout adds no new audit UI for that; it was already built and does not need to be touched or duplicated here.

---

## 14. Responsive Behaviour

No new responsive pattern — the Scope Indicator (§1) is a small badge, following the exact same responsive behavior every other `Badge` usage in this codebase already has (wraps/stacks naturally beside its page-title or widget-header context, no special mobile treatment needed). Every List/Detail page named in this document keeps its own already-established mobile layout (`INVENTORY_UI.md` §1.10, `PERMISSION_UI.md` §14) unchanged — this rollout adds a label, not a layout.

---

## 15. Accessibility

- The Scope Indicator (§1) is a text badge, not an icon-only control — its label ("Của tôi"/"Nhóm"/"Tất cả") is itself the accessible name, no separate `aria-label` needed beyond what this codebase's existing `Badge` component already provides.
- The Commission widget's deliberate *absence* of an indicator (§6) and Reports BI's Staff Analysis dual-indicator (§7) both need a real textual distinction for screen readers, not a color-only one — "Chưa áp dụng phạm vi dữ liệu" is read literally, not implied by a missing element alone.
- Not-found treatment for out-of-scope Detail access (§2, §3, §5, §8) reuses whatever accessible empty/error state each page's existing not-found path already has — no new pattern introduced.

---

## 16. Performance Considerations

- The Scope Indicator (§1) reads data the page is **already fetching** for its own scoped query — resolving and displaying "which scope applies" requires no additional round-trip beyond what `applyDataScope()` already resolves to build the query itself (`DATA_SCOPE_ROLLOUT_DATABASE.md` §8).
- Dashboard/Reports BI's per-widget indicators (§6, §7) cost nothing extra beyond the widget's own already-scoped query — there is no separate "fetch the scope, then fetch the data" step to optimize, since scope resolution and data retrieval are the same operation (§12).
- No new list, page, or query is introduced anywhere in this document — every performance characteristic of the 8 resources' existing screens is unchanged, governed entirely by `DATA_SCOPE_ROLLOUT_DATABASE.md` §8, not by anything UI-specific here.

### 16.1 Pagination (Decision 49)

**No pagination exists anywhere in this codebase today** (`PRODUCTION_READINESS_SPEC.md` §10 — every list loads its full result set on every visit) — this subsection locks a principle for whenever pagination is eventually introduced to any of the 8 resources, it does not describe something built now, and building pagination itself remains out of this document's scope entirely.

- **Pagination must be calculated after Data Scope filtering, never before.** A page-count or "page N of M" control must be computed from the already-scoped result set — the same "filter during retrieval, never after" principle already locked for Data Scope generally (`DATA_SCOPE_ROLLOUT_DATABASE.md` §5, Decision 41) applies identically to whatever paginates that filtered result.
- **No page count or record total shown anywhere may reflect more than the viewer's own scope.** A "Trang 1/5" or "87 bản ghi" label must be computed from the scoped row count, never the resource's true unscoped total — showing a broader total than the scope would otherwise expose exactly the kind of hidden-count leak already ruled out in §1 and §11, just via a pagination control instead of a Scope Indicator.
- Search (§1.1) and pagination, once either exists, compose the same way Search and Filters already do — scope, then search, then pagination, each narrowing further, never widening back out.

---

## 17. Open Questions

1. **Activity Log's Manager=Team gap (§9):** no existing, reusable page lets a Manager browse their team's activity today — the only multi-staff Activity Log views (Permission Center's Audit History, Ops Console's Audit Overview) are gated more restrictively (`settings.manage`, effectively Owner-only) than Decision 39's "Team" setting for Manager would need. Building a new page to close this is out of scope for this UI-reuse-only rollout — flagged for a future decision, not resolved here.
2. **Reports BI's Staff Analysis dual-indicator (§7)** is one concrete design for showing a section that mixes a scoped and an unscoped data source in one place — is this the right treatment, or would the Product Owner prefer Staff Analysis be excluded from this rollout entirely until Commissions is addressed (mirroring how Dashboard's Commission widget is excluded outright, §6)?
3. **Should the Scope Indicator ever be clickable** (e.g., linking Owner/Manager directly to that role's Data Scope setting in Permission Center) as a convenience, or should it stay purely informational with no navigation, as designed here? Not decided in this document.
4. **Marketing's combined-overview screen** (if one exists showing Segments and Campaigns counts together) needing two indicators (§8) is described in principle — confirm no single Marketing page actually needs a third, blended indicator that this document hasn't anticipated.

---

UI Design only. No code written. No database changes. No business rule modified. No Permission Center changes. No existing module redesigned. Stopping — waiting for Product Owner Review.
