import { MoneyDebtLedgerEntry } from "@/types/moneyDebtLedger";

/** Shared presentation-only helpers for Money & Debt Ledger UI (table,
 * detail modal, mobile cards) — no business logic, no write path, purely
 * derived from fields getLedgerEntries() already returns. */

/** Resolves the Supplier for a "Supplier Payment via Money Changer" row
 * regardless of which of its 2 paired legs this is: the Supplier's own leg
 * carries it directly as `party`; the Money Changer's leg only has it via
 * `group_counterparty` (same transaction_group, resolved read-only in the
 * service layer). Every other transaction_type returns null. */
export function resolveSupplier(entry: MoneyDebtLedgerEntry): MoneyDebtLedgerEntry["party"] | null {
  if (entry.transaction_type !== "Supplier Payment via Money Changer") return null;
  if (entry.party_type === "Supplier") return entry.party ?? null;
  return entry.group_counterparty ?? null;
}

/** Resolves the Money Changer for a "Supplier Payment via Money Changer"
 * row, mirroring resolveSupplier — used by the detail modal, which (unlike
 * the table's own dedicated Money Changer/Đối tượng column) needs this
 * explicitly labeled regardless of which leg is being viewed. */
export function resolveMoneyChangerForSupplierPayment(entry: MoneyDebtLedgerEntry): MoneyDebtLedgerEntry["party"] | null {
  if (entry.transaction_type !== "Supplier Payment via Money Changer") return null;
  if (entry.party_type === "Money Changer") return entry.party ?? null;
  return entry.group_counterparty ?? null;
}

/** The CNY amount for a "Supplier Payment via Money Changer" transaction,
 * regardless of which leg is being viewed — the CNY leg's own `amount` is
 * it directly; the VND leg has to derive it from its own VND amount ÷
 * fx_rate (never re-entered, always the same snapshot rate both legs
 * share). */
export function resolveSupplierPaymentCnyAmount(entry: MoneyDebtLedgerEntry): number | null {
  if (entry.transaction_type !== "Supplier Payment via Money Changer") return null;
  if (entry.currency === "CNY") return entry.amount;
  if (!entry.fx_rate) return null;
  return entry.amount / entry.fx_rate;
}

/** The VND-equivalent amount for the same transaction — the VND leg's own
 * `amount` directly, or derived for the CNY leg via its snapshot fx_rate. */
export function resolveSupplierPaymentVndAmount(entry: MoneyDebtLedgerEntry): number | null {
  if (entry.transaction_type !== "Supplier Payment via Money Changer") return null;
  if (entry.currency === "VND") return entry.amount;
  if (!entry.fx_rate) return null;
  return entry.amount * entry.fx_rate;
}
