/** Business Intelligence Dashboard. Reconciled against the now-LOCKED
 * docs/18_BUSINESS_INTELLIGENCE_SPEC.md (Product Owner Implementation
 * Alignment Task, 2026-07-31) — read-only aggregation over existing
 * modules only (Customers, Products, Orders, Partners, Compensation,
 * Settlement, Compensation Ledger), no new business entity, no write path.
 * Every field below corresponds to a CONFIRMED or LOCKED metric in that
 * spec's own Business Metrics Catalog — Conversion Trend, Aging Inventory,
 * Returning Customers, Purchase Frequency, and Running Payout Trend are
 * Future Enhancements there and are deliberately absent from every
 * interface below, not just left uncomputed. */

export interface MonthlyPoint {
  /** "YYYY-MM". */
  month: string;
  value: number;
}

export interface ExecutiveSummary {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  inventoryValue: number;
  totalCompensation: number;
  totalSettlements: number;
}

export interface SalesAnalytics {
  revenueByMonth: MonthlyPoint[];
  ordersByMonth: MonthlyPoint[];
  averageOrderValue: number;
}

export interface InventoryAnalytics {
  inventoryValue: number;
  productsAvailable: number;
  productsReserved: number;
  productsSold: number;
}

export interface PartnerAnalyticsRow {
  partner_id: string;
  partner_name: string;
  revenue: number;
  orders: number;
  compensation: number;
  settlement: number;
}

export interface PartnerAnalytics {
  rows: PartnerAnalyticsRow[];
}

export interface TopCustomerRow {
  customer_id: string;
  full_name: string;
  customer_code: string;
  revenue: number;
  orders: number;
}

export interface CustomerAnalytics {
  newCustomers: number;
  topCustomers: TopCustomerRow[];
}

export interface SettlementStatusRow {
  status: string;
  count: number;
  amount: number;
}

export interface FinancialAnalytics {
  compensationPaid: number;
  outstandingCompensation: number;
  settlementStatus: SettlementStatusRow[];
  ledgerEntryCount: number;
  ledgerEntryTotal: number;
}
