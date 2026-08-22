import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/** Accrual-basis commission expense (Finance Project #1, Phase D, Product
 * Owner Approval 2026-08-21) — Net Profit must subtract commission as an
 * expense the moment the underlying obligation is incurred, independent of
 * whether it has actually been paid out yet. Paid state only affects
 * payable/cash-flow reporting elsewhere (Settlement Paid, Phase A) — it
 * must never cause a second deduction here, and unpaid commission must
 * never be silently excluded.
 *
 * Reads two pre-existing, intentionally SEPARATE systems — never merged,
 * no new table, no new ledger, no schema change:
 *
 *   - Partner Compensation (`compensations`) — counted once status reaches
 *     Confirmed (the point a real financial obligation exists, gated on
 *     the Order's own Payment Status = Paid) or later (Handed Off/Paid).
 *     Draft/Pending are excluded — still provisional, voidable by
 *     cancelCompensationsForOrder() if the Order is later marked Lost
 *     (Finance Project #1, Phase B). Scoped by order_id (Compensation has
 *     no purchase_id column).
 *
 *   - Staff Commission (`sales_commissions`) — counted for Pending/
 *     Approved/Paid, excluding Void. A sales_commissions row is created
 *     atomically with its customer_purchases row at Order Completion
 *     (complete_order_with_snapshots) and its calculation fields are
 *     write-once/frozen (order.repository.ts's own comment) — but its
 *     status is not: Order Cancellation (Product Owner Authorization,
 *     2026-08-20 — `cancel_order_with_disposition`) sets a still-unpaid
 *     row to Void when its Order is cancelled, at which point the
 *     obligation it represented no longer exists and must not reduce Net
 *     Profit (Finding 1, this task's own Post-Phase-F consolidation
 *     audit). "Pending" here means "not yet reviewed for payout," not
 *     "provisional," which is why excluding Draft/Pending is correct for
 *     Compensation but would be WRONG here for Pending/Approved (it would
 *     understate accrued expense for commission not yet approved, even
 *     though the sale is already fully recognized) — Void is the one
 *     status that genuinely means "no obligation." Scoped by purchase_id
 *     (its own snapshot key — confirmed no order_id/FK exists on this
 *     legacy table).
 *
 * Double-counting protection: each table holds exactly one row per line
 * item; a status transition (including reaching Paid or Void) only ever
 * UPDATEs that same row, never inserts a second one. Summing once per
 * included row is therefore inherently safe — Paid rows are counted
 * exactly once, the same as any other included status; Void rows are
 * excluded entirely, not summed as a negative. */
export interface AccrualCommissionExpense {
  partnerCompensation: number;
  staffCommission: number;
}

const PARTNER_COMPENSATION_ACCRUED_STATUSES = ["Confirmed", "Handed Off", "Paid"];
const STAFF_COMMISSION_ACCRUED_STATUSES = ["Pending", "Approved", "Paid"];

export interface AccrualCommissionExpenseScope {
  /** Orders whose revenue this report has already recognized — Partner
   * Compensation is matched to exactly these, never a looser date-range
   * query, so an expense is never deducted for an Order this report
   * doesn't also count as Revenue. */
  orderIds: string[];
  /** customer_purchases snapshot ids for the same recognized rows — Staff
   * Commission's own join key. */
  purchaseIds: string[];
}

export async function getAccrualCommissionExpense(
  scope: AccrualCommissionExpenseScope,
  client: SupabaseClient = supabase
): Promise<AccrualCommissionExpense> {
  const [partnerCompensation, staffCommission] = await Promise.all([
    getPartnerCompensationExpense(scope.orderIds, client),
    getStaffCommissionExpense(scope.purchaseIds, client),
  ]);
  return { partnerCompensation, staffCommission };
}

async function getPartnerCompensationExpense(orderIds: string[], client: SupabaseClient): Promise<number> {
  if (orderIds.length === 0) return 0;
  const { data, error } = await client
    .from("compensations")
    .select("calculated_amount")
    .in("order_id", orderIds)
    .in("status", PARTNER_COMPENSATION_ACCRUED_STATUSES);
  if (error) throw error;
  return (data ?? []).reduce((sum: number, row: { calculated_amount: number }) => sum + (Number(row.calculated_amount) || 0), 0);
}

async function getStaffCommissionExpense(purchaseIds: string[], client: SupabaseClient): Promise<number> {
  if (purchaseIds.length === 0) return 0;
  const { data, error } = await client
    .from("sales_commissions")
    .select("commission_amount")
    .in("purchase_id", purchaseIds)
    .in("status", STAFF_COMMISSION_ACCRUED_STATUSES);
  if (error) throw error;
  return (data ?? []).reduce((sum: number, row: { commission_amount: number }) => sum + (Number(row.commission_amount) || 0), 0);
}
