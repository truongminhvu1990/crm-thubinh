import { SupabaseClient } from "@supabase/supabase-js";
import { Staff } from "@/types/staff";
import { PaymentMethodReportFilters, PaymentMethodReportRow, PaymentMethodDrillDownRow } from "@/types/paymentMethodReport";
import {
  PaymentReportSourceRow,
  findPaymentsForReport,
  findDistinctPaymentMethods,
  findOrderItemsForPaymentMethodDrillDown,
} from "./paymentMethodReport.repository";

/**
 * Pure aggregation — no I/O, no Supabase, testable in isolation. Groups
 * already-filtered payment rows by payment_method:
 *   Number of Orders   = COUNT(DISTINCT order_id) within that method group
 *   Number of Payments = COUNT(payment rows) within that method group
 *   Total Payment Amount = SUM(amount) within that method group
 *
 * A single Order with two payments of the SAME method counts as one Order
 * (the task's own worked example: 5M + 5M on one Order = 1 Order, 2
 * Payments, 10M total). An Order with payments split across DIFFERENT
 * methods correctly appears once in each of those methods' own rows — that
 * is not double-counting, it is two distinct facts ("this order paid X via
 * Cash" and "this order paid Y via Bank Transfer") each belonging to its
 * own method group, exactly as the per-method COUNT(DISTINCT order_id)
 * definition requires.
 */
export function aggregateByPaymentMethod(rows: PaymentReportSourceRow[]): PaymentMethodReportRow[] {
  const groups = new Map<string, { orderIds: Set<string>; paymentCount: number; totalAmount: number }>();

  for (const row of rows) {
    let group = groups.get(row.payment_method);
    if (!group) {
      group = { orderIds: new Set(), paymentCount: 0, totalAmount: 0 };
      groups.set(row.payment_method, group);
    }
    group.orderIds.add(row.order_id);
    group.paymentCount += 1;
    group.totalAmount += row.amount;
  }

  return Array.from(groups, ([paymentMethod, g]) => ({
    paymentMethod,
    orderCount: g.orderIds.size,
    paymentCount: g.paymentCount,
    totalAmount: g.totalAmount,
  })).sort((a, b) => b.totalAmount - a.totalAmount);
}

export async function getPaymentMethodReport(
  filters: PaymentMethodReportFilters,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<PaymentMethodReportRow[]> {
  const rows = client
    ? await findPaymentsForReport(filters, client, staff)
    : await findPaymentsForReport(filters, undefined, staff);
  return aggregateByPaymentMethod(rows);
}

export async function getPaymentMethodOptions(client?: SupabaseClient): Promise<string[]> {
  return client ? findDistinctPaymentMethods(client) : findDistinctPaymentMethods();
}

/** Drill-down (Product Owner task, 2026-08-14) — passthrough to the
 * repository; no aggregation to apply here (unlike the summary above, each
 * row already represents one real order_item, not a group to reduce). */
export async function getPaymentMethodDrillDown(
  filters: PaymentMethodReportFilters,
  paymentMethod: string,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<PaymentMethodDrillDownRow[]> {
  return client
    ? findOrderItemsForPaymentMethodDrillDown(filters, paymentMethod, client, staff)
    : findOrderItemsForPaymentMethodDrillDown(filters, paymentMethod, undefined, staff);
}
