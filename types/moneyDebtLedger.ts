/** Money & Debt Ledger (docs/19_MONEY_DEBT_LEDGER_SPEC.md, DRAFT Rev 1).
 * Owns money-movement records for Money Changer/Supplier counterparties
 * only — never replaces Payment, Order, Compensation, Settlement, or
 * Compensation Ledger (§3/§5). Every row is immutable once created (D7) —
 * there is no update/delete function anywhere in lib/moneyDebtLedger/. */

export type MoneyDebtLedgerTransactionType =
  | "Customer Payment TECH_H"
  | "VND Held By Money Changer"
  | "Buy CNY"
  | "CNY Held By Supplier"
  | "Deposit"
  | "Deposit Consumed"
  | "Supplier Payment"
  | "Adjustment"
  /** Stage 19 (Product Owner Locked Business Contract, 2026-08-17) — the
   * generic, automatic-sync counterpart to the historical-only
   * "Customer Payment TECH_H". Created exclusively by
   * sync_payment_to_money_debt_ledger()/create_payment_with_ledger_sync()
   * (supabase/migrations/2026081721_money_debt_ledger_automatic_sync.sql)
   * — never manually selectable in RecordMovementModal's dropdown, never
   * hand-written elsewhere. Eligibility is derived purely from
   * payment.receiving_account_id -> receiving_accounts
   * .money_changer_partner_id; never from payment_method text, bank name,
   * owner name, or any hardcoded H/K pattern. */
  | "Customer Payment via Money Changer"
  /** Stage 19B (Product Owner "COMPLETE MONEY/DEBT BUSINESS FLOW",
   * 2026-08-17) — a Money Changer's VND pool pays a Supplier in CNY.
   * Created exclusively by create_supplier_payment_via_money_changer()
   * (supabase/migrations/2026081722_..._supplier_payment_and_correction.sql)
   * as a paired transaction (same transaction_group/fx_rate mechanism as
   * 'Buy CNY'): one VND OUT row against the Money Changer, one CNY OUT row
   * against the Supplier. Never manually selectable in RecordMovementModal's
   * plain dropdown — has its own dedicated modal, same shape as Buy CNY. */
  | "Supplier Payment via Money Changer";

export type MoneyDebtLedgerPartyType = "Money Changer" | "Supplier";
export type MoneyDebtLedgerCurrency = "VND" | "CNY";
export type MoneyDebtLedgerDirection = "IN" | "OUT";
export type MoneyDebtLedgerStatus = "Recorded";

export interface MoneyDebtLedgerEntry {
  id: string;
  entry_code: string;

  transaction_date: string;
  transaction_type: MoneyDebtLedgerTransactionType;

  party_type: MoneyDebtLedgerPartyType;
  party_id: string;
  /** Populated by a join when fetched with party — never write this back. */
  party?: { id: string; name: string; partner_code: string; partner_type: string } | null;
  /** The OTHER leg's party for a paired transaction (same transaction_group,
   * different party_id) — e.g. on a "Supplier Payment via Money Changer"
   * Money-Changer-leg row, this is the Supplier. Null for single-row
   * transaction types. Resolved read-only from transaction_group, never
   * written back, never a new column. */
  group_counterparty?: { id: string; name: string; partner_code: string; partner_type: string } | null;

  currency: MoneyDebtLedgerCurrency;
  amount: number;
  direction: MoneyDebtLedgerDirection;

  /** Only present on 'Buy CNY' rows — the two rows of one BUY_CNY business
   * transaction share the same value (D4/§10). */
  transaction_group: string | null;
  /** Only present on 'Buy CNY' rows (§22). */
  fx_rate: number | null;

  linked_payment_id: string | null;
  linked_order_id: string | null;
  /** Populated by a join when fetched with payment/order — never write back. */
  payment?: {
    id: string;
    amount: number;
    payment_method: string;
    receiving_account?: { id: string; account_number: string; label: string | null; bank?: { value: string } | null } | null;
  } | null;
  order?: { id: string; order_number: string; customer?: { id: string; full_name: string } | null } | null;

  reference: string | null;
  note: string | null;
  status: MoneyDebtLedgerStatus;

  /** Stage 19B — set only on correction Adjustment rows (created via
   * create_money_debt_ledger_correction()); points at the entry being
   * corrected. Null on every other row, including the entry being
   * corrected itself — the original is never modified (D7). */
  corrects_entry_id: string | null;

  created_by: string | null;
  /** Populated by a join when fetched with created_by_staff — never write back. */
  created_by_staff?: { id: string; full_name: string } | null;
  created_at: string;
}

/** Input for the single-row write path (every type except 'Buy CNY') — maps
 * 1:1 to create_money_debt_ledger_entry()'s own parameters. `direction` is
 * only honored by that function for 'VND Held By Money Changer' and
 * 'Adjustment' — every other type derives its own direction server-side. */
export interface CreateMoneyDebtLedgerEntryInput {
  transaction_type: Exclude<MoneyDebtLedgerTransactionType, "Buy CNY">;
  party_id: string;
  party_type: MoneyDebtLedgerPartyType;
  currency: MoneyDebtLedgerCurrency;
  amount: number;
  direction?: MoneyDebtLedgerDirection;
  transaction_date?: string;
  linked_payment_id?: string | null;
  linked_order_id?: string | null;
  reference?: string | null;
  note?: string | null;
}

/** Input for the Stage 19B paired write path — maps 1:1 to
 * create_supplier_payment_via_money_changer()'s own parameters. VND amount
 * is never supplied by the caller; it's always cny_amount x fx_rate,
 * computed server-side so the two can never drift. */
export interface CreateSupplierPaymentViaMoneyChangerInput {
  money_changer_partner_id: string;
  supplier_partner_id: string;
  cny_amount: number;
  fx_rate: number;
  transaction_date?: string;
  reference?: string | null;
  note?: string | null;
}

/** Input for the Stage 19B "Edit voucher" mechanism — maps 1:1 to
 * create_money_debt_ledger_correction()'s own parameters. `amount`/
 * `direction` describe the delta to apply, not a restated total (§ the
 * migration's own doc comment). */
export interface CreateMoneyDebtLedgerCorrectionInput {
  corrects_entry_id: string;
  amount: number;
  direction: MoneyDebtLedgerDirection;
  reference?: string | null;
  note?: string | null;
}

/** Input for the paired D4 write path — maps 1:1 to
 * create_buy_cny_ledger_transaction()'s own parameters. */
export interface CreateBuyCnyLedgerTransactionInput {
  party_id: string;
  vnd_amount: number;
  cny_amount: number;
  fx_rate: number;
  transaction_date?: string;
  reference?: string | null;
  note?: string | null;
}

export interface MoneyDebtLedgerBalance {
  party_id: string;
  currency: MoneyDebtLedgerCurrency;
  total_in: number;
  total_out: number;
  balance: number;
}

/** Stage 5 (Product Owner Locked Decisions, 2026-08-16), Phase 5 — the
 * unified reconciliation candidate shape, covering both detection paths
 * (Phase 4): historical TECH_H/TechH (payment_method-based, unchanged) and
 * the new generic Receiving-Account-based path
 * (receiving_account.money_changer_partner_id IS NOT NULL). Historical
 * candidates always have receiving_account_id/money_changer_partner_id
 * null — that is a valid, expected state (Phase 5's own instruction: "Do
 * not fabricate receiving-account information"), not an error. */
export interface MoneyDebtReconciliationCandidate {
  id: string;
  order_id: string;
  payment_method: string;
  amount: number;
  payment_date: string;
  already_reconciled: number;
  remaining: number;
  order?: { id: string; order_number: string; customer?: { id: string; full_name: string } | null } | null;

  receiving_account_id: string | null;
  bank: string | null;
  account_owner: string | null;
  account_currency: string | null;
  account_label: string | null;
  account_number: string | null;
  money_changer_partner_id: string | null;
  money_changer_name: string | null;
}
