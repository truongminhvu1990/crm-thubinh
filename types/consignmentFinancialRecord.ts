/** Consignment Financial Record (D11, LOCKED — independent of Compensation,
 * Compensation Ledger, and Money & Debt Ledger; never routed through any of
 * them). One Consignment produces at most one Financial Record (D04) — the
 * DB enforces this via `consignment_id UNIQUE`. Sale Price/Fee/Customer
 * Payable are write-once (D6) — no update path exists anywhere in this
 * module's service layer. */

export interface ConsignmentFinancialRecord {
  id: string;
  consignment_id: string;
  /** Populated by a join when fetched — never write this back. */
  consignment?: {
    id: string;
    consignment_code: string;
    customer_id: string;
    customer?: { id: string; full_name: string; customer_code: string } | null;
  } | null;

  order_id: string;
  order_item_id: string;
  /** Populated by a join when fetched — never write this back. */
  order?: { id: string; order_number: string } | null;

  /** Order Item's own line_total at the moment of Order Completion (D1's
   * Fee Base) — snapshotted here, never re-read live, matching the same
   * write-once discipline already established for Order's own Base Price
   * Snapshot and Compensation's own `calculated_amount`. */
  sale_price: number;
  /** D1, LOCKED: Fee = Sale Price × 10%. */
  fee: number;
  /** D2, LOCKED: Customer Payable = Sale Price − Fee. */
  customer_payable: number;

  created_at?: string;
}
