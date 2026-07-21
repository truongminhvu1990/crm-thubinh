import { supabase } from "./supabase";
import { CustomerPurchase, CustomerPurchaseSummary } from "@/types/purchase";
import { createSnapshotForPurchase } from "@/lib/commission/commission.service";
import { getStaffByName } from "@/lib/staff.service";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScopeWithFallback } from "@/lib/permission/dataScope";

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

/** Data Scope Rollout (Sprint v4.1), Package 3 - `customer_purchases`'
 * ownership prefers `salesperson_id` (uuid) when populated, falling back
 * to `salesperson` (text, case-insensitive/trimmed) for historical rows
 * predating the Staff Management module (DATA_SCOPE_ROLLOUT_DATABASE.md
 * §2 rule 2). Note this scopes the *purchase* rows independently of
 * whether the *customer* itself is in scope - Customer Detail already
 * gated access to `customerId` via Customers' own scope (Package 1); this
 * is Customer Purchases' own, separately-resolved scope on top of that
 * (DATA_SCOPE_ROLLOUT_UI.md §4), so a visible customer can still have some
 * of their purchase rows filtered if a colleague closed those specific
 * sales. */
export async function getPurchasesByCustomer(customerId: string): Promise<CustomerPurchase[]> {
  let query = supabase
    .from("customer_purchases")
    .select(WITH_PRODUCT)
    .eq("customer_id", customerId);

  const staff = await getCurrentStaff();
  if (staff) query = (await applyDataScopeWithFallback(query, staff, "revenue", "salesperson_id", "salesperson")).query;

  const { data, error } = await query.order("sale_date", { ascending: false });

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
//
// Staff Management (Sprint v2.0.0), Feature 5: salesperson_id is resolved
// alongside the legacy salesperson text (never replacing it) by matching
// that text to a staff member's full name. No match (e.g. the product's
// salesperson was never onboarded as staff) just leaves salesperson_id
// null - salesperson (text) is always saved regardless.
async function getProductSourceSnapshot(
  productId: string
): Promise<{ source: string | null; salesperson: string | null; salesperson_id: string | null }> {
  const { data, error } = await supabase
    .from("products")
    .select("source, salesperson")
    .eq("id", productId)
    .single();

  if (error || !data) {
    if (error) console.error("Error reading product source/salesperson:", error);
    return { source: null, salesperson: null, salesperson_id: null };
  }

  const salesperson = data.salesperson ?? null;
  const staff = salesperson ? await getStaffByName(salesperson) : null;

  return { source: data.source ?? null, salesperson, salesperson_id: staff?.id ?? null };
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

  const saved = data as unknown as CustomerPurchase;

  // Sales Commission module (Sprint v1.2.0), Business Rule 4: a sale
  // "completes" the moment its customer_purchases row is created - this is
  // the one and only trigger point. Snapshot creation is best-effort: it
  // must never block or fail the sale itself (matches markProductSold's
  // log-don't-throw convention above). updatePurchase()/deletePurchase()
  // deliberately do NOT call into commission code again - Business Rule 5
  // requires the snapshot to stay unchanged no matter what happens to the
  // purchase afterward.
  if (saved.id) {
    try {
      const { error: commissionError } = await createSnapshotForPurchase({
        id: saved.id,
        customer_id: saved.customer_id,
        sale_amount: saved.sale_price,
        salesperson: saved.salesperson,
        salesperson_id: saved.salesperson_id,
      });
      if (commissionError) console.error("Error creating commission snapshot:", commissionError);
    } catch (commissionError) {
      console.error("Error creating commission snapshot:", commissionError);
    }
  }

  return { data: saved, error: null };
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
 * BUG-006: the one place "revenue per customer" is summed from
 * customer_purchases rows. Shared by getPurchaseSummaries (Customers list,
 * all-time) and getCustomerRevenue (Customer Detail, date-filterable) below,
 * so the two can never sum rows differently, only over a different row set.
 */
export function aggregateCustomerRevenue(
  rows: Pick<CustomerPurchase, "customer_id" | "sale_price" | "sale_date">[]
): Map<string, CustomerPurchaseSummary> {
  const summaries = new Map<string, CustomerPurchaseSummary>();

  for (const row of rows) {
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

/**
 * One query for every customer's ALL-TIME purchase aggregates (count, total
 * revenue, last purchase date) - backs the Customers list "Doanh thu" column
 * and its revenue-threshold filter. Nothing here is stored/duplicated back
 * onto the customers table.
 */
export async function getPurchaseSummaries(): Promise<Map<string, CustomerPurchaseSummary>> {
  const { data, error } = await supabase
    .from("customer_purchases")
    .select("customer_id, sale_price, sale_date");

  if (error || !data) {
    if (error) console.error("Error fetching purchase summaries:", error);
    return new Map();
  }

  return aggregateCustomerRevenue(data as Pick<CustomerPurchase, "customer_id" | "sale_price" | "sale_date">[]);
}

/**
 * Single customer's purchase aggregates, optionally bounded to [range.start,
 * range.end) on sale_date - backs Customer Detail's revenue figure. Passing
 * `null` means All Time (no date bound applied at all, not a wide hardcoded
 * range) - the same real absence-of-filter semantics as getPurchaseSummaries
 * above, just scoped to one customer instead of every customer.
 */
export async function getCustomerRevenue(
  customerId: string,
  range: { start: string; end: string } | null
): Promise<CustomerPurchaseSummary> {
  let query = supabase
    .from("customer_purchases")
    .select("customer_id, sale_price, sale_date")
    .eq("customer_id", customerId);

  if (range) {
    query = query.gte("sale_date", range.start).lt("sale_date", range.end);
  }

  const { data, error } = await query;

  if (error || !data) {
    if (error) console.error("Error fetching customer revenue:", error);
    return { count: 0, totalRevenue: 0, lastPurchaseDate: null };
  }

  const summaries = aggregateCustomerRevenue(
    data as Pick<CustomerPurchase, "customer_id" | "sale_price" | "sale_date">[]
  );
  return summaries.get(customerId) || { count: 0, totalRevenue: 0, lastPurchaseDate: null };
}
