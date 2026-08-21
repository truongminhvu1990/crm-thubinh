import { supabase } from "./supabase";
import { ProductBatch } from "@/types/productBatch";
import { Product } from "@/types/product";

const WRITABLE_FIELDS: (keyof ProductBatch)[] = [
  "batch_code",
  "supplier",
  "received_date",
  "return_due_date",
  "other_cost",
  "status",
  "notes",
];

function pickWritableFields(
  batch: Partial<ProductBatch>,
  { skipEmpty = false }: { skipEmpty?: boolean } = {}
): Partial<ProductBatch> {
  const filteredData: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((field) => {
    const value = batch[field];
    if (value === undefined) return;
    if (skipEmpty && value === "") return;
    filteredData[field] = value;
  });
  return filteredData as Partial<ProductBatch>;
}

export async function getBatches(): Promise<ProductBatch[]> {
  const { data, error } = await supabase
    .from("product_batches")
    .select("*")
    .order("received_date", { ascending: false });

  if (error) {
    console.error("Error fetching product batches:", error);
    return [];
  }

  return data as ProductBatch[];
}

export async function getBatchById(id: string): Promise<ProductBatch | null> {
  const { data, error } = await supabase
    .from("product_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching product batch:", error);
    return null;
  }

  return data as ProductBatch;
}

export async function addBatch(batch: Partial<ProductBatch>) {
  const filteredData = pickWritableFields(batch, { skipEmpty: true });

  const { data, error } = await supabase
    .from("product_batches")
    .insert(filteredData)
    .select()
    .single();

  if (error) {
    console.error("Error adding product batch:", error);
    return { data: null, error };
  }

  return { data: data as ProductBatch, error: null };
}

export async function updateBatch(id: string, batch: Partial<ProductBatch>) {
  const filteredData = pickWritableFields(batch);

  const { data, error } = await supabase
    .from("product_batches")
    .update(filteredData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating product batch:", error);
    return { data: null, error };
  }

  return { data: data as ProductBatch, error: null };
}

export async function deleteBatch(id: string) {
  const { error } = await supabase.from("product_batches").delete().eq("id", id);

  if (error) {
    console.error("Error deleting product batch:", error);
  }

  return error;
}

/** Suggests the next sequential code (HX1, HX2, ...) from existing codes
 * matching that pattern - always editable by the user, never enforced. */
export async function getNextBatchCode(): Promise<string> {
  const { data, error } = await supabase.from("product_batches").select("batch_code");

  if (error || !data) {
    if (error) console.error("Error computing next batch code:", error);
    return "HX1";
  }

  const maxN = (data as { batch_code: string }[]).reduce((max, row) => {
    const match = row.batch_code?.match(/^HX(\d+)$/i);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);

  return `HX${maxN + 1}`;
}

export async function getProductsByBatch(batchId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching batch products:", error);
    return [];
  }

  return data as Product[];
}

export interface BatchCounts {
  total: number;
  sold: number;
  returned: number;
  remaining: number;
  /** Lot Product-Level Status, D6 (LOCKED): Reserved is a SUB-COUNT of
   * `remaining`, not a sibling bucket - total still equals sold + returned +
   * remaining, remaining still includes every Reserved product. This field
   * exists only so the UI can show "Đang giữ đơn" as its own filter/count
   * without double-counting anything. */
  reserved: number;
}

export interface BatchStats extends BatchCounts {
  revenue: number;
}

/**
 * Lot List Overview KPI (Product Owner Authorization, 2026-08-20, Section 2,
 * LOCKED): the ONE place Total/Sold/Returned/Remaining/Reserved are
 * computed from a batch's products rows - reused by both
 * getBatchStats (single Lot, Lot Detail) and getBatchListStats (every Lot
 * at once, Lot List) so the two screens can never disagree about the
 * formula. Pure function, no I/O - each product row is one physical item,
 * never a stock quantity (see product.service.ts).
 *
 * BR-003 (LOCKED, 2026-08-21): "Returned" is retired as a status value -
 * a returned product's status now reads "Archived", the same value any
 * other archival reason would use. The Returned KPI bucket is therefore
 * derived from returned_at IS NOT NULL, never from the status string -
 * an Archived product with no returned_at is NOT counted as Returned.
 * Safe against double-counting with `sold` by construction: no write path
 * ever sets returned_at while status is still "Sold" (returnProductToSupplier
 * only fires from Available/Paused; the D12 RPC's Returned disposition
 * moves status off "Sold" to "Archived" in the same statement that sets
 * returned_at) - so `sold` and this returned-derived bucket stay disjoint,
 * and `remaining = total - sold - returned` still holds.
 */
export function computeBatchCounts(rows: Pick<Product, "status" | "returned_at">[]): BatchCounts {
  const total = rows.length;
  const sold = rows.filter((p) => p.status === "Sold").length;
  const returned = rows.filter((p) => !!p.returned_at).length;
  const remaining = total - sold - returned;
  const reserved = rows.filter((p) => p.status === "Reserved").length;
  return { total, sold, returned, remaining, reserved };
}

interface BatchRevenuePurchaseRow {
  sale_price: number;
  order_item_id: string | null;
  order_items: { orders: { order_status: string; payment_status: string } | null } | null;
}

/**
 * Lot Revenue Filtering (Product Owner Authorization, 2026-08-20) — BR-001
 * Revenue Recognition (docs/ORDERS_SPEC.md "Business Rule Lock", LOCKED):
 * revenue counts only when Order Status = Completed AND Payment Status =
 * Paid. A row with no linked Order (order_item_id NULL - predates the
 * Orders module, or entered manually) has no Order to check and counts as
 * recognized, same as it always has.
 *
 * A local copy of the exact same logic already living in lib/purchase.
 * service.ts and lib/reports/reports.service.ts (that second one's own
 * comment: "REPORTS_SPEC.md Decision 5, LOCKED - no shared business logic
 * with lib/orders/*") - this is the established pattern in this codebase
 * (each module keeps its own copy rather than importing across module
 * boundaries), not a new one. Product disposition (Remaining/Returned,
 * D12) is deliberately never read here - only Order.status decides
 * revenue inclusion, disposition never does (Product Owner Authorization,
 * Section 5, LOCKED).
 */
function isRevenueRecognized(row: BatchRevenuePurchaseRow): boolean {
  if (!row.order_item_id) return true;
  const order = row.order_items?.orders;
  return order?.order_status === "Completed" && order?.payment_status === "Paid";
}

/**
 * Total/Sold/Returned/Remaining come from products.status - each product
 * row is one physical item, never a stock quantity (see product.service.ts).
 * Revenue is a live join against customer_purchases (the same table Reports
 * uses), not a stored snapshot, so this never touches the customer_purchases
 * schema or purchase.service.ts. Filtered through isRevenueRecognized
 * (BR-001) so a Cancelled Order's revenue is excluded - see that
 * function's own doc comment.
 */
export async function getBatchStats(batchId: string): Promise<BatchStats> {
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("status, returned_at")
    .eq("batch_id", batchId);

  if (productsError || !products) {
    if (productsError) console.error("Error fetching batch products:", productsError);
    return { total: 0, sold: 0, returned: 0, remaining: 0, reserved: 0, revenue: 0 };
  }

  const rows = products as Pick<Product, "status" | "returned_at">[];
  const counts = computeBatchCounts(rows);

  const { data: purchases, error: purchasesError } = await supabase
    .from("customer_purchases")
    .select("sale_price, order_item_id, order_items(orders(order_status, payment_status)), product:products!inner(batch_id)")
    .eq("product.batch_id", batchId);

  if (purchasesError) {
    console.error("Error fetching batch revenue:", purchasesError);
  }

  const revenue = ((purchases || []) as unknown as BatchRevenuePurchaseRow[])
    .filter(isRevenueRecognized)
    .reduce((sum, row) => sum + (Number(row.sale_price) || 0), 0);

  return { ...counts, revenue };
}

/**
 * Lot List Overview KPI (Product Owner Authorization, 2026-08-20, LOCKED).
 * Exactly 2 queries total regardless of how many Lots exist (no N+1):
 * batches themselves are already fetched separately by getBatches() (the
 * List page's existing call), so this only needs one products query, then
 * groups rows by batch_id in memory and runs each group through the same
 * computeBatchCounts() getBatchStats uses - guarantees List and Detail can
 * never disagree about the formula (Section 2, LOCKED).
 */
export async function getBatchListStats(): Promise<Map<string, BatchCounts>> {
  const { data: products, error } = await supabase
    .from("products")
    .select("batch_id, status, returned_at")
    .not("batch_id", "is", null);

  if (error) {
    console.error("Error fetching products for Lot List KPI:", error);
    return new Map();
  }

  const rowsByBatchId = new Map<string, Pick<Product, "status" | "returned_at">[]>();
  for (const row of (products || []) as { batch_id: string; status: string | null; returned_at: string | null }[]) {
    const existing = rowsByBatchId.get(row.batch_id);
    if (existing) {
      existing.push({ status: row.status ?? undefined, returned_at: row.returned_at ?? undefined });
    } else {
      rowsByBatchId.set(row.batch_id, [{ status: row.status ?? undefined, returned_at: row.returned_at ?? undefined }]);
    }
  }

  const statsByBatchId = new Map<string, BatchCounts>();
  for (const [batchId, rows] of rowsByBatchId) {
    statsByBatchId.set(batchId, computeBatchCounts(rows));
  }
  return statsByBatchId;
}
