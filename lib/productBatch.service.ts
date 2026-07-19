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

export interface BatchStats {
  total: number;
  sold: number;
  returned: number;
  remaining: number;
  revenue: number;
}

/**
 * Total/Sold/Returned/Remaining come from products.status - each product
 * row is one physical item, never a stock quantity (see product.service.ts).
 * Revenue is a live join against customer_purchases (the same table Reports
 * uses), not a stored snapshot, so this never touches the customer_purchases
 * schema or purchase.service.ts.
 */
export async function getBatchStats(batchId: string): Promise<BatchStats> {
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("status")
    .eq("batch_id", batchId);

  if (productsError || !products) {
    if (productsError) console.error("Error fetching batch products:", productsError);
    return { total: 0, sold: 0, returned: 0, remaining: 0, revenue: 0 };
  }

  const rows = products as Pick<Product, "status">[];
  const total = rows.length;
  const sold = rows.filter((p) => p.status === "Sold").length;
  const returned = rows.filter((p) => p.status === "Returned").length;
  const remaining = total - sold - returned;

  const { data: purchases, error: purchasesError } = await supabase
    .from("customer_purchases")
    .select("sale_price, product:products!inner(batch_id)")
    .eq("product.batch_id", batchId);

  if (purchasesError) {
    console.error("Error fetching batch revenue:", purchasesError);
  }

  const revenue = (purchases || []).reduce(
    (sum, row) => sum + (Number((row as { sale_price: number }).sale_price) || 0),
    0
  );

  return { total, sold, returned, remaining, revenue };
}
