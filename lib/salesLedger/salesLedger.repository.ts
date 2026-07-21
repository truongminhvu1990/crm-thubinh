import { supabase } from "@/lib/supabase";
import { SalesLedgerFilters, SalesLedgerRow, SalesLedgerPage, SALES_LEDGER_PAGE_SIZE } from "@/types/salesLedger";
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
 * `as unknown as X` casts throughout lib/*.service.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyFilters(query: any, filters: SalesLedgerFilters) {
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
  if (filters.entrySource) query = query.eq("entry_source", filters.entrySource);
  if (filters.createdBy) query = query.ilike("created_by", `%${filters.createdBy.replace(/[%,]/g, "")}%`);
  if (filters.updatedBy) query = query.ilike("updated_by", `%${filters.updatedBy.replace(/[%,]/g, "")}%`);
  if (filters.duplicateOnly) query = query.eq("is_duplicate", true);

  // Data Scope Rollout (Sprint v4.1), Package 4 - applied last, after every
  // existing UI filter above, so Search/Filters (Decision 48) can only ever
  // narrow further within the already-scoped set, never widen past it.
  // Same ownership resolution as Customer Purchases (Package 3): the view
  // passes both `salesperson_id`/`salesperson` straight through unchanged
  // (DATA_SCOPE_ROLLOUT_DATABASE.md §1), so it uses the identical
  // uuid-with-text-fallback resolution, not a separate one.
  const staff = await getCurrentStaff();
  if (staff) query = (await applyDataScopeWithFallback(query, staff, "revenue", "salesperson_id", "salesperson")).query;

  return query;
}

export async function getSalesLedgerPage(filters: SalesLedgerFilters): Promise<SalesLedgerPage> {
  let query = supabase.from("sales_ledger").select("*", { count: "exact" });
  query = await applyFilters(query, filters);
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
  filters: SalesLedgerFilters
): Promise<{ sale_amount: number; commission_amount: number | null }[]> {
  let query = supabase.from("sales_ledger").select("sale_amount, commission_amount");
  query = await applyFilters(query, filters);

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching sales ledger summary rows:", error);
    return [];
  }
  return data as { sale_amount: number; commission_amount: number | null }[];
}

/** Data Scope Rollout (Sprint v4.1), Package 4 - scoped the same way as the
 * list (above), so a direct-link to an out-of-scope row resolves to the
 * same "no row" outcome as a nonexistent purchase id (DATA_SCOPE_ROLLOUT_
 * UI.md §5 - "not found," never "forbidden"). */
export async function getSalesLedgerRowByPurchaseId(purchaseId: string): Promise<SalesLedgerRow | null> {
  let query = supabase.from("sales_ledger").select("*").eq("purchase_id", purchaseId);

  const staff = await getCurrentStaff();
  if (staff) query = (await applyDataScopeWithFallback(query, staff, "revenue", "salesperson_id", "salesperson")).query;

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
export async function getPrimaryImagesByProductIds(productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await supabase
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

export async function getProductImagesForProduct(
  productId: string
): Promise<{ id: string; image_url: string; sort_order: number }[]> {
  const { data, error } = await supabase
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
