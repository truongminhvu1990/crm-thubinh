import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { PaymentMethodReportFilters, PaymentMethodDrillDownRow } from "@/types/paymentMethodReport";
import { Staff } from "@/types/staff";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScopeByName } from "@/lib/permission/dataScope";
import { deriveOrderPaymentSummary } from "@/lib/reports/orderPaymentSummary";

/** Raw data access only, against `payments` (Orders/Payment module,
 * `docs/04_PAYMENT_SPEC.md`, LOCKED) joined to its owning `orders` row —
 * Reporting reads these tables directly (docs/07_REPORTING_SPEC.md §3:
 * "Read Models, Views, BI Queries, and Reporting Projections... never
 * another module's service layer"), the same pattern reports.service.ts
 * already uses for customer_purchases/products/customers. No Order/Payment
 * service function is imported anywhere in this module.
 *
 * Date field: `payments.payment_date` (the business date already surfaced
 * throughout the Orders UI — AddPaymentModal's own date input) is the
 * authoritative date for a Payment record, not `payments.created_at`
 * (row-insert audit timestamp, not chosen by the user) and not
 * `orders.order_date`/`customer_purchases.sale_date` (both describe a
 * different entity's own date, not when money was actually received).
 *
 * Payment Method: `payments.payment_method` is free text (backed in the UI
 * by the `payment_method` master-data category, not a DB enum — see
 * AddPaymentModal.tsx) — this report groups by whatever distinct values
 * actually exist on payment records, never a hardcoded list. No other
 * payment-method field exists anywhere in the schema (customer_purchases
 * has no payment_method column at all), so there is no competing source to
 * choose between.
 */
export interface PaymentReportSourceRow {
  order_id: string;
  amount: number;
  payment_method: string;
}

/** Month (YYYY-MM) shortcut - resolves to the same [start, end) shape as
 * every other date range in this codebase (monthlySoldProducts.repository.ts/
 * operatingExpenses.repository.ts's own resolveMonthRange — kept as a third
 * small, deliberate duplicate rather than a shared util, matching that
 * existing precedent). */
function resolveMonthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = new Date(y, m, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

/** Shared, unexported filter application — `client`/`staff` follow the same
 * sentinel pattern salesLedger.repository.ts's applyFilters established
 * (`staff === undefined` resolves via the browser Authentication Context;
 * an explicit `Staff | null` is used as-is, for Server Authentication
 * Context callers). Data Scope uses the "revenue" resource (same resource
 * key Sales Ledger's own Data Scope call uses — this report reads the same
 * underlying business data, just via Orders/Payments instead of
 * customer_purchases), applied via the text-only variant
 * (applyDataScopeByName) since orders.sales_owner has no salesperson_id FK
 * counterpart (order.repository.ts: "plain text master-data reference, not
 * a DB foreign key"). */
async function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: PaymentMethodReportFilters,
  staff?: Staff | null,
  client?: SupabaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ query: any }> {
  const monthRange = filters.month ? resolveMonthRange(filters.month) : null;
  const dateFrom = monthRange?.start ?? filters.dateFrom;
  const dateTo = monthRange?.end ?? filters.dateTo;

  if (dateFrom) query = query.gte("payment_date", dateFrom);
  if (dateTo) query = query.lt("payment_date", dateTo);

  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);

  if (filters.salesperson) query = query.eq("orders.sales_owner", filters.salesperson);

  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;
  if (resolvedStaff) {
    query = (await applyDataScopeByName(query, resolvedStaff, "revenue", "orders.sales_owner", client)).query;
  }

  return { query };
}

/** Every payment row matching the given filters — unaggregated, so the
 * service layer's pure grouping function (never duplicated here) is the
 * single place that turns this into per-payment-method rows. `orders!inner`
 * so a payment can never be returned without the order-scope/staff filters
 * above actually having something to apply against (a payment's order_id
 * is NOT NULL and ON DELETE CASCADE with orders, so this join can never
 * silently drop a live payment row either). */
export async function findPaymentsForReport(
  filters: PaymentMethodReportFilters,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<PaymentReportSourceRow[]> {
  let query = client.from("payments").select("order_id, amount, payment_method, orders!inner(sales_owner)");
  query = (await applyFilters(query, filters, staff, client)).query;

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching payments for Payment Method report:", error);
    return [];
  }

  return ((data as { order_id: string; amount: number; payment_method: string }[]) || []).map((row) => ({
    order_id: row.order_id,
    amount: row.amount,
    payment_method: row.payment_method,
  }));
}

interface ProductRelation {
  product_code: string | null;
  product_name: string | null;
}

interface CustomerRelation {
  full_name: string;
  customer_code: string;
}

interface OrderRelation {
  order_number: string;
  order_date: string;
  total_amount: number;
  customer_id: string;
  customers: CustomerRelation | CustomerRelation[] | null;
}

interface OrderItemDrillDownRelation {
  order_id: string;
  product_id: string;
  line_total: number;
  products: ProductRelation | ProductRelation[] | null;
  orders: OrderRelation | OrderRelation[] | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Drill-down (Product Owner task, 2026-08-14) — the real Order Items behind
 * one payment-method summary row. Step 1 reuses findPaymentsForReport
 * (rather than re-deriving filter/Data Scope logic a second time) to find
 * which Orders actually have a matching payment; every row below is scoped
 * to exactly those Order ids, so no separate Data Scope pass is needed on
 * the order_items/payments queries themselves. Step 2 fetches those Orders'
 * full order_items (every product on the Order, not just the ones that
 * "caused" the matched payment — line items aren't linked to individual
 * payments in this schema) joined to products/customers. Step 3 fetches
 * ALL of those Orders' payments (not filtered to `paymentMethod`) so
 * amountPaid/remainingBalance/paymentMethods reflect the Order's true full
 * payment history, exactly like Monthly Sold Products' own Payment Details
 * fields (lib/reports/orderPaymentSummary.ts). */
export async function findOrderItemsForPaymentMethodDrillDown(
  filters: PaymentMethodReportFilters,
  paymentMethod: string,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<PaymentMethodDrillDownRow[]> {
  const matchingPayments = await findPaymentsForReport({ ...filters, paymentMethod }, client, staff);
  const orderIds = [...new Set(matchingPayments.map((p) => p.order_id))];
  if (orderIds.length === 0) return [];

  const { data: itemRows, error: itemError } = await client
    .from("order_items")
    .select(
      "order_id, product_id, line_total, products(product_code, product_name), orders(order_number, order_date, total_amount, customer_id, customers(full_name, customer_code))"
    )
    .in("order_id", orderIds);
  if (itemError) {
    console.error("Error fetching order items for payment method drill-down:", itemError);
    return [];
  }

  const { data: paymentRows, error: paymentError } = await client
    .from("payments")
    .select("order_id, amount, payment_method")
    .in("order_id", orderIds);
  if (paymentError) console.error("Error fetching payments for payment method drill-down:", paymentError);

  const paymentsByOrderId = new Map<string, { amount: number; payment_method: string }[]>();
  for (const p of (paymentRows as { order_id: string; amount: number; payment_method: string }[]) || []) {
    const list = paymentsByOrderId.get(p.order_id) ?? [];
    list.push({ amount: Number(p.amount) || 0, payment_method: p.payment_method });
    paymentsByOrderId.set(p.order_id, list);
  }

  const rows: PaymentMethodDrillDownRow[] = [];
  for (const item of (itemRows as unknown as OrderItemDrillDownRelation[]) || []) {
    const order = firstOf(item.orders);
    if (!order) continue;
    const product = firstOf(item.products);
    const customer = firstOf(order.customers);
    const summary = deriveOrderPaymentSummary(Number(order.total_amount) || 0, paymentsByOrderId.get(item.order_id) ?? []);

    rows.push({
      orderId: item.order_id,
      orderNumber: order.order_number,
      orderDate: order.order_date,
      productId: item.product_id,
      productCode: product?.product_code ?? null,
      productName: product?.product_name ?? null,
      customerId: order.customer_id,
      customerName: customer?.full_name ?? "",
      customerCode: customer?.customer_code ?? "",
      saleAmount: Number(item.line_total) || 0,
      amountPaid: summary.amountPaid,
      remainingBalance: summary.remainingBalance,
      paymentMethods: summary.paymentMethods,
    });
  }
  return rows;
}

/** Distinct payment_method values currently represented in `payments` —
 * backs the Payment Method filter's own dropdown so it only ever offers
 * values that actually exist on real payment records (never the
 * master-data category's full configured list, which may include methods
 * nobody has actually been paid with yet). Unfiltered by date/staff/method
 * deliberately: this is "what methods could I filter by," not itself
 * subject to the filter it populates. */
export async function findDistinctPaymentMethods(client: SupabaseClient = supabase): Promise<string[]> {
  const { data, error } = await client.from("payments").select("payment_method");

  if (error) {
    console.error("Error fetching distinct payment methods:", error);
    return [];
  }

  const methods = new Set((data || []).map((row) => row.payment_method as string));
  return Array.from(methods).sort((a, b) => a.localeCompare(b, "vi"));
}
