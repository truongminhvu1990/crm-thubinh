import { MoneyDebtLedgerCurrency } from "@/types/moneyDebtLedger";

/** Supplier Balance (Finance Project #1, Phase F re-scope, Product Owner
 * Approval 2026-08-21 — supersedes the original "Supplier Payable" ask).
 * Read directly from `money_debt_ledger_entries` (party_type='Supplier') —
 * the only existing Supplier-side financial source of truth in this
 * codebase (verified 2026-08-21: no Purchase/Purchase-Order/Supplier-
 * Invoice entity exists anywhere). Balance = Σ IN − Σ OUT, the exact same
 * formula/pattern lib/moneyDebtLedger/moneyDebtLedger.service.ts's own
 * getBalance()/getAllBalances() already use — never re-derived differently
 * here.
 *
 * This is explicitly a BALANCE, never "Payable"/"Receivable"/"Amount
 * Owed"/"Outstanding" — PO-D4 (docs/19_MONEY_DEBT_LEDGER_SPEC.md, "Asset
 * vs. Payable classification") is still an unresolved, deferred Product
 * Owner decision. Positive or negative `balance` carries NO asset/payable
 * meaning anywhere in this module — do not add one. No purchase total, no
 * purchase reference, no purchase date: none of that data exists. */
export interface SupplierBalanceFilters {
  searchTerm?: string;
  currency?: MoneyDebtLedgerCurrency;
}

export interface SupplierBalanceRow {
  partyId: string;
  supplierName: string;
  supplierCode: string;
  currency: MoneyDebtLedgerCurrency;
  totalIn: number;
  totalOut: number;
  /** Σ IN − Σ OUT. Semantically neutral — see this file's own header
   * comment. */
  balance: number;
  lastTransactionDate: string | null;
  transactionCount: number;
}

export interface SupplierBalanceSummary {
  supplierCount: number;
  rowCount: number;
}

export interface SupplierBalancePage {
  rows: SupplierBalanceRow[];
  summary: SupplierBalanceSummary;
}
