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
  | "Adjustment";

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
  payment?: { id: string; amount: number; payment_method: string } | null;
  order?: { id: string; order_number: string } | null;

  reference: string | null;
  note: string | null;
  status: MoneyDebtLedgerStatus;

  created_by: string | null;
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
