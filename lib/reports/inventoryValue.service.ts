import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { deriveOrderPaymentSummary } from "@/lib/reports/orderPaymentSummary";
import { isSoldOrder } from "@/lib/reports/revenueDefinition";
import { fetchAllRows, selectIn } from "@/lib/reports/selectIn";

// Phase 1 - Reporting Foundation: the canonical HELD / REMAINING inventory
// data (Overview metrics "Hàng đang giữ" / "Hàng còn lại").
//
// Both are CURRENT-STATE figures (no date range) over `products`, valued at
// `products.sale_price` - the same field and the same two statuses the
// Business Intelligence "Inventory Value" already sums (docs/18, Decision 1:
// SUM(sale_price) WHERE status IN (Available, Reserved)), here split into its
// two disjoint halves so  Held + Remaining = that existing figure.
//
// Status mapping, verified against the Production schema/code (not guessed):
//  - products.status is one of Available / Paused / Reserved / Sold /
//    Discontinued / Archived (lib/product.constants.ts PRODUCT_STATUS).
//  - Orders moves a product Available -> Reserved via the reserve_product()
//    RPC (supabase/migrations/2026082206_...), Reserved -> Available via
//    release_product() (2026082207_...), and Reserved -> Sold on completion.
//  - So HELD = status 'Reserved' and REMAINING = status 'Available'.
//
// LOCKED business rule (Product Owner): a product on a Reserved order with a
// real payment is BOTH Sold (transaction state) AND Held (current physical
// state). The two metrics are never added together; each held row therefore
// carries `also_counted_as_sold` so the overlap is explicit, never hidden or
// netted out.

export const HELD_PRODUCT_STATUS = "Reserved";
export const REMAINING_PRODUCT_STATUS = "Available";

/** Orders that can hold a product (docs/02_PRODUCT_SPEC.md: a product belongs
 * to at most one open order item at a time). Same set lib/inventory.service.ts
 * uses for its own "current holding order". */
const OPEN_ORDER_STATUSES = ["Draft", "Reserved"];

export interface InventoryFilters {
  category?: string;
  /** products.salesperson (the owner shown on /inventory). */
  salesperson?: string;
  batchId?: string;
}

interface InventoryProductRow {
  id: string;
  product_code: string | null;
  product_name: string | null;
  category: string | null;
  status: string;
  sale_price: number | null;
  batch_id: string | null;
  salesperson: string | null;
}

export interface InventoryBucket {
  count: number;
  /** SUM(products.sale_price). A product with no sale_price counts toward
   * `count` but adds 0 here - and is tallied in `missingPriceCount` so the
   * gap is visible instead of silently understating the value. */
  value: number;
  missingPriceCount: number;
}

export interface InventoryValueSummary {
  held: InventoryBucket;
  remaining: InventoryBucket;
}

const EMPTY_BUCKET: InventoryBucket = { count: 0, value: 0, missingPriceCount: 0 };

function bucketOf(rows: InventoryProductRow[]): InventoryBucket {
  let value = 0;
  let missing = 0;
  for (const r of rows) {
    if (typeof r.sale_price === "number" && Number.isFinite(r.sale_price)) value += r.sale_price;
    else missing += 1;
  }
  return { count: rows.length, value, missingPriceCount: missing };
}

/** Pure. The only place held / remaining count + value are computed. */
export function summarizeInventoryRows(rows: InventoryProductRow[]): InventoryValueSummary {
  return {
    held: bucketOf(rows.filter((r) => r.status === HELD_PRODUCT_STATUS)),
    remaining: bucketOf(rows.filter((r) => r.status === REMAINING_PRODUCT_STATUS)),
  };
}

const PRODUCT_COLUMNS = "id, product_code, product_name, category, status, sale_price, batch_id, salesperson";

/** The ONE query behind both metrics and both drill-downs: every Reserved or
 * Available product, optionally narrowed, paged past PostgREST's 1000-row cap.
 * Returns null on a query error (callers degrade to empty). */
async function loadInventoryProducts(client: SupabaseClient, filters: InventoryFilters): Promise<InventoryProductRow[] | null> {
  const { data, error } = await fetchAllRows<InventoryProductRow>(client, "products", PRODUCT_COLUMNS, (base) => {
    let query = base.in("status", [HELD_PRODUCT_STATUS, REMAINING_PRODUCT_STATUS]);
    if (filters.category) query = query.eq("category", filters.category);
    if (filters.salesperson) query = query.eq("salesperson", filters.salesperson);
    if (filters.batchId) query = query.eq("batch_id", filters.batchId);
    return { query };
  });
  if (error || !data) {
    if (error) console.error("Error fetching inventory products for reporting:", error);
    return null;
  }
  return data;
}

/** Lean canonical figures for the Overview ("Hàng đang giữ" / "Hàng còn lại"). */
export async function getInventoryValueSummary(
  client: SupabaseClient = supabase,
  filters: InventoryFilters = {}
): Promise<InventoryValueSummary> {
  const rows = await loadInventoryProducts(client, filters);
  return rows ? summarizeInventoryRows(rows) : { held: EMPTY_BUCKET, remaining: EMPTY_BUCKET };
}

export interface InventoryProductDetailRow {
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  category: string | null;
  batch_id: string | null;
  salesperson: string | null;
  status: string;
  /** products.sale_price; null when the product has none on file. */
  sale_price: number | null;
}

export interface RemainingInventoryDetail {
  summary: InventoryBucket;
  /** = summary.value, and also = the sum of rows[].sale_price. */
  total: number;
  count: number;
  rows: InventoryProductDetailRow[];
}

export interface HoldingOrderInfo {
  order_id: string;
  order_number: string;
  order_date: string;
  order_status: string;
  payment_status: string;
  order_total: number;
  customer_name: string;
  customer_id: string | null;
  customer_code: string | null;
  paid_amount: number;
  payment_count: number;
}

export interface HeldInventoryRow extends InventoryProductDetailRow {
  /** The open (Draft / Reserved) order holding this product, or null when a
   * product is status Reserved but no open order references it (a data-quality
   * signal - the row is still counted, because HELD is defined by product
   * status, never inferred from orders). */
  holding_order: HoldingOrderInfo | null;
  /** LOCKED overlap: true when the holding order is itself Sold (Reserved
   * with >= 1 real payment). Informational only - never subtracted from, and
   * never added to, either metric. */
  also_counted_as_sold: boolean;
}

export interface HeldInventoryDetail {
  summary: InventoryBucket;
  /** = summary.value, and also = the sum of rows[].sale_price. */
  total: number;
  count: number;
  /** Held products with no open order found (see HeldInventoryRow). */
  unlinkedCount: number;
  rows: HeldInventoryRow[];
}

function toProductDetail(r: InventoryProductRow): InventoryProductDetailRow {
  return {
    product_id: r.id,
    product_code: r.product_code,
    product_name: r.product_name,
    category: r.category,
    batch_id: r.batch_id,
    salesperson: r.salesperson,
    status: r.status,
    sale_price: typeof r.sale_price === "number" ? r.sale_price : null,
  };
}

const byCode = (a: InventoryProductDetailRow, b: InventoryProductDetailRow) =>
  (a.product_code ?? "").localeCompare(b.product_code ?? "");

/** Drill-down for "Hàng còn lại": every Available product. */
export async function getRemainingInventoryDetail(
  client: SupabaseClient = supabase,
  filters: InventoryFilters = {}
): Promise<RemainingInventoryDetail> {
  const products = await loadInventoryProducts(client, filters);
  if (!products) return { summary: EMPTY_BUCKET, total: 0, count: 0, rows: [] };
  const summary = summarizeInventoryRows(products).remaining;
  const rows = products.filter((p) => p.status === REMAINING_PRODUCT_STATUS).map(toProductDetail).sort(byCode);
  return { summary, total: summary.value, count: summary.count, rows };
}

interface HoldingLinkRow {
  product_id: string;
  order:
    | {
        id: string;
        order_number: string;
        order_date: string;
        order_status: string;
        payment_status: string;
        total_amount: number;
        customer: { id: string; full_name: string; customer_code: string } | { id: string; full_name: string; customer_code: string }[] | null;
      }
    | null;
}

/** Drill-down for "Hàng đang giữ": every Reserved product, with the open order
 * holding it (when one exists) and whether that order is itself Sold. */
export async function getHeldInventoryDetail(
  client: SupabaseClient = supabase,
  filters: InventoryFilters = {}
): Promise<HeldInventoryDetail> {
  const products = await loadInventoryProducts(client, filters);
  if (!products) return { summary: EMPTY_BUCKET, total: 0, count: 0, unlinkedCount: 0, rows: [] };

  const held = products.filter((p) => p.status === HELD_PRODUCT_STATUS);
  const summary = summarizeInventoryRows(products).held;

  const links = held.length
    ? await selectIn<HoldingLinkRow>(
        client,
        "order_items",
        "product_id, order:orders(id, order_number, order_date, order_status, payment_status, total_amount, customer:customers(id, full_name, customer_code))",
        "product_id",
        held.map((p) => p.id)
      )
    : [];

  const holdingByProductId = new Map<string, NonNullable<HoldingLinkRow["order"]>>();
  for (const link of links) {
    if (!link.order || !OPEN_ORDER_STATUSES.includes(link.order.order_status)) continue;
    if (!holdingByProductId.has(link.product_id)) holdingByProductId.set(link.product_id, link.order);
  }

  const orderIds = [...new Set([...holdingByProductId.values()].map((o) => o.id))];
  const paymentRows = orderIds.length
    ? await selectIn<{ order_id: string; amount: number; payment_method: string }>(
        client,
        "payments",
        "order_id, amount, payment_method",
        "order_id",
        orderIds
      )
    : [];
  const paymentsByOrderId = new Map<string, { amount: number; payment_method: string }[]>();
  for (const p of paymentRows) {
    const list = paymentsByOrderId.get(p.order_id) ?? [];
    list.push({ amount: Number(p.amount) || 0, payment_method: p.payment_method });
    paymentsByOrderId.set(p.order_id, list);
  }

  let unlinkedCount = 0;
  const rows = held
    .map((p): HeldInventoryRow => {
      const base = toProductDetail(p);
      const order = holdingByProductId.get(p.id);
      if (!order) {
        unlinkedCount += 1;
        return { ...base, holding_order: null, also_counted_as_sold: false };
      }
      const payments = paymentsByOrderId.get(order.id) ?? [];
      const total = Number(order.total_amount) || 0;
      const customer = Array.isArray(order.customer) ? order.customer[0] ?? null : order.customer;
      return {
        ...base,
        holding_order: {
          order_id: order.id,
          order_number: order.order_number,
          order_date: order.order_date,
          order_status: order.order_status,
          payment_status: order.payment_status,
          order_total: total,
          customer_name: customer?.full_name ?? "",
          customer_id: customer?.id ?? null,
          customer_code: customer?.customer_code ?? null,
          paid_amount: deriveOrderPaymentSummary(total, payments).amountPaid,
          payment_count: payments.length,
        },
        also_counted_as_sold: isSoldOrder(order, payments.length),
      };
    })
    .sort(byCode);

  return { summary, total: summary.value, count: summary.count, unlinkedCount, rows };
}
