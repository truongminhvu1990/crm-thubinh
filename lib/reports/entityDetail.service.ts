import { SupabaseClient } from "@supabase/supabase-js";
import { applyDataScopeByName } from "@/lib/permission/dataScope";
import { getOrderDetail } from "@/lib/orders/order.service";
import { ScopingStaff } from "@/lib/orders/order.repository";
import { calculateAmountPaid, calculateRemainingBalance } from "@/lib/orders/order.rules";
import { selectIn } from "@/lib/reports/selectIn";
import {
  CustomerDrawerData,
  DetailCustomerRef,
  DetailOrderRef,
  InventoryDrawerData,
  OrderDrawerData,
  ProductDrawerData,
  ProductOrderLink,
  ProductSummary,
} from "@/types/reportDetail";

// Phase 1.6 - read-only detail reads behind the Reporting drawer.
//
// Data scope (PO decision 2): every Order that can appear in a drawer is read
// through the SAME Orders scope (`applyDataScopeByName(.., "orders",
// "sales_owner")`) the Orders module uses. An out-of-scope order is
// indistinguishable from a missing one (null -> 404), never "forbidden".
// Products and Customer Profiles are not Orders-scoped (customer profile is
// "always fully shared", see customer.service.ts) - but the ORDERS listed
// under them are.
//
// Field minimisation: nothing here selects address, receiving accounts, cost
// or margin.

/** Same set lib/reports/inventoryValue.service.ts uses for "current holding order". */
const OPEN_ORDER_STATUSES = ["Draft", "Reserved"];
const ORDER_LIST_LIMIT = 100;

const ORDER_REF_COLUMNS = "id, order_number, order_date, order_status, payment_status, total_amount, customer:customers(id, full_name, customer_code)";

interface RawCustomer {
  id: string;
  full_name: string;
  customer_code: string | null;
}

interface RawOrderRef {
  id: string;
  order_number: string;
  order_date: string;
  order_status: string;
  payment_status: string;
  total_amount: number | string | null;
  customer: RawCustomer | RawCustomer[] | null;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

function toCustomerRef(c: RawCustomer | RawCustomer[] | null): DetailCustomerRef | null {
  const customer = one(c);
  return customer ? { id: customer.id, customer_code: customer.customer_code ?? null, full_name: customer.full_name } : null;
}

function toOrderRef(o: RawOrderRef): DetailOrderRef {
  return {
    order_id: o.id,
    order_number: o.order_number,
    order_date: o.order_date,
    order_status: o.order_status,
    payment_status: o.payment_status,
    total_amount: Number(o.total_amount) || 0,
  };
}

/** Orders under the caller's Orders data scope, by id list. */
async function loadScopedOrders(client: SupabaseClient, staff: ScopingStaff, ids: string[]): Promise<RawOrderRef[]> {
  if (!ids.length) return [];
  const out: RawOrderRef[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    let query = client.from("orders").select(ORDER_REF_COLUMNS).in("id", ids.slice(i, i + 200));
    query = (await applyDataScopeByName(query, staff, "orders", "sales_owner", client)).query;
    const { data, error } = await query;
    if (error) throw error;
    out.push(...((data ?? []) as unknown as RawOrderRef[]));
  }
  return out;
}

async function loadProduct(client: SupabaseClient, id: string): Promise<ProductSummary | null> {
  const { data, error } = await client
    .from("products")
    .select("id, product_code, product_name, category, status, sale_price, batch_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    product_code: data.product_code ?? null,
    product_name: data.product_name ?? null,
    category: data.category ?? null,
    status: data.status,
    sale_price: data.sale_price == null ? null : Number(data.sale_price),
    batch_id: data.batch_id ?? null,
  };
}

export async function getOrderDrawerData(id: string, staff: ScopingStaff, client: SupabaseClient): Promise<OrderDrawerData | null> {
  const detail = await getOrderDetail(id, staff, client);
  if (!detail) return null;
  const { order, items, payments } = detail;
  const total = Number(order.total_amount) || 0;
  const amountPaid = calculateAmountPaid(payments);

  return {
    order: {
      order_id: order.id!,
      order_number: order.order_number,
      order_date: order.order_date,
      order_status: order.order_status,
      payment_status: order.payment_status,
      total_amount: total,
      sales_owner: order.sales_owner ?? null,
    },
    customer: order.customer
      ? { id: order.customer.id!, customer_code: order.customer.customer_code ?? null, full_name: order.customer.full_name }
      : null,
    items: items.map((it) => ({
      item_id: it.id!,
      product_id: it.product_id,
      product_code: it.product?.product_code ?? null,
      product_name: it.product?.product_name ?? null,
      unit_price: Number(it.snapshot_sale_price) || 0,
      quantity: Number(it.quantity) || 0,
      discount: Number(it.discount) || 0,
      line_total: Number(it.line_total) || 0,
      is_gift: !!it.is_gift,
    })),
    totals: { total_amount: total, amount_paid: amountPaid, remaining_balance: calculateRemainingBalance(total, payments) },
    // Method/date/amount only: receiving-account (bank) details stay in Orders.
    payments: payments.map((p) => ({ amount: Number(p.amount) || 0, payment_method: p.payment_method, payment_date: p.payment_date })),
  };
}

export async function getProductDrawerData(id: string, staff: ScopingStaff, client: SupabaseClient): Promise<ProductDrawerData | null> {
  const product = await loadProduct(client, id);
  if (!product) return null;

  const { data: items, error } = await client
    .from("order_items")
    .select("order_id, quantity, line_total")
    .eq("product_id", id);
  if (error) throw error;

  const rows = (items ?? []) as { order_id: string; quantity: number; line_total: number }[];
  const orders = await loadScopedOrders(client, staff, [...new Set(rows.map((r) => r.order_id))]);
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const links: ProductOrderLink[] = [];
  for (const r of rows) {
    const o = orderById.get(r.order_id);
    if (!o) continue; // out of the caller's scope
    links.push({
      ...toOrderRef(o),
      customer: toCustomerRef(o.customer),
      quantity: Number(r.quantity) || 0,
      line_total: Number(r.line_total) || 0,
    });
  }
  links.sort((a, b) => (a.order_date < b.order_date ? 1 : a.order_date > b.order_date ? -1 : 0));
  return { product, orders: links };
}

export async function getCustomerDrawerData(id: string, staff: ScopingStaff, client: SupabaseClient): Promise<CustomerDrawerData | null> {
  const { data: customer, error } = await client
    .from("customers")
    .select("id, customer_code, full_name, phone")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!customer) return null;

  let query = client
    .from("orders")
    .select(ORDER_REF_COLUMNS)
    .eq("customer_id", id);
  query = (await applyDataScopeByName(query, staff, "orders", "sales_owner", client)).query;
  const { data: orderRows, error: ordersError } = await query
    .order("order_date", { ascending: false })
    .limit(ORDER_LIST_LIMIT + 1);
  if (ordersError) throw ordersError;

  const all = (orderRows ?? []) as unknown as RawOrderRef[];
  const truncated = all.length > ORDER_LIST_LIMIT;
  const orders = all.slice(0, ORDER_LIST_LIMIT).map(toOrderRef);

  return {
    customer: { id: customer.id, customer_code: customer.customer_code ?? null, full_name: customer.full_name, phone: customer.phone ?? null },
    orders,
    summary: {
      order_count: orders.length,
      // A partial sum would read as a real total - only report it when complete.
      total_order_value: truncated ? null : orders.reduce((s, o) => s + o.total_amount, 0),
      truncated,
    },
  };
}

export async function getInventoryDrawerData(id: string, staff: ScopingStaff, client: SupabaseClient): Promise<InventoryDrawerData | null> {
  const product = await loadProduct(client, id);
  if (!product) return null;

  const bucket: InventoryDrawerData["bucket"] =
    product.status === "Reserved" ? "held" : product.status === "Available" ? "remaining" : product.status === "Sold" ? "sold" : "other";

  let holding: InventoryDrawerData["holding_order"] = null;
  if (bucket === "held") {
    const { data: items, error } = await client.from("order_items").select("order_id").eq("product_id", id);
    if (error) throw error;
    const orders = await loadScopedOrders(client, staff, [...new Set((items ?? []).map((r: { order_id: string }) => r.order_id))]);
    const open = orders.find((o) => OPEN_ORDER_STATUSES.includes(o.order_status));
    if (open) {
      const payments = await selectIn<{ order_id: string; amount: number }>(client, "payments", "order_id, amount", "order_id", [open.id]);
      const total = Number(open.total_amount) || 0;
      holding = {
        ...toOrderRef(open),
        customer: toCustomerRef(open.customer),
        amount_paid: calculateAmountPaid(payments.map((p) => ({ amount: Number(p.amount) || 0 }))),
        remaining_balance: calculateRemainingBalance(total, payments.map((p) => ({ amount: Number(p.amount) || 0 }))),
      };
    }
  }
  return { product, bucket, holding_order: holding };
}
