export interface CommissionRule {
  id: string;
  minimum_amount: number;
  maximum_amount: number | null;
  commission_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CommissionStatus = "Pending" | "Approved" | "Paid";

export interface SalesCommission {
  id: string;
  /** Snapshot foreign key - not a live FK, see the migration file header. */
  purchase_id: string;
  customer_id: string;
  salesperson: string | null;
  salesperson_id: string | null;
  sale_amount: number;
  commission_percent: number;
  commission_amount: number;
  status: CommissionStatus;
  paid_at: string | null;
  paid_by: string | null;
  note: string | null;
  created_at: string;
  /** Resolved at read time for display only (Feature 1's "Customer" column) -
   * never used in the commission calculation itself. Absent if the source
   * customer no longer exists. */
  customer?: { full_name: string; customer_code: string } | null;
}

export interface CommissionListFilters {
  dateFrom?: string;
  dateTo?: string;
  salesperson?: string;
  status?: CommissionStatus;
}

export interface CommissionSummary {
  totalCommission: number;
  pending: number;
  approved: number;
  paid: number;
}
