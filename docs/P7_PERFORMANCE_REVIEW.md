# P7 — Performance Review

**Status:** Review complete, documentation only — no query, pagination, or aggregation behavior was changed. The one exception is a set of index additions, drafted as a migration but **not applied** (§4), consistent with this phase's DB-change approval gate.

**Scope:** read/write query patterns across every `lib/*.service.ts` file and the pages that call them, cross-checked against `docs/CRM_DATABASE_SPECIFICATION.md`'s documented indexes.

---

## 1. No pagination anywhere

There is no `.range()` call anywhere in `lib/`. Every List page (Customers, Products, Batches, Orders, Inventory) loads its entire underlying table on every visit. `.limit()` only appears for single-row dedupe lookups (`limit(1)`) and one 50-row cap inside `getMatchingProducts` (`lib/product.service.ts:143`). `getOrderList`/`findAllOrders` (`lib/orders/order.repository.ts:43-56`) has no limit either.

**Impact today:** likely negligible — this is a single jade/jewelry business's customer and product catalog, not a high-volume e-commerce table, so current row counts are almost certainly in the hundreds to low thousands, not millions. **Impact as the business grows:** every list page's load time and payload size scales linearly with total row count forever, with no ceiling. Not fixed here — adding real pagination changes each List page's data-fetching *and* its UI (page controls, "load more," or infinite scroll), which is explicitly out of scope for this phase ("no UI redesign"). Flagged as the single highest-value follow-up once table sizes justify it.

## 2. Client-side aggregation instead of Postgres aggregation

`lib/reports/reports.service.ts`, `lib/report.service.ts`, `lib/batchReport.service.ts`, `lib/marketIntelligence/marketIntelligence.service.ts`, and `lib/inventory.service.ts` all fetch full, unfiltered row sets and then group/sum them in JavaScript (`Map`-based accumulation — `groupCount`, `sourceMap`/`salespersonMap`/`customerMap`/`monthMap`, `computeInventoryStats`), rather than using Postgres `GROUP BY`/aggregate functions. This means every Reports/Market Intelligence/Inventory-stats page load transfers every row over the wire just to compute a handful of summary numbers.

**Query count per page load (representative, not exhaustive):** Reports page ≈ 5 total queries (customer/product/purchase reports plus a `Promise.all` pair for batch stats + revenue-by-batch); Market Intelligence ≈ 1 query; Batch Report ≈ 3 parallel queries.

**Not fixed here:** rewriting these as server-side/Postgres aggregation would touch the query shape of five already-LOCKED modules (Reports, Market Intelligence, Inventory) for a performance gain that, again, only matters once row counts grow — "prefer documentation... minimize code changes... keep architecture unchanged" points against doing this preemptively. Recommended as a future increment once real usage data shows this is worth the risk.

## 3. One genuine N+1 pattern found

`lib/orders/order.service.ts:169-192` (`getCustomerOrderHistory`) fetches **all** orders, filters down to one customer's orders in JS, then loops and calls `findOrderItemsByOrderId` once per matching order — one extra round trip per order, every time a Customer Detail page loads its purchase history. This is the one finding in this review with a plausible narrow, low-risk fix (batch-fetch all items for the filtered order IDs in a single `IN (...)` query instead of looping) — **not implemented in this review** because Orders is a LOCKED module and this phase's instruction is to prefer documentation over refactoring even for well-understood fixes; flagged as the top candidate for the next Orders-touching increment.

## 4. Missing indexes for frequently-filtered columns

Cross-checked `docs/CRM_DATABASE_SPECIFICATION.md` against the actual filter/sort/`.eq()`/`.gte()` calls in the service layer:

| Table | Indexed today | Filtered/sorted on, but not indexed |
|---|---|---|
| `customer_purchases` | `customer_id` only | `sale_date` (range filters + `.order()` in `purchase.service.ts`, `reports.service.ts`, `batchReport.service.ts`); `product_id` (`.eq()` in `getPurchaseForProduct`) |
| `products` | `product_code`, `sku` | `status`, `category` (`.eq()`/`.or()` filters throughout `product.service.ts`, `reports.service.ts`, `batchReport.service.ts`) |
| `customers` | `phone`, `customer_code` | `vip_level`, `assigned_salesperson` (`getCustomers(vipLevel)` and Reports groupings) |

Drafted (**not applied**) as `supabase/migrations/20260718_performance_indexes.sql` — purely additive `CREATE INDEX IF NOT EXISTS` statements, no table/column/data change, safe to apply independently of the RLS and audit-log migrations. Per the DB-change approval gate, awaiting Product Owner sign-off before being run.

## 5. Summary

| Finding | Severity | Status |
|---|---|---|
| No pagination on any List page | Low today, grows over time | Documented; flagged for a future, UI-touching increment |
| Client-side (not Postgres) aggregation in Reports/Market Intelligence/Inventory | Low today, grows over time | Documented; flagged for a future increment |
| N+1 in `getCustomerOrderHistory` (Orders) | Low (Customer Detail purchase history only) | Documented; flagged as top candidate for next Orders increment |
| Missing indexes on `sale_date`, `product_id`, `status`, `category`, `vip_level`, `assigned_salesperson` | Low today, grows over time | Migration **drafted, not applied** — `supabase/migrations/20260718_performance_indexes.sql` |
