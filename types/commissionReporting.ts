/** ST-3 / ST-4 — Commission Reporting (docs/07_REPORTING_SPEC.md §8,
 * restating docs/06_COMMISSION_SPEC.md §16 LOCKED). A Reporting-owned
 * Projection directly over `sales_commissions` — never via Commission's
 * own `getDashboardCommissionStats()` (Decision 2, explicit ban). */

export interface CommissionBySalespersonRow {
  salespersonId: string | null;
  salespersonName: string;
  dealCount: number;
  totalSaleAmount: number;
  totalCommissionAmount: number;
  averageCommissionAmount: number;
}

export interface CommissionAgingRow {
  id: string;
  salespersonId: string | null;
  salespersonName: string;
  saleAmount: number;
  commissionAmount: number;
  createdAt: string;
  daysPending: number;
}
