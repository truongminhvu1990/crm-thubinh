import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  MonthlySoldProductsFilters,
  MonthlySoldProductRow,
  MonthlySoldProductsPage,
  MONTHLY_SOLD_PRODUCTS_PAGE_SIZE,
} from "@/types/monthlySoldProducts";
import { Staff } from "@/types/staff";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScopeWithFallback } from "@/lib/permission/dataScope";
import { deriveOrderPaymentSummary } from "@/lib/reports/orderPaymentSummary";

// Raw data access only, against the same read-only `sales_ledger` view
// Sales Ledger reads (see supabase/migrations/20260723_sales_ledger_view.sql) -
// no new view, no schema change. Order Number / Original Price / Discount /
// Gross Profit aren't on that view, so they're resolved by a second,
// batched enrichment pass (customer_purchases -> order_items -> orders,
// and products for cost_price/Gross Profit only) - the same "fetch the
// page, then batch-enrich" shape already used for Sales Ledger's own
// product-image lookup (salesLedger.repository.ts's
// getPrimaryImagesByProductIds).

interface SalesLedgerViewRow {
  purchase_id: string;
  customer_id: string;
  product_id: string | null;
  sale_amount: number;
  sale_date: string;
  salesperson: string | null;
  salesperson_id: string | null;
  customer_name: string;
  customer_code: string;
  product_code: string | null;
  product_name: string | null;
  product_category: string | null;
}

export interface AggregateSourceRow {
  purchase_id: string;
  product_id: string | null;
  customer_id: string;
  sale_amount: number;
  is_revenue_recognized: boolean;
}

interface DerivedFields {
  order_id: string | null;
  order_number: string | null;
  original_price: number | null;
  discount: number | null;
  cost_price: number | null;
  /** Column Customization (2026-08-12) - Jade Type, resolved via this same
   * products join (see types/monthlySoldProducts.ts's MonthlySoldProductRow
   * doc comment). */
  jade_type: string | null;
  /** Payment Details (2026-08-14) - see types/monthlySoldProducts.ts's
   * MonthlySoldProductRow doc comment: Order-level, null when there's no
   * linked Order. */
  amount_paid: number | null;
  remaining_balance: number | null;
  payment_methods: string | null;
}

interface OrderRelation {
  order_number: string;
  total_amount: number;
}

interface OrderItemRelation {
  id: string;
  order_id: string;
  snapshot_sale_price: number;
  discount: number;
  orders: OrderRelation | OrderRelation[] | null;
}

function firstOrder(orders: OrderItemRelation["orders"]): OrderRelation | null {
  if (!orders) return null;
  return Array.isArray(orders) ? orders[0] ?? null : orders;
}

/** Batched, keyed by purchase_id - shared by both the paginated page (full
 * display row) and the unpaginated summary aggregate, so the two can never
 * disagree on how Order Number / Original Price / Discount / Gross Profit
 * are derived. Order-linked purchases (order_item_id set) use the order
 * item's own snapshot_sale_price/discount (the values actually recorded at
 * sale time). Purchases with no linked Order (manual/historical entries)
 * have no stored historical snapshot - Product Owner Review (2026-07-27,
 * Fix 1): this report must show historical sales data only, so those rows
 * get `null` ("-") for Original Price/Discount rather than the product's
 * current catalog price, which would misrepresent a historical figure.
 * `products` is still read for `cost_price` (Gross Profit), which is a
 * current-cost-basis calculation, not a historical-price display field -
 * unaffected by this rule. */
async function getDerivedFieldsByPurchaseId(
  rows: { purchase_id: string; product_id: string | null }[],
  client: SupabaseClient
): Promise<Map<string, DerivedFields>> {
  const result = new Map<string, DerivedFields>();
  if (rows.length === 0) return result;

  const purchaseIds = rows.map((r) => r.purchase_id);
  const { data: links, error: linkError } = await client
    .from("customer_purchases")
    .select("id, order_item_id")
    .in("id", purchaseIds);
  if (linkError) console.error("Error fetching order links for monthly sold products:", linkError);

  const orderItemIdByPurchaseId = new Map<string, string>();
  for (const l of (links as { id: string; order_item_id: string | null }[]) || []) {
    if (l.order_item_id) orderItemIdByPurchaseId.set(l.id, l.order_item_id);
  }

  const orderItemIds = [...orderItemIdByPurchaseId.values()];
  const orderItemById = new Map<
    string,
    { order_id: string; order_number: string | null; total_amount: number | null; snapshot_sale_price: number; discount: number }
  >();
  if (orderItemIds.length > 0) {
    const { data: items, error: itemError } = await client
      .from("order_items")
      .select("id, order_id, snapshot_sale_price, discount, orders(order_number, total_amount)")
      .in("id", orderItemIds);
    if (itemError) console.error("Error fetching order items for monthly sold products:", itemError);
    for (const item of (items as unknown as OrderItemRelation[]) || []) {
      const order = firstOrder(item.orders);
      orderItemById.set(item.id, {
        order_id: item.order_id,
        order_number: order?.order_number ?? null,
        total_amount: order ? Number(order.total_amount) || 0 : null,
        snapshot_sale_price: Number(item.snapshot_sale_price) || 0,
        discount: Number(item.discount) || 0,
      });
    }
  }

  // Payment Details (2026-08-14) - batched, keyed by order_id (payments are
  // recorded against the Order, not the order_item), same "fetch once,
  // group in memory" shape the products join below already uses for
  // cost_price/jade_type.
  const orderIds = [...new Set([...orderItemById.values()].map((oi) => oi.order_id))];
  const paymentsByOrderId = new Map<string, { amount: number; payment_method: string }[]>();
  if (orderIds.length > 0) {
    const { data: paymentRows, error: paymentError } = await client
      .from("payments")
      .select("order_id, amount, payment_method")
      .in("order_id", orderIds);
    if (paymentError) console.error("Error fetching payments for monthly sold products:", paymentError);
    for (const p of (paymentRows as { order_id: string; amount: number; payment_method: string }[]) || []) {
      const list = paymentsByOrderId.get(p.order_id) ?? [];
      list.push({ amount: Number(p.amount) || 0, payment_method: p.payment_method });
      paymentsByOrderId.set(p.order_id, list);
    }
  }

  const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id))];
  const productById = new Map<string, { cost_price: number | null; jade_type: string | null }>();
  if (productIds.length > 0) {
    const { data: products, error: productError } = await client
      .from("products")
      .select("id, cost_price, jade_type")
      .in("id", productIds);
    if (productError) console.error("Error fetching products for monthly sold products:", productError);
    for (const p of (products as { id: string; cost_price: number | null; jade_type: string | null }[]) || []) {
      productById.set(p.id, { cost_price: p.cost_price, jade_type: p.jade_type });
    }
  }

  for (const r of rows) {
    const orderItemId = orderItemIdByPurchaseId.get(r.purchase_id);
    const orderItem = orderItemId ? orderItemById.get(orderItemId) : undefined;
    const product = r.product_id ? productById.get(r.product_id) : undefined;

    const paymentSummary =
      orderItem && orderItem.total_amount !== null
        ? deriveOrderPaymentSummary(orderItem.total_amount, paymentsByOrderId.get(orderItem.order_id) ?? [])
        : null;

    result.set(r.purchase_id, {
      order_id: orderItem?.order_id ?? null,
      order_number: orderItem?.order_number ?? null,
      original_price: orderItem ? orderItem.snapshot_sale_price : null,
      discount: orderItem ? orderItem.discount : null,
      cost_price: product?.cost_price ?? null,
      jade_type: product?.jade_type ?? null,
      amount_paid: paymentSummary?.amountPaid ?? null,
      remaining_balance: paymentSummary?.remainingBalance ?? null,
      payment_methods: paymentSummary?.paymentMethods ?? null,
    });
  }
  return result;
}

/** Month (YYYY-MM) shortcut - resolves to the same [start, end) shape as
 * every other date range in this codebase, without a second calendar-math
 * implementation. */
function resolveMonthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = new Date(y, m, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

// Returns `Promise<{ query }>`, not `Promise<Q>` - `query` here is a Supabase
// PostgrestFilterBuilder, which is itself thenable. An async function that
// `return`s a thenable doesn't wrap it as the resolved value; JS adopts the
// thenable's own resolution instead, firing the query early and collapsing
// the awaited result to `{data, error, count}` rather than the builder -
// exactly the trap lib/permission/dataScope.ts's applyDataScope() comment
// documents (and wraps around) for the same reason. Callers must unwrap
// `.query`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyFilters(query: any, filters: MonthlySoldProductsFilters, staff?: Staff | null): Promise<{ query: any }> {
  const monthRange = filters.month ? resolveMonthRange(filters.month) : null;
  const dateFrom = monthRange?.start ?? filters.dateFrom;
  const dateTo = monthRange?.end ?? filters.dateTo;

  if (dateFrom) query = query.gte("sale_date", dateFrom);
  if (dateTo) query = query.lt("sale_date", dateTo);

  if (filters.customer) {
    const term = filters.customer.replace(/[%,]/g, "");
    query = query.or(`customer_name.ilike.%${term}%,customer_code.ilike.%${term}%`);
  }
  if (filters.salespersonId) query = query.eq("salesperson_id", filters.salespersonId);
  if (filters.productCategory) query = query.eq("product_category", filters.productCategory);

  // Data Scope (same "revenue" resource / salesperson_id-with-text-fallback
  // mechanism Sales Ledger already applies) - this report exposes the same
  // per-sale revenue detail, so it gets the same enforcement, not a second
  // unscoped surface.
  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;
  if (resolvedStaff) {
    query = (await applyDataScopeWithFallback(query, resolvedStaff, "revenue", "salesperson_id", "salesperson")).query;
  }

  return { query };
}

const PAGE_COLUMNS =
  "purchase_id, customer_id, product_id, sale_amount, sale_date, salesperson, salesperson_id, customer_name, customer_code, product_code, product_name, product_category";

export async function getMonthlySoldProductsPage(
  filters: MonthlySoldProductsFilters,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<MonthlySoldProductsPage> {
  let query = client.from("sales_ledger").select(PAGE_COLUMNS, { count: "exact" });
  query = (await applyFilters(query, filters, staff)).query;
  query = query.order("sale_date", { ascending: false });

  const from = (filters.page - 1) * MONTHLY_SOLD_PRODUCTS_PAGE_SIZE;
  const to = from + MONTHLY_SOLD_PRODUCTS_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching monthly sold products page:", error);
    return { rows: [], totalCount: 0 };
  }

  const viewRows = (data as SalesLedgerViewRow[]) || [];
  const derivedByPurchaseId = await getDerivedFieldsByPurchaseId(viewRows, client);

  const rows: MonthlySoldProductRow[] = viewRows.map((r) => {
    const derived = derivedByPurchaseId.get(r.purchase_id);
    return {
      purchase_id: r.purchase_id,
      sale_date: r.sale_date,
      order_number: derived?.order_number ?? null,
      product_id: r.product_id,
      product_code: r.product_code,
      product_name: r.product_name,
      product_category: r.product_category,
      jade_type: derived?.jade_type ?? null,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      customer_code: r.customer_code,
      salesperson: r.salesperson,
      original_price: derived?.original_price ?? null,
      discount: derived?.discount ?? null,
      final_sale_price: Number(r.sale_amount) || 0,
      gross_profit:
        derived?.cost_price !== null && derived?.cost_price !== undefined
          ? (Number(r.sale_amount) || 0) - derived.cost_price
          : null,
      amount_paid: derived?.amount_paid ?? null,
      remaining_balance: derived?.remaining_balance ?? null,
      payment_methods: derived?.payment_methods ?? null,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

/** Every filtered row's sale_amount/is_revenue_recognized plus enough to
 * derive discount/order grouping - backs the Summary cards, which must
 * reflect the whole filtered set, not just the current page. */
export async function getMonthlySoldProductsAggregateRows(
  filters: MonthlySoldProductsFilters,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<{ source: AggregateSourceRow[]; derivedByPurchaseId: Map<string, DerivedFields> }> {
  let query = client.from("sales_ledger").select("purchase_id, product_id, customer_id, sale_amount, is_revenue_recognized");
  query = (await applyFilters(query, filters, staff)).query;

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching monthly sold products summary rows:", error);
    return { source: [], derivedByPurchaseId: new Map() };
  }

  const source = (data as AggregateSourceRow[]) || [];
  const derivedByPurchaseId = await getDerivedFieldsByPurchaseId(source, client);
  return { source, derivedByPurchaseId };
}
