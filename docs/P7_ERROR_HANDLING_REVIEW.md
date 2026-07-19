# P7 — Error Handling Review

**Status:** Review complete. Six low-risk, high-confidence fixes applied (§3). Everything else is documented only, per this phase's "prefer documentation and targeted fixes over refactoring" instruction — the dominant pattern below (service-layer error swallowing) is repo-wide and fixing it everywhere would be a real refactor, not a targeted fix.

**Scope:** `lib/*.service.ts`, `lib/orders/**`, `lib/reports/**`, `lib/marketIntelligence/**`, `lib/knowledgeVault/**`, and every `app/api/**/route.ts`. Complements — does not duplicate — the earlier `docs/PRODUCTION_READINESS_REPORT.md`, which reviewed the UI/validation layer of Customers/Products/Batches/Settings only.

---

## 1. Dominant pattern: service-layer error swallowing

Nearly every read function across `lib/*.service.ts` follows the same shape:

```ts
const { data, error } = await supabase.from(table).select(...);
if (error) {
  console.error("...", error);
  return []; // or null, or an empty aggregate object
}
return data;
```

A real database outage, a network failure, or an RLS rejection (see `docs/P7_AUTHORIZATION_REVIEW.md` Finding 1 — this is exactly the failure mode that finding would produce if live) is therefore **indistinguishable from "there is genuinely no data yet"** everywhere this pattern appears. Confirmed present in: `lib/customer.service.ts` (`getCustomers`, `findCustomerByPhone`, `getCustomerStats`), `lib/product.service.ts` (`getProducts` and its filtered variants, `getMatchingProducts`, `getPurchaseHistorySummary`), `lib/productBatch.service.ts` (`getBatches`, `getBatchStats` — a failed purchases fetch silently reports ₫0 revenue rather than "unknown"), `lib/purchase.service.ts` (`getPurchaseSummaries`), `lib/reports/reports.service.ts`, `lib/report.service.ts`, `lib/batchReport.service.ts`, `lib/marketIntelligence/marketIntelligence.service.ts`, `lib/knowledgeVault/knowledgeVault.service.ts`, `lib/masterData.service.ts`, `lib/tagOptions.service.ts`, `lib/productImage.service.ts`.

**Why this is left as documentation, not a fix:** changing every one of these to propagate errors means changing every caller's contract (every page currently does `const data = await getX(); setState(data)` with no error branch) — a repo-wide, multi-file behavior change across every module, which is a refactor, not a targeted fix, and risks regressions in modules explicitly marked LOCKED. **Recommendation for a future, separately-scoped increment:** introduce a `Result<T>`-shaped return (`{ data, error }`) module by module, starting with the highest-traffic reads (Customers, Products), so callers can show "couldn't load data, try again" instead of a silent empty state — this is a real, worthwhile fix, just not a P7-sized one.

**Two cases were worse than the rest** — not even logged — and were fixed in this review (§3): `lib/productImage.service.ts`'s `setImageOrder` and `lib/masterData.service.ts`'s `moveMasterDataItem` both fired a `Promise.all` of writes and discarded every result, so a failed drag-reorder or failed up/down move was invisible even in server logs, let alone to the user.

## 2. Orders API routes

Every Orders POST/PUT/DELETE route already wraps its work in try/catch and funnels errors through the shared `handleOrderServiceError` (`app/api/orders/_errors.ts`), which maps the typed `OrderNotFoundError`/`OrderValidationError`/`OrderRuleViolationError`/`OrderRepositoryError` classes to the right HTTP status — the one consistently-typed error-handling path in the codebase, and a good pattern.

Three GET handlers (`app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`, `app/api/orders/[id]/history/route.ts`) had no try/catch at all — they didn't 500 today only because the service functions underneath swallow their own Supabase errors (§1), which meant a real DB outage on Order List/Detail would render as a misleading empty list or a false 404 rather than a proper error. **Fixed in this review** (§3) for consistency and to fail safely if the underlying swallow-to-null behavior is ever changed independently.

No other module has API routes today — Customers/Products/Batches/Settings write directly from client components (also noted in `docs/P7_AUDIT_LOGGING.md` §3), so this class of finding doesn't apply to them.

## 3. Fixes applied this review

| File | Fix |
|---|---|
| `app/batches/page.tsx` | `handleDeleteBatch` now checks `deleteBatch`'s returned error and alerts the user instead of silently reloading a stale list. |
| `app/settings/page.tsx` | `handleToggleActive`, `handleDelete`, `handleMove` now check their service calls' returned errors and alert the user, instead of always reloading regardless of outcome. |
| `lib/masterData.service.ts` | `moveMasterDataItem` now returns the error (previously discarded the `Promise.all` results entirely) — enables the `app/settings/page.tsx` fix above. |
| `lib/productImage.service.ts` | `setImageOrder` now returns the error (previously discarded the `Promise.all` results entirely) — enables the fix below. |
| `components/product/ProductImageManager.tsx` | `handleDelete` and `commitReorder` now check their service calls' returned errors and alert the user on failure. |
| `app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`, `app/api/orders/[id]/history/route.ts` | Added try/catch around the three previously-unguarded GET handlers, routed through the existing `handleOrderServiceError`, for consistency with every other Orders route. |

All six are minimal, behavior-additive (they only change what happens on a failure path that previously had no user-facing signal at all) — no success-path behavior changed.

## 4. Summary

| Finding | Severity | Status |
|---|---|---|
| Repo-wide service-layer error swallowing (reads return `[]`/`null` on failure) | Medium | Documented; recommended as a separate future increment, module by module |
| Two fully-silent (not even logged) discarded `Promise.all` write paths | Medium | **Fixed** |
| Three unguarded Orders GET routes | Low | **Fixed** |
| Batches/Settings/Product Images UI not surfacing known write failures | Low–Medium | **Fixed** (the three call sites named in the pre-existing `docs/PRODUCTION_READINESS_REPORT.md`, plus Product Images which that report also flagged) |
