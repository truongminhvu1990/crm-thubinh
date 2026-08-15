import { CustomerReconciliationRow, ReportsReconciliation, ReconciliationStatus } from "@/types/reportsReconciliation";

// Pure merge/comparison logic only, separated from data access
// (reportsReconciliation.service.ts, which calls the two live systems'
// own existing functions) so it's directly unit-testable with plain
// values - no revenue is recomputed here, only compared.

const TOP_N = 10;

export interface ReconciliationTopCustomerInput {
  customerId: string;
  customerName: string;
  customerCode: string;
  revenue: number;
}

export function mergeReconciliation(
  reportsRevenue: number,
  biRevenue: number,
  reportsTopCustomers: ReconciliationTopCustomerInput[],
  biTopCustomers: ReconciliationTopCustomerInput[]
): ReportsReconciliation {
  const delta = reportsRevenue - biRevenue;
  const deltaPercent = biRevenue !== 0 ? (delta / biRevenue) * 100 : null;
  const status: ReconciliationStatus = delta === 0 ? "Reconciled" : "Discrepancy Found";

  const merged = new Map<string, CustomerReconciliationRow>();
  for (const c of reportsTopCustomers) {
    merged.set(c.customerId, {
      customerId: c.customerId,
      customerName: c.customerName,
      customerCode: c.customerCode,
      reportsRevenue: c.revenue,
      biRevenue: null,
      delta: c.revenue,
    });
  }
  for (const c of biTopCustomers) {
    const existing = merged.get(c.customerId);
    if (existing) {
      existing.biRevenue = c.revenue;
      existing.delta = existing.reportsRevenue! - c.revenue;
    } else {
      merged.set(c.customerId, {
        customerId: c.customerId,
        customerName: c.customerName,
        customerCode: c.customerCode,
        reportsRevenue: null,
        biRevenue: c.revenue,
        delta: -c.revenue,
      });
    }
  }

  const topCustomers = [...merged.values()]
    .sort((a, b) => Math.max(b.reportsRevenue ?? 0, b.biRevenue ?? 0) - Math.max(a.reportsRevenue ?? 0, a.biRevenue ?? 0))
    .slice(0, TOP_N);

  return {
    revenue: { reportsRevenue, biRevenue, delta, deltaPercent, status },
    topCustomers,
  };
}
