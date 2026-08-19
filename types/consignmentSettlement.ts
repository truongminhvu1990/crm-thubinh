/** Consignment Settlement (D8/D03, LOCKED). Extends the existing
 * Settlement architecture's *pattern* only — same lifecycle shape as
 * `docs/14_SETTLEMENT_SPEC.md`, same principles (Separation of
 * Responsibility, Traceability, Auditability, Finalization,
 * Extensibility) — but is a structurally SEPARATE table/service from the
 * existing Compensation-facing `settlements`/`settlement_items`. Confirmed
 * necessary (not merely a preference) by direct inspection of
 * lib/settlement/settlement.service.ts: that service hard-codes
 * `recipient_type: "Partner"`, imports Compensation's own service
 * directly, and `settlement_items.compensation_id` is a NOT NULL UNIQUE FK
 * typed exclusively to `compensations(id)` — none of which can be reused
 * without modifying already-shipped Settlement code, which D03 explicitly
 * forbids. The payee here is the Consignor (Customer, D9), never a
 * Partner — this is the one structural field that differs from the
 * existing Settlement shape. */

export type ConsignmentSettlementStatus = "Draft" | "Pending" | "Approved" | "Completed" | "Cancelled";
export type ConsignmentSettlementMethod = "Bank Transfer" | "Cash" | "Internal Balance";

export interface ConsignmentSettlementItem {
  id: string;
  consignment_settlement_id: string;
  consignment_financial_record_id: string;
  /** Populated by a join when fetched — never write this back. */
  consignment_financial_record?: {
    id: string;
    customer_payable: number;
    consignment?: { id: string; consignment_code: string } | null;
    order?: { id: string; order_number: string } | null;
  } | null;
  created_at?: string;
}

export interface ConsignmentSettlement {
  id: string;
  settlement_code: string;

  customer_id: string;
  /** Populated by a join when fetched — never write this back. */
  customer?: { id: string; full_name: string; customer_code: string } | null;

  items: ConsignmentSettlementItem[];
  /** Always SUM(items[].consignment_financial_record.customer_payable) —
   * computed by the service layer at read time, never a stored column,
   * mirroring Settlement's own `total_amount` convention exactly
   * (settlement.service.ts's computeTotal()). */
  total_amount: number;

  settlement_method: string;

  status: ConsignmentSettlementStatus;
  requested_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  cancelled_at?: string | null;

  created_at?: string;
  updated_at?: string;
}
