import { CommissionBySalespersonRow, CommissionAgingRow } from "@/types/commissionReporting";

// Pure aggregation logic only, separated from data access (commissionReporting.
// repository.ts) so it's directly unit-testable with plain arrays - same
// split already established by paymentMethodReport.service.ts's own
// aggregateByPaymentMethod.

export interface RawCommissionRow {
  id: string;
  salesperson: string | null;
  salesperson_id: string | null;
  sale_amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
}

/** ST-3 - Commission by Salesperson: group by salesperson_id (falling back
 * to the salesperson text field for historical rows with no id, same
 * uuid+text fallback shape Data Scope already uses on this table), sum
 * sale/commission amounts, count deals. */
export function aggregateCommissionBySalesperson(rows: RawCommissionRow[]): CommissionBySalespersonRow[] {
  const grouped = new Map<string, { name: string; deals: RawCommissionRow[] }>();
  for (const row of rows) {
    const key = row.salesperson_id ?? row.salesperson ?? "—";
    const name = row.salesperson ?? "—";
    if (!grouped.has(key)) grouped.set(key, { name, deals: [] });
    grouped.get(key)!.deals.push(row);
  }

  return [...grouped.values()].map(({ name, deals }) => {
    const totalSaleAmount = deals.reduce((sum, d) => sum + (Number(d.sale_amount) || 0), 0);
    const totalCommissionAmount = deals.reduce((sum, d) => sum + (Number(d.commission_amount) || 0), 0);
    return {
      salespersonId: deals[0]?.salesperson_id ?? null,
      salespersonName: name,
      dealCount: deals.length,
      totalSaleAmount,
      totalCommissionAmount,
      averageCommissionAmount: deals.length > 0 ? totalCommissionAmount / deals.length : 0,
    };
  });
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** ST-4 - Commission Aging: "how long a Commission has sat Pending without
 * Approval" (docs/06_COMMISSION_SPEC.md §16). `nowMs` is a parameter
 * (defaults to `Date.now()`) so this stays deterministically testable, the
 * same reasoning already applied to Batch's own Overdue calculation. No
 * aging threshold/bucket is invented - Q-7's threshold question belongs to
 * Compensation Aging (CO-4), a different report; this returns the raw day
 * count, sorted oldest-first. Rows here are expected to already be
 * filtered to status='Pending' by the caller (repository), same "filtering
 * is the data-access layer's job, math is the service layer's job" split
 * as the rest of this module. */
export function computeCommissionAging(rows: RawCommissionRow[], nowMs: number = Date.now()): CommissionAgingRow[] {
  return rows
    .map((row) => ({
      id: row.id,
      salespersonId: row.salesperson_id,
      salespersonName: row.salesperson ?? "—",
      saleAmount: Number(row.sale_amount) || 0,
      commissionAmount: Number(row.commission_amount) || 0,
      createdAt: row.created_at,
      daysPending: Math.floor((nowMs - new Date(row.created_at).getTime()) / MS_PER_DAY),
    }))
    .sort((a, b) => b.daysPending - a.daysPending);
}
