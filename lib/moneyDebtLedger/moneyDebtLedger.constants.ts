import { MoneyDebtLedgerTransactionType, MoneyDebtLedgerCurrency } from "@/types/moneyDebtLedger";

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §9 — the 8 flows this module supports.
 * 'Buy CNY' is excluded from the plain create-entry dropdown (it always
 * goes through the dedicated Buy CNY flow, since it produces 2 rows, never
 * 1) — see MoneyDebtLedgerFilters for the full 8-value filter list. */
export const MONEY_DEBT_LEDGER_CREATABLE_TYPE_OPTIONS: { value: Exclude<MoneyDebtLedgerTransactionType, "Buy CNY">; label: string }[] = [
  { value: "Customer Payment TECH_H", label: "Đối soát thanh toán TECH_H" },
  { value: "VND Held By Money Changer", label: "VND đang giữ tại đơn vị đổi tiền" },
  { value: "CNY Held By Supplier", label: "CNY đang giữ tại nhà cung cấp" },
  { value: "Deposit", label: "Đặt cọc CNY" },
  { value: "Deposit Consumed", label: "Sử dụng tiền đặt cọc" },
  { value: "Supplier Payment", label: "Thanh toán nhà cung cấp" },
  { value: "Adjustment", label: "Điều chỉnh" },
];

export const MONEY_DEBT_LEDGER_ALL_TYPE_OPTIONS: { value: MoneyDebtLedgerTransactionType; label: string }[] = [
  { value: "Customer Payment TECH_H", label: "Đối soát thanh toán TECH_H" },
  { value: "VND Held By Money Changer", label: "VND đang giữ tại đơn vị đổi tiền" },
  { value: "Buy CNY", label: "Mua CNY" },
  { value: "CNY Held By Supplier", label: "CNY đang giữ tại nhà cung cấp" },
  { value: "Deposit", label: "Đặt cọc CNY" },
  { value: "Deposit Consumed", label: "Sử dụng tiền đặt cọc" },
  { value: "Supplier Payment", label: "Thanh toán nhà cung cấp" },
  { value: "Adjustment", label: "Điều chỉnh" },
];

export const MONEY_DEBT_LEDGER_CURRENCY_OPTIONS: { value: MoneyDebtLedgerCurrency; label: string }[] = [
  { value: "VND", label: "VND" },
  { value: "CNY", label: "CNY" },
];

export function moneyDebtLedgerTypeLabel(type: string): string {
  return MONEY_DEBT_LEDGER_ALL_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

/** Types where the caller chooses IN/OUT — every other type's direction is
 * derived server-side (create_money_debt_ledger_entry(), §9). Kept here so
 * the UI only offers a direction picker when it's meaningful. */
export const MONEY_DEBT_LEDGER_CALLER_CHOOSES_DIRECTION: readonly string[] = ["VND Held By Money Changer", "Adjustment"];
