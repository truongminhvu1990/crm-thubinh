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
  // Stage 19 — automatic-sync only, never in MONEY_DEBT_LEDGER_CREATABLE_TYPE_OPTIONS
  // (same exclusion shape as 'Buy CNY' above): no manual create path exists for this type.
  { value: "Customer Payment via Money Changer", label: "Thanh toán khách hàng qua Money Changer" },
  // Stage 19B — paired write, its own dedicated modal (same exclusion shape
  // as 'Buy CNY'): never in MONEY_DEBT_LEDGER_CREATABLE_TYPE_OPTIONS.
  { value: "Supplier Payment via Money Changer", label: "Thanh toán nhà cung cấp qua Money Changer" },
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

/** Production `payments.payment_method` text values that represent the
 * TECH_H channel (2026-08-16 Product Owner decision, post read-only
 * Production audit). `payments.payment_method` is plain text with no FK to
 * `master_data` — a payment's stored value never changes once written, even
 * if the `master_data` option is later renamed. Production's real
 * historical data already existed under two spellings before this ledger
 * was ever built: "Tech_H" (12 payments, still the current canonical
 * `master_data` option) and "TechH" (4 payments, a legacy value with no
 * matching `master_data` row at all). Neither was ever "TECH_H" — that
 * spelling has zero historical Production payments and is deliberately NOT
 * included here, so a caller cannot silently pick up a spelling that was
 * never real data. This list is intentionally the exact, narrow historical
 * set — not a case-insensitive match, not a "contains Tech" match — per
 * explicit Product Owner instruction not to broaden matching beyond what
 * was verified against real data. Unrelated existing methods ("Tech_HKD",
 * "Tech_B") are distinct payment channels and are correctly excluded.
 *
 * Independent of `money_debt_ledger_entries.transaction_type`'s own literal
 * 'Customer Payment TECH_H' value (a different table/column, always that
 * exact string regardless of which payment-method spelling it reconciles). */
export const TECH_H_PAYMENT_METHODS: readonly string[] = ["Tech_H", "TechH"];
