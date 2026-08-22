/** Settlement (docs/14_SETTLEMENT_SPEC.md, LOCKED Rev 3). Settlement owns
 * Settlement Request/Status/Approval/Completion only — never Partner,
 * Customer, Order, Product, Compensation, or Ledger data (§2).
 *
 * Relationship (Product Owner Revision, 2026-07-31, Decision 1 — supersedes
 * the prior 1:1 design): Settlement 1:N Settlement Items N:1 Compensation.
 * A Compensation belongs to at most one Settlement Item, system-wide
 * (Decision 5). */

export type SettlementStatus = "Draft" | "Pending" | "Approved" | "Completed" | "Paid" | "Cancelled";
export type SettlementMethod = "Bank Transfer" | "Cash" | "Internal Balance";

export interface SettlementItem {
  id: string;
  settlement_id: string;
  compensation_id: string;
  /** Finance Project #1, Phase B (Product Owner Approval, 2026-08-21) —
   * false once cancel_settlement_with_reversal() reverts this item's own
   * Compensation back to Confirmed. The row itself is never deleted (full
   * audit history of what a cancelled Settlement originally bundled stays
   * queryable) — is_active only controls whether it still "claims" its
   * Compensation for Decision 5's at-most-one-active-Settlement-Item rule
   * (see the partial unique index in
   * 2026082102_settlement_cancellation_reversal.sql). Defaults to true;
   * only the RPC above can ever set it false. */
  is_active?: boolean;
  /** Populated by a join when fetched — never write this back. */
  compensation?: {
    id: string;
    compensation_code: string;
    compensation_type: string;
    calculated_amount: number;
    status: string;
    order?: { id: string; order_number: string } | null;
    customer?: { id: string; full_name: string } | null;
  } | null;
  created_at?: string;
}

export interface Settlement {
  id: string;
  settlement_code: string;

  recipient_type: string;
  partner_id: string | null;
  /** Populated by a join when fetched with partner — never write this back. */
  partner?: { id: string; name: string; partner_code: string; partner_type: string; status: string } | null;

  /** All Settlement Items for this Settlement (Decision 3: Detail must
   * display all of them). */
  items: SettlementItem[];
  /** Decision 4: always SUM(items[].compensation.calculated_amount) —
   * computed by the service layer at read time, never a stored/editable
   * column, never set directly by any write path. */
  total_amount: number;

  settlement_method: string;

  status: SettlementStatus;
  requested_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  cancelled_at?: string | null;

  /** Finance Project #1, Phase A (Product Owner Approval, 2026-08-21) —
   * Completed -> Paid, the only transition mark_settlement_paid() can make.
   * Never writable except through that RPC (RLS rejects a direct client
   * UPDATE landing status='Paid' — see 2026082101_settlement_paid_module.sql). */
  paid_at?: string | null;
  paid_by?: string | null;
  payment_reference?: string | null;
  receiving_account_id?: string | null;
  /** Populated by a join when fetched — never write this back. */
  receiving_account?: { id: string; account_number: string; currency: string; label: string | null } | null;

  created_at?: string;
  updated_at?: string;
}
