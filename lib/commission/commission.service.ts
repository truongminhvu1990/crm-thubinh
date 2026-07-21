import { CommissionListFilters, CommissionRule, CommissionSummary, SalesCommission } from "@/types/commission";
import { getCustomers } from "@/lib/customer.service";
import { COMMISSION_NEXT_STATUS } from "./commission.constants";
import * as repo from "./commission.repository";

// Business logic only - CommissionRepository owns every direct Supabase
// call. Matching/calculation lives in exactly one place (here), so nothing
// else in the app is ever tempted to recompute a commission a second way.

/** Business Rule 4: "Find matching commission rule." Ties (should never
 * happen with the locked default, non-overlapping ranges, but is possible
 * if rules are edited later) resolve to the highest-minimum bracket that
 * still qualifies. */
export function findMatchingRule(rules: CommissionRule[], saleAmount: number): CommissionRule | null {
  const matches = rules.filter(
    (r) => saleAmount >= r.minimum_amount && (r.maximum_amount === null || saleAmount <= r.maximum_amount)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, r) => (r.minimum_amount > best.minimum_amount ? r : best));
}

export function calculateCommissionAmount(saleAmount: number, commissionPercent: number): number {
  return (saleAmount * commissionPercent) / 100;
}

/** Business Rule 4: called exactly once, when a sale completes (see
 * lib/purchase.service.ts's addPurchase()). Inserts ONE snapshot row and
 * never touches it again for calculation purposes - see Business Rule 1/5. */
export async function createSnapshotForPurchase(purchase: {
  id: string;
  customer_id: string;
  sale_amount: number;
  salesperson?: string | null;
  /** Feature 6 - Commission Integration: used when available; falls back
   * to the salesperson text alone (still saved either way) otherwise. */
  salesperson_id?: string | null;
}): Promise<{ data: SalesCommission | null; error: unknown }> {
  const rules = await repo.getActiveCommissionRules();
  const rule = findMatchingRule(rules, purchase.sale_amount);

  if (!rule) {
    console.error("No matching commission rule for sale amount:", purchase.sale_amount);
    return { data: null, error: "NO_MATCHING_RULE" };
  }

  const commission_amount = calculateCommissionAmount(purchase.sale_amount, rule.commission_percent);

  return repo.insertCommissionSnapshot({
    purchase_id: purchase.id,
    customer_id: purchase.customer_id,
    salesperson: purchase.salesperson ?? null,
    salesperson_id: purchase.salesperson_id ?? null,
    sale_amount: purchase.sale_amount,
    commission_percent: rule.commission_percent,
    commission_amount,
    status: "Pending",
    paid_at: null,
    paid_by: null,
    note: null,
  });
}

function applyFilters(commissions: SalesCommission[], filters: CommissionListFilters): SalesCommission[] {
  let result = commissions;
  if (filters.dateFrom) {
    result = result.filter((c) => c.created_at.slice(0, 10) >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    result = result.filter((c) => c.created_at.slice(0, 10) <= filters.dateTo!);
  }
  if (filters.salesperson) {
    result = result.filter((c) => c.salesperson === filters.salesperson);
  }
  if (filters.status) {
    result = result.filter((c) => c.status === filters.status);
  }
  return result;
}

/** Feature 1's "Customer" column - resolves the current customer name for
 * display only. Never feeds back into any commission calculation. */
async function withCustomerNames(commissions: SalesCommission[]): Promise<SalesCommission[]> {
  if (commissions.length === 0) return commissions;
  const customers = await getCustomers();
  const byId = new Map(customers.map((c) => [c.id, { full_name: c.full_name, customer_code: c.customer_code }]));
  return commissions.map((c) => ({ ...c, customer: byId.get(c.customer_id) || null }));
}

export async function getCommissionList(filters: CommissionListFilters = {}): Promise<SalesCommission[]> {
  const all = await repo.getAllCommissions();
  return withCustomerNames(applyFilters(all, filters));
}

export async function getCommissionDetail(id: string): Promise<SalesCommission | null> {
  const commission = await repo.getCommissionById(id);
  if (!commission) return null;
  const [withName] = await withCustomerNames([commission]);
  return withName;
}

export function summarizeCommissions(commissions: SalesCommission[]): CommissionSummary {
  const summary: CommissionSummary = { totalCommission: 0, pending: 0, approved: 0, paid: 0 };
  for (const c of commissions) {
    summary.totalCommission += Number(c.commission_amount) || 0;
    if (c.status === "Pending") summary.pending += Number(c.commission_amount) || 0;
    else if (c.status === "Approved") summary.approved += Number(c.commission_amount) || 0;
    else if (c.status === "Paid") summary.paid += Number(c.commission_amount) || 0;
  }
  return summary;
}

/** Feature 6 - Dashboard widget. Reads sales_commissions only, per the
 * spec's explicit "Dashboard MUST read sales_commissions NOT
 * customer_purchases" instruction. */
export async function getDashboardCommissionStats(): Promise<{ thisMonth: number; outstanding: number }> {
  const all = await repo.getAllCommissions();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  let thisMonth = 0;
  let outstanding = 0;
  for (const c of all) {
    const amount = Number(c.commission_amount) || 0;
    if (c.created_at.slice(0, 10) >= monthStart) thisMonth += amount;
    if (c.status !== "Paid") outstanding += amount;
  }
  return { thisMonth, outstanding };
}

/** Feature 5: Pending -> Approved -> Paid, no skipping. Throws-free: caller
 * gets an explicit error string instead of a guessed generic failure. */
export async function approveCommission(
  commission: SalesCommission
): Promise<{ data: SalesCommission | null; error: unknown }> {
  if (COMMISSION_NEXT_STATUS[commission.status] !== "Approved") {
    return { data: null, error: `Cannot approve from status "${commission.status}"` };
  }
  return repo.updateCommissionStatusFields(commission.id, { status: "Approved" });
}

export async function markCommissionPaid(
  commission: SalesCommission,
  paidBy: string,
  note?: string
): Promise<{ data: SalesCommission | null; error: unknown }> {
  if (COMMISSION_NEXT_STATUS[commission.status] !== "Paid") {
    return { data: null, error: `Cannot mark paid from status "${commission.status}"` };
  }
  return repo.updateCommissionStatusFields(commission.id, {
    status: "Paid",
    paid_at: new Date().toISOString(),
    paid_by: paidBy || null,
    note: note || null,
  });
}
