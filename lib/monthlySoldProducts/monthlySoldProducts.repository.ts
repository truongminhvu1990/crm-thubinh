import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { MonthlySoldProductsFilters, MonthlySoldProductRow } from "@/types/monthlySoldProducts";
import { Staff } from "@/types/staff";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScopeByName, applyDataScopeWithFallback } from "@/lib/permission/dataScope";
import { deriveOrderPaymentSummary } from "@/lib/reports/orderPaymentSummary";
import { isOrderRecognized, isSoldOrder } from "@/lib/reports/revenueDefinition";
import { fetchAllRows, selectIn } from "@/lib/reports/selectIn";

// Revenue & Sales Reporting Unification (Product Owner decision) - this
// report is a SOLD PRODUCTS report, not a Recognized Revenue report. Its
// rows are every product line of a "sold" Order (Completed with any Payment
// Status, or Reserved with a deposit - see lib/reports/revenueDefinition.ts
// isSoldOrder), dated by the Order's own `order_date` (the same date basis
// as the Dashboard), plus legacy `customer_purchases` entries that have no
// linked Order (manual/historical - BR-002, recognized by exception, dated
// by their own sale_date). Each line carries whether it is recognized
// revenue (BR-001: Completed + Paid) or sold-but-unrecognized, decided by
// the same shared `isOrderRecognized` the Dashboard uses.
//
// Why Orders and not `sales_ledger` any more: customer_purchases (and so
// sales_ledger) rows are only written when an Order is COMPLETED, so a
// Reserved order with a deposit has no purchase row at all and could never
// appear there. Reads are still plain table reads (orders, order_items,
// customer_purchases, payments, products) - no new view, no schema change.
// For Completed orders the frozen customer_purchases snapshot
// (sale_price, salesperson) is used when present; a line with no snapshot
// yet falls back to the order item's own line total
// (snapshot_sale_price x quantity - discount, docs/03_ORDER_SPEC.md §7).

/** One report row plus the fields only summary/cost logic needs. */
export interface SoldLine extends MonthlySoldProductRow {
  cost_price: number | null;
  /** Salesperson filter inputs: salesperson_id lives only on the
   * customer_purchases snapshot; a line without one matches by the Order's
   * sales_owner (text) instead. */
  salesperson_id: string | null;
  sales_owner: string | null;
}

interface CustomerRelation {
  full_name: string;
  customer_code: string;
}

interface ProductRelation {
  product_code: string | null;
  product_name: string | null;
  category: string | null;
  jade_type: string | null;
  cost_price: number | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  order_date: string;
  total_amount: number;
  customer_id: string;
  sales_owner: string | null;
  customer: CustomerRelation | CustomerRelation[] | null;
}

/** Phase 1.5A: an order that IS Sold by the locked definition (Completed, or Reserved with a real payment) but has
 * NO order_items, so it produces no sold line. It is reported for display only ("Chưa có sản phẩm trong đơn"); it adds
 * nothing to any Sold total (totals are, and stay, the sum of the sold lines). */
export interface SoldItemlessOrder {
  order_id: string;
  order_number: string;
  order_date: string;
  order_status: string;
  payment_status: string;
  /** orders.total_amount - informational only, NOT part of the Sold value. */
  total_amount: number;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  sales_owner: string | null;
  amount_paid: number;
  remaining_balance: number;
  payment_methods: string | null;
}

interface OrderSide {
  lines: SoldLine[];
  itemless: SoldItemlessOrder[];
}

const EMPTY_ORDER_SIDE: OrderSide = { lines: [], itemless: [] };

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  snapshot_sale_price: number;
  discount: number;
  quantity: number;
  product: ProductRelation | ProductRelation[] | null;
}

interface PurchaseSnapshotRow {
  id: string;
  order_item_id: string;
  sale_price: number;
  salesperson: string | null;
  salesperson_id: string | null;
}

interface LegacyPurchaseRow {
  id: string;
  customer_id: string;
  product_id: string | null;
  sale_price: number;
  sale_date: string;
  salesperson: string | null;
  salesperson_id: string | null;
  customer: CustomerRelation | CustomerRelation[] | null;
  product: ProductRelation | ProductRelation[] | null;
}

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

// Phase 1.2: id-keyed lookups use the shared selectIn (lib/reports/selectIn.ts), which
// chunks the id list AND pages within each chunk - this file's former private copy
// only chunked, so a chunk owning more than PostgREST's max-rows cap (e.g. 200
// orders with 6+ payments each) was silently truncated.
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

function resolveRange(filters: MonthlySoldProductsFilters): { from?: string; to?: string } {
  const monthRange = filters.month ? resolveMonthRange(filters.month) : null;
  return { from: monthRange?.start ?? filters.dateFrom, to: monthRange?.end ?? filters.dateTo };
}

const PRODUCT_COLUMNS = "product:products(product_code, product_name, category, jade_type, cost_price)";

async function fetchOrderSide(
  range: { from?: string; to?: string },
  client: SupabaseClient,
  staff: Staff | null
): Promise<OrderSide> {
  // Sold scope is decided by the shared isSoldOrder() below (using real
  // payment RECORDS, not payment_status); the query only narrows to the two
  // statuses that can ever qualify.
  // Phase 1.2: read through fetchAllRows (paged, ordered by the unique `id`) so a
  // range holding more candidate orders than PostgREST's max-rows cap (default
  // 1000) is read completely. Same filters, scope and date basis as before.
  const { data, error } = await fetchAllRows<OrderRow>(
    client,
    "orders",
    "id, order_number, order_status, payment_status, order_date, total_amount, customer_id, sales_owner, customer:customers(full_name, customer_code)",
    async (base) => {
      let query = base.in("order_status", ["Completed", "Reserved"]);
      if (range.from) query = query.gte("order_date", range.from);
      if (range.to) query = query.lt("order_date", range.to);

      // Data Scope - same "orders" resource / sales_owner-by-name mechanism
      // /orders and the Dashboard's Order Value cards already use.
      if (staff) query = (await applyDataScopeByName(query, staff, "orders", "sales_owner", client)).query;
      return { query };
    }
  );
  if (error) {
    console.error("Error fetching sold orders for monthly sold products:", error);
    return EMPTY_ORDER_SIDE;
  }

  const candidates = data || [];
  if (candidates.length === 0) return EMPTY_ORDER_SIDE;

  // "Reserved counts as Sold only with at least one ACTUAL payment": decided
  // from the payments table (a row keyed to this order_id; amount is
  // CHECK > 0), never from orders.payment_status, which is derived and can
  // read "Paid" for a zero-total order that has no payment at all. Payments
  // are recorded against the Order, not the item (see orderPaymentSummary.ts)
  // - fetched once for every candidate Order, grouped in memory, and reused
  // for the Payment Details columns below.
  const paymentRows = await selectIn<{ order_id: string; amount: number; payment_method: string }>(
    client,
    "payments",
    "order_id, amount, payment_method",
    "order_id",
    candidates.map((o) => o.id)
  );
  const paymentsByOrderId = new Map<string, { amount: number; payment_method: string }[]>();
  for (const p of paymentRows) {
    const list = paymentsByOrderId.get(p.order_id) ?? [];
    list.push({ amount: Number(p.amount) || 0, payment_method: p.payment_method });
    paymentsByOrderId.set(p.order_id, list);
  }

  const orders = candidates.filter((o) => isSoldOrder(o, paymentsByOrderId.get(o.id)?.length ?? 0));
  if (orders.length === 0) return EMPTY_ORDER_SIDE;
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const orderIds = orders.map((o) => o.id);

  const items = await selectIn<OrderItemRow>(
    client,
    "order_items",
    `id, order_id, product_id, snapshot_sale_price, discount, quantity, ${PRODUCT_COLUMNS}`,
    "order_id",
    orderIds
  );
  const itemIds = items.map((i) => i.id);

  const snapshots = itemIds.length
    ? await selectIn<PurchaseSnapshotRow>(
        client,
        "customer_purchases",
        "id, order_item_id, sale_price, salesperson, salesperson_id",
        "order_item_id",
        itemIds
      )
    : [];
  const snapshotByItemId = new Map(snapshots.map((s) => [s.order_item_id, s]));

  const lines: SoldLine[] = [];
  for (const item of items) {
    const order = orderById.get(item.order_id);
    if (!order) continue;
    const product = first(item.product);
    const customer = first(order.customer);
    const snapshot = snapshotByItemId.get(item.id);
    const lineTotal = (Number(item.snapshot_sale_price) || 0) * (Number(item.quantity) || 1) - (Number(item.discount) || 0);
    const amount = snapshot ? Number(snapshot.sale_price) || 0 : lineTotal;
    const paymentSummary = deriveOrderPaymentSummary(Number(order.total_amount) || 0, paymentsByOrderId.get(order.id) ?? []);
    const costPrice = product?.cost_price ?? null;

    lines.push({
      line_key: item.id,
      purchase_id: snapshot?.id ?? null,
      order_id: order.id,
      order_status: order.order_status,
      payment_status: order.payment_status,
      recognition: isOrderRecognized(order) ? "recognized" : "unrecognized",
      is_legacy: false,
      sale_date: order.order_date,
      order_number: order.order_number,
      product_id: item.product_id,
      product_code: product?.product_code ?? null,
      product_name: product?.product_name ?? null,
      product_category: product?.category ?? null,
      jade_type: product?.jade_type ?? null,
      customer_id: order.customer_id,
      customer_name: customer?.full_name ?? "",
      customer_code: customer?.customer_code ?? "",
      salesperson: snapshot?.salesperson ?? order.sales_owner,
      original_price: Number(item.snapshot_sale_price) || 0,
      discount: Number(item.discount) || 0,
      final_sale_price: amount,
      gross_profit: costPrice !== null ? amount - costPrice : null,
      amount_paid: paymentSummary.amountPaid,
      remaining_balance: paymentSummary.remainingBalance,
      payment_methods: paymentSummary.paymentMethods,
      quantity: Number(item.quantity) || 1,
      cost_price: costPrice,
      salesperson_id: snapshot?.salesperson_id ?? null,
      sales_owner: order.sales_owner,
    });
  }

  // Phase 1.5A: Sold orders (same locked definition, same query) that have no order_items at all. Nothing here feeds
  // any total; it only lets the Sold detail say so instead of silently omitting the order.
  const orderIdsWithItems = new Set(items.map((i) => i.order_id));
  const itemless: SoldItemlessOrder[] = orders
    .filter((o) => !orderIdsWithItems.has(o.id))
    .map((o) => {
      const payment = deriveOrderPaymentSummary(Number(o.total_amount) || 0, paymentsByOrderId.get(o.id) ?? []);
      const customer = first(o.customer);
      return {
        order_id: o.id,
        order_number: o.order_number,
        order_date: o.order_date,
        order_status: o.order_status,
        payment_status: o.payment_status,
        total_amount: Number(o.total_amount) || 0,
        customer_id: o.customer_id,
        customer_name: customer?.full_name ?? "",
        customer_code: customer?.customer_code ?? "",
        sales_owner: o.sales_owner,
        amount_paid: payment.amountPaid,
        remaining_balance: payment.remainingBalance,
        payment_methods: payment.paymentMethods,
      };
    });
  return { lines, itemless };
}

/** Legacy entries: customer_purchases with no linked order_item (manual /
 * pre-Orders sales). BR-002 (LOCKED) treats them as recognized by
 * exception, and they were already listed by this report - they stay,
 * dated by their own sale_date, since they have no Order and so no
 * order_date. */
async function fetchLegacyLines(
  range: { from?: string; to?: string },
  client: SupabaseClient,
  staff: Staff | null
): Promise<SoldLine[]> {
  // Phase 1.2: paged like the other Sold reads (see fetchOrderLines).
  const { data, error } = await fetchAllRows<LegacyPurchaseRow>(
    client,
    "customer_purchases",
    `id, customer_id, product_id, sale_price, sale_date, salesperson, salesperson_id, customer:customers(full_name, customer_code), ${PRODUCT_COLUMNS}`,
    async (base) => {
      let query = base.is("order_item_id", null);
      if (range.from) query = query.gte("sale_date", range.from);
      if (range.to) query = query.lt("sale_date", range.to);

      // Data Scope - same "revenue" resource / salesperson_id-with-text-fallback
      // mechanism Sales Ledger and the Dashboard's revenue widget apply.
      if (staff) query = (await applyDataScopeWithFallback(query, staff, "revenue", "salesperson_id", "salesperson", client)).query;
      return { query };
    }
  );
  if (error) {
    console.error("Error fetching legacy purchases for monthly sold products:", error);
    return [];
  }

  return (data || []).map((r) => {
    const product = first(r.product);
    const customer = first(r.customer);
    const amount = Number(r.sale_price) || 0;
    const costPrice = product?.cost_price ?? null;
    return {
      line_key: r.id,
      purchase_id: r.id,
      order_id: null,
      order_status: null,
      payment_status: null,
      recognition: "recognized" as const,
      is_legacy: true,
      sale_date: r.sale_date,
      order_number: null,
      product_id: r.product_id,
      product_code: product?.product_code ?? null,
      product_name: product?.product_name ?? null,
      product_category: product?.category ?? null,
      jade_type: product?.jade_type ?? null,
      customer_id: r.customer_id,
      customer_name: customer?.full_name ?? "",
      customer_code: customer?.customer_code ?? "",
      salesperson: r.salesperson,
      original_price: null,
      discount: null,
      final_sale_price: amount,
      gross_profit: costPrice !== null ? amount - costPrice : null,
      amount_paid: null,
      remaining_balance: null,
      payment_methods: null,
      quantity: 1,
      cost_price: costPrice,
      salesperson_id: r.salesperson_id,
      sales_owner: null,
    };
  });
}

/** Every sold line in range (Order lines + legacy entries), filtered and
 * newest first. Both the paginated page and the unpaginated Summary derive
 * from this single list, so the rows and the Summary cards can never
 * disagree on scope or on the recognized/unrecognized split. */
export async function getSoldLines(
  filters: MonthlySoldProductsFilters,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<SoldLine[]> {
  return (await getSoldLinesWithItemless(filters, client, staff)).lines;
}

/** Phase 1.5A: the SAME single code path as getSoldLines (which now just returns `.lines`), plus the Sold orders that
 * have no product line. The sold lines - and therefore every total - are identical to what getSoldLines always returned. */
export async function getSoldLinesWithItemless(
  filters: MonthlySoldProductsFilters,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<{ lines: SoldLine[]; itemless: SoldItemlessOrder[] }> {
  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;
  const range = resolveRange(filters);

  const [orderSide, legacyLines] = await Promise.all([
    fetchOrderSide(range, client, resolvedStaff),
    fetchLegacyLines(range, client, resolvedStaff),
  ]);
  let lines = [...orderSide.lines, ...legacyLines];
  let itemless = orderSide.itemless;

  if (filters.customer) {
    const term = filters.customer.replace(/[%,]/g, "").toLowerCase();
    lines = lines.filter(
      (l) => l.customer_name.toLowerCase().includes(term) || l.customer_code.toLowerCase().includes(term)
    );
    itemless = itemless.filter((o) => o.customer_name.toLowerCase().includes(term) || o.customer_code.toLowerCase().includes(term));
  }
  if (filters.productCategory) {
    lines = lines.filter((l) => l.product_category === filters.productCategory);
    itemless = []; // an order with no product has no category, so it can never match a category filter
  }
  if (filters.salespersonId) {
    // salesperson_id is only stored on the purchase snapshot; a line with no
    // snapshot yet matches by the Order's sales_owner name instead - same
    // "id wins, name as fallback" rule as staff.service.ts's matchesStaff().
    const { data: staffRow } = await client.from("staff").select("full_name").eq("id", filters.salespersonId).maybeSingle();
    const name = ((staffRow as { full_name?: string } | null)?.full_name ?? "").trim().toLowerCase();
    lines = lines.filter((l) => {
      if (l.salesperson_id) return l.salesperson_id === filters.salespersonId;
      const owner = (l.sales_owner ?? l.salesperson ?? "").trim().toLowerCase();
      return name !== "" && owner === name;
    });
    itemless = itemless.filter((o) => name !== "" && (o.sales_owner ?? "").trim().toLowerCase() === name);
  }

  lines = lines.sort((a, b) => {
    if (a.sale_date !== b.sale_date) return a.sale_date < b.sale_date ? 1 : -1;
    const an = a.order_number ?? "";
    const bn = b.order_number ?? "";
    if (an !== bn) return an < bn ? 1 : -1;
    return a.line_key < b.line_key ? -1 : 1;
  });
  itemless = itemless.sort((a, b) => {
    if (a.order_date !== b.order_date) return a.order_date < b.order_date ? 1 : -1;
    return a.order_number === b.order_number ? 0 : a.order_number < b.order_number ? 1 : -1;
  });
  return { lines, itemless };
}

