import { supabase } from "./supabase";
import { CustomerPurchase, CustomerPurchaseSummary } from "@/types/purchase";
import { createSnapshotForPurchase } from "@/lib/commission/commission.service";
import { getStaffByName } from "@/lib/staff.service";
import { getCurrentStaff } from "@/lib/permission";
import { applyPurchaseHistoryVisibility } from "@/lib/permission/purchaseHistoryVisibility";
import { logStatusChange } from "@/lib/auditLog.service";

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
/** Inventory Traceability (Product Owner Authorization, 2026-08-20) -
 * getPurchaseForProduct's own select: customer embed (unchanged from before
 * this feature) plus the historical Order (via order_item_id -> order_items
 * -> orders), nullable
 * end-to-end for legacy/manually-entered purchases that were never
 * completed through the Orders module. Only the fields Product Detail's
 * Order link actually needs (id, order_number, order_status) - no
 * payment/financial data. */
const WITH_CUSTOMER_AND_ORDER =
  "*, customer:customers(id, full_name, customer_code), order_item:order_items(order:orders(id, order_number, order_status))";

/** Customer Visibility Engine (Package 4B) - `customer_purchases`'
 * ownership prefers `salesperson_id` (uuid) when populated, falling back
 * to `salesperson` (text, case-insensitive/trimmed) for historical rows
 * predating the Staff Management module. Note this scopes the *purchase*
 * rows entirely independently of whether the *customer profile* itself is
 * visible - Customer Profile is now always a fully shared asset (see
 * getCustomers/getCustomerById in lib/customer.service.ts), so a visible
 * customer can still have some/all of their purchase rows hidden per the
 * Owner=All/Manager=Team/Sales=Own/Marketing=Hidden rule. */
export async function getPurchasesByCustomer(customerId: string): Promise<CustomerPurchase[]> {
  let query = supabase
    .from("customer_purchases")
    .select(WITH_PRODUCT)
    .eq("customer_id", customerId);

  const staff = await getCurrentStaff();
  if (staff) query = (await applyPurchaseHistoryVisibility(query, staff, "salesperson_id", "salesperson")).query;

  const { data, error } = await query.order("sale_date", { ascending: false });

  if (error) {
    console.error("Error fetching customer purchases:", error);
    return [];
  }

  return data as unknown as CustomerPurchase[];
}

/** The purchase record backing a sold product's "Customer / Sale Price / Sale
 * Date" display on the Product Detail page. A product can only be sold once
 * in this model, so the latest matching purchase is the sale. Customer
 * Visibility Engine (Package 4B): "Previous Selling Price" is Purchase
 * History, not Customer Profile, so this is visibility-scoped the same as
 * getPurchasesByCustomer - a Sales rep must never see another rep's sale
 * price/buyer surfaced here just because they viewed the product. */
export async function getPurchaseForProduct(productId: string): Promise<CustomerPurchase | null> {
  let query = supabase.from("customer_purchases").select(WITH_CUSTOMER_AND_ORDER).eq("product_id", productId);

  const staff = await getCurrentStaff();
  if (staff) query = (await applyPurchaseHistoryVisibility(query, staff, "salesperson_id", "salesperson")).query;

  const { data, error } = await query.order("sale_date", { ascending: false }).limit(1).maybeSingle();

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
/** Lot Product-Level Status, D5 (Product Owner Authorization, 2026-08-19):
 * reads the current status first purely so the audit_log entry records the
 * true before-value, rather than assuming - this flow has no WHERE-guard
 * to lean on for that (unlike order.repository.ts's reserveProduct). */
async function markProductSold(productId: string) {
  const { data: previous } = await supabase.from("products").select("status").eq("id", productId).maybeSingle();

  const { error } = await supabase.from("products").update({ status: "Sold" }).eq("id", productId);
  if (error) {
    console.error("Error marking product as sold:", error);
    return;
  }

  const staff = await getCurrentStaff();
  await logStatusChange({
    tableName: "products",
    recordId: productId,
    before: previous?.status ?? null,
    after: "Sold",
    actor: staff?.email ?? null,
  });
}

/** BR-003 (LOCKED, 2026-08-21) - reverts to "Available" (was "Active").
 * Guard/audit/permissions behavior otherwise unchanged. */
async function revertProduct(productId: string) {
  const { data: previous } = await supabase.from("products").select("status").eq("id", productId).maybeSingle();

  const { error } = await supabase.from("products").update({ status: "Available" }).eq("id", productId);
  if (error) {
    console.error("Error reverting product after purchase change:", error);
    return;
  }

  const staff = await getCurrentStaff();
  await logStatusChange({
    tableName: "products",
    recordId: productId,
    before: previous?.status ?? null,
    after: "Available",
    actor: staff?.email ?? null,
  });
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

/** BR-001 Revenue Recognition (docs/ORDERS_SPEC.md "Business Rule Lock",
 * LOCKED): revenue counts only when Order Status = Completed AND Payment
 * Status = Paid. A row with no linked Order (order_item_id NULL - predates
 * the Orders module, or entered manually) has no Order to check and
 * counts as recognized, same as it always has. */
function isRevenueRecognized(row: {
  order_item_id: string | null;
  order_items: { orders: { order_status: string; payment_status: string } | null } | null;
}): boolean {
  if (!row.order_item_id) return true;
  const order = row.order_items?.orders;
  return order?.order_status === "Completed" && order?.payment_status === "Paid";
}

type CustomerRevenueRow = Pick<CustomerPurchase, "customer_id" | "sale_price" | "sale_date"> & {
  order_item_id: string | null;
  order_items: { orders: { order_status: string; payment_status: string } | null } | null;
};

/**
 * BUG-006: the one place "revenue per customer" is summed from
 * customer_purchases rows. Shared by getPurchaseSummaries (Customers list,
 * all-time) and getCustomerRevenue (Customer Detail, date-filterable) below,
 * so the two can never sum rows differently, only over a different row set.
 * `count`/`lastPurchaseDate` reflect every row; `totalRevenue` applies
 * BR-001 (see isRevenueRecognized above).
 */
export function aggregateCustomerRevenue(rows: CustomerRevenueRow[]): Map<string, CustomerPurchaseSummary> {
  const summaries = new Map<string, CustomerPurchaseSummary>();

  for (const row of rows) {
    const existing = summaries.get(row.customer_id) || {
      count: 0,
      totalRevenue: 0,
      lastPurchaseDate: null as string | null,
    };
    existing.count += 1;
    if (isRevenueRecognized(row)) existing.totalRevenue += Number(row.sale_price) || 0;
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
 *
 * Customer Visibility Engine (Package 4B): Revenue is Purchase History, not
 * Customer Profile - visibility-scoped the same as getPurchasesByCustomer,
 * so this list-wide aggregate never leaks another rep's (or, for Marketing,
 * anyone's) sales through the back door of a total.
 */
export async function getPurchaseSummaries(): Promise<Map<string, CustomerPurchaseSummary>> {
  let query = supabase
    .from("customer_purchases")
    .select("customer_id, sale_price, sale_date, order_item_id, order_items(orders(order_status, payment_status))");

  const staff = await getCurrentStaff();
  if (staff) query = (await applyPurchaseHistoryVisibility(query, staff, "salesperson_id", "salesperson")).query;

  const { data, error } = await query;

  if (error || !data) {
    if (error) console.error("Error fetching purchase summaries:", error);
    return new Map();
  }

  return aggregateCustomerRevenue(data as unknown as CustomerRevenueRow[]);
}

/**
 * Single customer's purchase aggregates, optionally bounded to [range.start,
 * range.end) on sale_date - backs Customer Detail's revenue figure. Passing
 * `null` means All Time (no date bound applied at all, not a wide hardcoded
 * range) - the same real absence-of-filter semantics as getPurchaseSummaries
 * above, just scoped to one customer instead of every customer.
 *
 * Customer Visibility Engine (Package 4B): same visibility scoping as
 * getPurchaseSummaries above - a customer's total revenue is Purchase
 * History, independent of whether their Customer Profile is visible.
 */
export async function getCustomerRevenue(
  customerId: string,
  range: { start: string; end: string } | null
): Promise<CustomerPurchaseSummary> {
  let query = supabase
    .from("customer_purchases")
    .select("customer_id, sale_price, sale_date, order_item_id, order_items(orders(order_status, payment_status))")
    .eq("customer_id", customerId);

  if (range) {
    query = query.gte("sale_date", range.start).lt("sale_date", range.end);
  }

  const staff = await getCurrentStaff();
  if (staff) query = (await applyPurchaseHistoryVisibility(query, staff, "salesperson_id", "salesperson")).query;

  const { data, error } = await query;

  if (error || !data) {
    if (error) console.error("Error fetching customer revenue:", error);
    return { count: 0, totalRevenue: 0, lastPurchaseDate: null };
  }

  const summaries = aggregateCustomerRevenue(data as unknown as CustomerRevenueRow[]);
  return summaries.get(customerId) || { count: 0, totalRevenue: 0, lastPurchaseDate: null };
}
