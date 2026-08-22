import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { CustomerReceivableFilters, CustomerReceivableRow } from "@/types/customerReceivable";
import { Staff } from "@/types/staff";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScopeByName } from "@/lib/permission/dataScope";
import { deriveOrderPaymentSummary } from "@/lib/reports/orderPaymentSummary";
import { deriveFinancialSettlementState, calculateOverpaidAmount } from "@/lib/orders/order.rules";

/** Raw data access only, against `orders` (joined to `customers`) and
 * `payments` directly — Reporting reads these tables directly
 * (docs/07_REPORTING_SPEC.md §3), same pattern paymentMethodReport.repository.ts
 * already uses. No Order/Payment/Customer service function is imported
 * anywhere in this module.
 *
 * Scope: excludes Lost orders. A Lost order's revenue was never
 * recognized (BR-001/BR-002) — continuing to show any leftover balance on
 * one as an active "Outstanding" receivable would misrepresent a
 * cancelled sale as still collectible. Draft/Reserved/Completed are all
 * included: a deposit on a still-open Draft/Reserved Order is a real
 * receivable exactly like a Completed one's balance (ORDERS_SPEC.md §5
 * treats partial/zero payment on completion as normal business).
 *
 * Cancelled orders (Order Cancellation, Product Owner Authorization
 * 2026-08-19) are deliberately KEPT INCLUDED — Product Owner Decision,
 * Finding 2, Finance Project #1 consolidation audit, 2026-08-22.
 * `cancel_order_with_disposition` never touches `payments` or
 * `customer_purchases`; a Cancelled order's payment balance is not
 * reversed by cancellation, so any leftover balance is still a real,
 * collectible receivable. This is intentionally NOT symmetric with the
 * Lost exclusion above (a Lost order's revenue was never recognized in
 * the first place) — do not add Cancelled to the `.neq()` filter without
 * a separate Product Owner decision reversing payments/collectibility on
 * cancellation itself. */
interface CustomerRelation {
  full_name: string;
  customer_code: string;
}

interface OrderRelation {
  id: string;
  order_number: string;
  order_date: string;
  total_amount: number;
  customer_id: string;
  sales_owner: string;
  customers: CustomerRelation | CustomerRelation[] | null;
}

interface PaymentRelation {
  order_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Every Order matching the given filters (status/searchTerm applied
 * client-side after the payment-derived fields are computed, same
 * "fetch then filter in JS" convention getOrderList/createSettlement's own
 * search already uses — status/searchTerm depend on derived figures, not
 * raw columns, so they can't be pushed into the SQL WHERE clause).
 * Unpaginated — the service layer slices this same array for both the
 * page and the summary totals, so the two can never disagree
 * (lib/customerReceivable/customerReceivable.service.ts). `staff` follows
 * the same sentinel pattern every other reporting repository in this
 * codebase uses (`undefined` resolves via Browser Authentication Context;
 * an explicit `Staff | null` is used as-is for Server Authentication
 * Context callers). */
export async function findCustomerReceivableOrders(
  filters: CustomerReceivableFilters,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<CustomerReceivableRow[]> {
  let query = client
    .from("orders")
    .select("id, order_number, order_date, total_amount, customer_id, sales_owner, customers(full_name, customer_code)")
    .neq("order_status", "Lost");

  if (filters.dateFrom) query = query.gte("order_date", filters.dateFrom);
  if (filters.dateTo) query = query.lt("order_date", filters.dateTo);

  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;
  if (resolvedStaff) {
    query = (await applyDataScopeByName(query, resolvedStaff, "revenue", "sales_owner", client)).query;
  }

  const { data: orderRows, error: orderError } = await query.order("order_date", { ascending: false });
  if (orderError) {
    console.error("Error fetching orders for Customer Receivable report:", orderError);
    return [];
  }

  const orders = (orderRows ?? []) as unknown as OrderRelation[];
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: paymentRows, error: paymentError } = await client
    .from("payments")
    .select("order_id, amount, payment_method, payment_date")
    .in("order_id", orderIds);
  if (paymentError) {
    console.error("Error fetching payments for Customer Receivable report:", paymentError);
  }

  const paymentsByOrderId = new Map<string, PaymentRelation[]>();
  for (const p of (paymentRows ?? []) as PaymentRelation[]) {
    const list = paymentsByOrderId.get(p.order_id) ?? [];
    list.push(p);
    paymentsByOrderId.set(p.order_id, list);
  }

  let rows: CustomerReceivableRow[] = orders.map((order) => {
    const customer = firstOf(order.customers);
    const payments = paymentsByOrderId.get(order.id) ?? [];
    const totalAmount = Number(order.total_amount) || 0;
    const summary = deriveOrderPaymentSummary(totalAmount, payments);
    const settlementState = deriveFinancialSettlementState(summary.remainingBalance);
    const overpaidAmount = calculateOverpaidAmount(summary.remainingBalance);
    const lastPaymentDate =
      payments.length > 0 ? payments.reduce((latest, p) => (p.payment_date > latest ? p.payment_date : latest), payments[0].payment_date) : null;

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      orderDate: order.order_date,
      customerId: order.customer_id,
      customerName: customer?.full_name ?? "",
      customerCode: customer?.customer_code ?? "",
      totalAmount,
      amountPaid: summary.amountPaid,
      remainingBalance: summary.remainingBalance,
      settlementState,
      overpaidAmount,
      paymentMethods: summary.paymentMethods,
      paymentCount: payments.length,
      lastPaymentDate,
    };
  });

  if (filters.status) {
    rows = rows.filter((r) => r.settlementState === filters.status);
  }
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.customerName.toLowerCase().includes(term) ||
        r.customerCode.toLowerCase().includes(term) ||
        r.orderNumber.toLowerCase().includes(term)
    );
  }

  return rows;
}
