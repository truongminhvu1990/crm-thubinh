import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { SalesLedgerFilters, SalesLedgerRow, SalesLedgerPage, SALES_LEDGER_PAGE_SIZE } from "@/types/salesLedger";
import { Staff } from "@/types/staff";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScopeWithFallback } from "@/lib/permission/dataScope";

// Raw data access only, against the read-only `sales_ledger` view (see the
// migration file for its exact join). No filter here ever recomputes
// sale_amount/commission_amount/commission_percent - every WHERE clause
// below only narrows which existing rows are returned.

/** Applies every Sales Ledger filter to a `sales_ledger` query. Shared,
 * unexported, and called twice (once for the paginated page, once for the
 * unpaginated summary aggregate) so the two can never drift apart and
 * silently disagree on which rows are "currently filtered."
 * Loosely typed - PostgrestFilterBuilder's generics don't thread cleanly
 * through a shared helper called with two different `.select()` shapes,
 * and this codebase already accepts that tradeoff elsewhere (see the
 * `as unknown as X` casts throughout lib/*.service.ts).
 *
 * Returns `Promise<{ query }>`, not `Promise<Q>` - `query` here is a
 * Supabase PostgrestFilterBuilder, which is itself thenable. An async
 * function that `return`s a thenable doesn't wrap it as the resolved
 * value; JS adopts the thenable's own resolution instead, firing the query
 * early and collapsing the awaited result to `{data, error, count}` rather
 * than the builder - exactly the trap lib/permission/dataScope.ts's
 * apply*Scope functions document (and wrap around) for the same reason,
 * and exactly the pattern lib/monthlySoldProducts/monthlySoldProducts.
 * repository.ts's own applyFilters already follows. This function used to
 * `return query;` directly, which is what caused `query.order is not a
 * function` in getSalesLedgerPage below - a plain object is never mistaken
 * for a thenable, so callers must unwrap `.query`.
 *
 * `staff` (Hotfix 3A): sentinel-typed `Staff | null | undefined`, not just
 * `Staff | null` - `undefined` (the default, every pre-Hotfix-3A caller)
 * means "resolve it yourself via getCurrentStaff() exactly as before" (the
 * Browser Authentication Context, correct for callers that actually run in
 * the browser - Data Verification's page, Export Excel). An explicit
 * `Staff | null` means "use this value, I already resolved it" - what
 * app/api/sales-ledger/** now passes, using getCurrentStaffFromRequest()
 * (Server Authentication Context, lib/permission/serverAuth.ts - the same
 * mechanism Orders/Permission Center already use) instead of the browser
 * client's session-less auth.getUser() call. Nothing about the Data Scope
 * call itself (applyDataScopeWithFallback, "revenue" resource, uuid+text
 * fallback fields) changed - only how "current staff" is identified. */
async function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: SalesLedgerFilters,
  staff?: Staff | null,
  client?: SupabaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ query: any }> {
  if (filters.dateFrom) query = query.gte("sale_date", filters.dateFrom);
  if (filters.dateTo) query = query.lt("sale_date", filters.dateTo);

  if (filters.search) {
    const term = filters.search.replace(/[%,]/g, "");
    query = query.or(
      `customer_name.ilike.%${term}%,product_code.ilike.%${term}%,product_name.ilike.%${term}%`
    );
  }

  if (filters.customer) {
    const term = filters.customer.replace(/[%,]/g, "");
    query = query.or(`customer_name.ilike.%${term}%,customer_code.ilike.%${term}%`);
  }

  if (filters.salespersonId) {
    // Mirrors staff.service.ts's matchesStaff() semantics (salesperson_id
    // when present, else the legacy text name) - translated into a filter
    // rather than re-implemented, since matchesStaff itself is a row-level
    // predicate that can't be handed to PostgREST directly.
    query = query.eq("salesperson_id", filters.salespersonId);
  }

  if (filters.productCode) {
    query = query.ilike("product_code", `%${filters.productCode.replace(/[%,]/g, "")}%`);
  }
  if (filters.productName) {
    query = query.ilike("product_name", `%${filters.productName.replace(/[%,]/g, "")}%`);
  }
  if (filters.productCategory) {
    query = query.eq("product_category", filters.productCategory);
  }

  if (filters.minAmount !== undefined) query = query.gte("sale_amount", filters.minAmount);
  if (filters.maxAmount !== undefined) query = query.lte("sale_amount", filters.maxAmount);

  if (filters.commissionStatus) query = query.eq("commission_status", filters.commissionStatus);

  // Sprint v2.3.0 (Data Verification Center), Feature 7 - only ever set by
  // Verification Mode's own filter panel; every branch below is a no-op
  // for Normal Mode's existing filter object.
  //
  // entry_source/created_by/updated_by are NOT applied here: they only
  // exist on customer_purchases (and therefore on this view) once
  // 20260725_data_verification_module.sql has run, which Production's
  // actual schema confirms it has not. Sending .eq()/.ilike() against a
  // column the view doesn't have fails the whole query at the Postgrest
  // layer (42703), which the caller below turns into an empty page - i.e.
  // silently worse than just not filtering. Until that migration (or an
  // equivalent one) actually lands on Production, these three fields are
  // accepted but intentionally ignored; `duplicateOnly` is unaffected
  // since `is_duplicate` is computed by the view from columns that do
  // exist (customer_id/product_id/sale_date/sale_price) on every schema.
  if (filters.duplicateOnly) query = query.eq("is_duplicate", true);

  // Data Scope Rollout (Sprint v4.1), Package 4 - applied last, after every
  // existing UI filter above, so Search/Filters (Decision 48) can only ever
  // narrow further within the already-scoped set, never widen past it.
  // Same ownership resolution as Customer Purchases (Package 3): the view
  // passes both `salesperson_id`/`salesperson` straight through unchanged
  // (DATA_SCOPE_ROLLOUT_DATABASE.md §1), so it uses the identical
  // uuid-with-text-fallback resolution, not a separate one.
  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;
  if (resolvedStaff) {
    query = (await applyDataScopeWithFallback(query, resolvedStaff, "revenue", "salesperson_id", "salesperson", client)).query;
  }

  return { query };
}

/** `client` defaults to the browser Supabase client so every existing
 * caller (Data Verification's page, export) keeps its exact current
 * behavior unchanged. Backend API Foundation (Package 4C, Wave 3) passes a
 * server client instead, from app/api/sales-ledger/**. `staff` (Hotfix 3A)
 * - see applyFilters' doc comment for the sentinel semantics. */
export async function getSalesLedgerPage(
  filters: SalesLedgerFilters,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<SalesLedgerPage> {
  let query = client.from("sales_ledger").select("*", { count: "exact" });
  query = (await applyFilters(query, filters, staff, client)).query;
  query = query.order(filters.sortField, { ascending: filters.sortDirection === "asc" });

  const from = (filters.page - 1) * SALES_LEDGER_PAGE_SIZE;
  const to = from + SALES_LEDGER_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching sales ledger page:", error);
    return { rows: [], totalCount: 0 };
  }

  return { rows: (data as SalesLedgerRow[]) || [], totalCount: count ?? 0 };
}

/** Every filtered row's sale_amount/commission_amount, unpaginated - backs
 * the Summary cards (Feature 3), which must reflect the whole filtered set,
 * not just the current page of 50. Selecting only these two columns keeps
 * it cheap even when the filtered set is large. */
export async function getSalesLedgerAggregateRows(
  filters: SalesLedgerFilters,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<{ sale_amount: number; commission_amount: number | null; is_revenue_recognized: boolean }[]> {
  let query = client.from("sales_ledger").select("sale_amount, commission_amount, is_revenue_recognized");
  query = (await applyFilters(query, filters, staff, client)).query;

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching sales ledger summary rows:", error);
    return [];
  }
  return data as { sale_amount: number; commission_amount: number | null; is_revenue_recognized: boolean }[];
}

/** Data Scope Rollout (Sprint v4.1), Package 4 - scoped the same way as the
 * list (above), so a direct-link to an out-of-scope row resolves to the
 * same "no row" outcome as a nonexistent purchase id (DATA_SCOPE_ROLLOUT_
 * UI.md §5 - "not found," never "forbidden"). */
export async function getSalesLedgerRowByPurchaseId(
  purchaseId: string,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<SalesLedgerRow | null> {
  let query = client.from("sales_ledger").select("*").eq("purchase_id", purchaseId);

  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;
  if (resolvedStaff) {
    query = (await applyDataScopeWithFallback(query, resolvedStaff, "revenue", "salesperson_id", "salesperson", client)).query;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Error fetching sales ledger row:", error);
    return null;
  }
  return data as SalesLedgerRow | null;
}

/** Batched primary-image lookup for a page of rows - reads product_images
 * directly rather than importing lib/productImage.service.ts's write-path
 * module, keeping this a pure read with no coupling to Products' CRUD.
 * Picks the lowest sort_order per product, same tie-break as
 * coverImageUrl() in that module. */
export async function getPrimaryImagesByProductIds(
  productIds: string[],
  client: SupabaseClient = supabase
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await client
    .from("product_images")
    .select("product_id, image_url, sort_order")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching product images for sales ledger:", error);
    return new Map();
  }

  const byProduct = new Map<string, string>();
  for (const row of data as { product_id: string; image_url: string; sort_order: number }[]) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, row.image_url);
  }
  return byProduct;
}

/** Batched cost_price lookup, keyed by product_id - Task 3 (Column
 * Visibility), Cost/Profit export. Mirrors the same "select id, cost_price
 * .in(productIds)" pattern lib/monthlySoldProducts/monthlySoldProducts.
 * repository.ts already uses for its own Gross Profit column, so Reporting
 * doesn't grow a second way of reading Product's cost basis. Owner/Manager
 * gating happens at the call site (useIsOwnerOrManager), same as the
 * on-screen Cost/Profit columns already do - this function itself has no
 * permission check of its own, exactly like getPrimaryImagesByProductIds
 * above. */
export async function getCostPricesByProductIds(
  productIds: string[],
  client: SupabaseClient = supabase
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await client.from("products").select("id, cost_price").in("id", productIds);

  if (error) {
    console.error("Error fetching product cost prices for sales ledger export:", error);
    return new Map();
  }

  const map = new Map<string, number>();
  for (const p of data as { id: string; cost_price: number | null }[]) {
    if (typeof p.cost_price === "number") map.set(p.id, p.cost_price);
  }
  return map;
}

export async function getProductImagesForProduct(
  productId: string,
  client: SupabaseClient = supabase
): Promise<{ id: string; image_url: string; sort_order: number }[]> {
  const { data, error } = await client
    .from("product_images")
    .select("id, image_url, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching product images:", error);
    return [];
  }
  return data as { id: string; image_url: string; sort_order: number }[];
}
