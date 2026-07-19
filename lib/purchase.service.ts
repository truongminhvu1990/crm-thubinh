import { supabase } from "./supabase";
import { CustomerPurchase, CustomerPurchaseSummary } from "@/types/purchase";

const WRITABLE_FIELDS: (keyof CustomerPurchase)[] = [
  "customer_id",
  "product_id",
  "sale_price",
  "sale_date",
  "note",
];

function pickWritableFields(purchase: Partial<CustomerPurchase>): Partial<CustomerPurchase> {
  const filteredData: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((field) => {
    const value = purchase[field];
    if (value === undefined) return;
    filteredData[field] = value;
  });
  return filteredData as Partial<CustomerPurchase>;
}

const WITH_PRODUCT = "*, product:products(id, product_name, product_code)";
const WITH_CUSTOMER = "*, customer:customers(id, full_name, customer_code)";

export async function getPurchasesByCustomer(customerId: string): Promise<CustomerPurchase[]> {
  const { data, error } = await supabase
    .from("customer_purchases")
    .select(WITH_PRODUCT)
    .eq("customer_id", customerId)
    .order("sale_date", { ascending: false });

  if (error) {
    console.error("Error fetching customer purchases:", error);
    return [];
  }

  return data as unknown as CustomerPurchase[];
}

/** The purchase record backing a sold product's "Customer / Sale Price / Sale
 * Date" display on the Product Detail page. A product can only be sold once
 * in this model, so the latest matching purchase is the sale. */
export async function getPurchaseForProduct(productId: string): Promise<CustomerPurchase | null> {
  const { data, error } = await supabase
    .from("customer_purchases")
    .select(WITH_CUSTOMER)
    .eq("product_id", productId)
    .order("sale_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching purchase for product:", error);
    return null;
  }

  return data as unknown as CustomerPurchase | null;
}

// Adding/editing/deleting a purchase is also what drives requirement #2
// (product status). The customer<->product relationship is never stored on
// `products` itself - it's only ever derived by looking up customer_purchases
// by product_id (see getPurchaseForProduct), so products stays independent
// of customers in the schema.
async function markProductSold(productId: string) {
  const { error } = await supabase.from("products").update({ status: "Sold" }).eq("id", productId);
  if (error) console.error("Error marking product as sold:", error);
}

async function revertProduct(productId: string) {
  const { error } = await supabase.from("products").update({ status: "Active" }).eq("id", productId);
  if (error) console.error("Error reverting product after purchase change:", error);
}

// Source/salesperson are never typed in on the purchase form (requirement:
// "without requiring the user to enter them again") - they're always copied
// from whichever product the purchase points to, at save time.
async function getProductSourceSnapshot(
  productId: string
): Promise<{ source: string | null; salesperson: string | null }> {
  const { data, error } = await supabase
    .from("products")
    .select("source, salesperson")
    .eq("id", productId)
    .single();

  if (error || !data) {
    if (error) console.error("Error reading product source/salesperson:", error);
    return { source: null, salesperson: null };
  }

  return { source: data.source ?? null, salesperson: data.salesperson ?? null };
}

export async function addPurchase(purchase: Partial<CustomerPurchase>) {
  const filteredData = pickWritableFields(purchase);

  if (purchase.product_id) {
    Object.assign(filteredData, await getProductSourceSnapshot(purchase.product_id));
  }

  const { data, error } = await supabase
    .from("customer_purchases")
    .insert(filteredData)
    .select(WITH_PRODUCT)
    .single();

  if (error) {
    console.error("Error adding purchase:", error);
    return { data: null, error };
  }

  if (purchase.product_id) {
    await markProductSold(purchase.product_id);
  }

  return { data: data as unknown as CustomerPurchase, error: null };
}

export async function updatePurchase(
  id: string,
  purchase: Partial<CustomerPurchase>,
  previous: CustomerPurchase
) {
  const filteredData = pickWritableFields(purchase);

  const newProductId = purchase.product_id !== undefined ? purchase.product_id : previous.product_id;
  if (newProductId && newProductId !== previous.product_id) {
    Object.assign(filteredData, await getProductSourceSnapshot(newProductId));
  }

  const { data, error } = await supabase
    .from("customer_purchases")
    .update(filteredData)
    .eq("id", id)
    .select(WITH_PRODUCT)
    .single();

  if (error) {
    console.error("Error updating purchase:", error);
    return { data: null, error };
  }

  if (newProductId !== previous.product_id) {
    if (previous.product_id) await revertProduct(previous.product_id);
    if (newProductId) await markProductSold(newProductId);
  }

  return { data: data as unknown as CustomerPurchase, error: null };
}

export async function deletePurchase(id: string, productId?: string | null) {
  const { error } = await supabase.from("customer_purchases").delete().eq("id", id);

  if (error) {
    console.error("Error deleting purchase:", error);
    return error;
  }

  if (productId) await revertProduct(productId);
  return null;
}

/**
 * One query for every customer's purchase aggregates (count, total revenue,
 * last purchase date), computed client-side from customer_purchases - no
 * per-customer round trip, and nothing here is stored/duplicated back onto
 * the customers table.
 */
export async function getPurchaseSummaries(): Promise<Map<string, CustomerPurchaseSummary>> {
  const { data, error } = await supabase
    .from("customer_purchases")
    .select("customer_id, sale_price, sale_date");

  const summaries = new Map<string, CustomerPurchaseSummary>();
  if (error || !data) {
    if (error) console.error("Error fetching purchase summaries:", error);
    return summaries;
  }

  for (const row of data as Pick<CustomerPurchase, "customer_id" | "sale_price" | "sale_date">[]) {
    const existing = summaries.get(row.customer_id) || {
      count: 0,
      totalRevenue: 0,
      lastPurchaseDate: null as string | null,
    };
    existing.count += 1;
    existing.totalRevenue += Number(row.sale_price) || 0;
    if (!existing.lastPurchaseDate || row.sale_date > existing.lastPurchaseDate) {
      existing.lastPurchaseDate = row.sale_date;
    }
    summaries.set(row.customer_id, existing);
  }

  return summaries;
}
