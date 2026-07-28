// Operating Expenses (Monthly Sold Products Report - Expense Management,
// Product Owner Decision, 2026-07-28). Fixed category list per approval
// ("Do NOT create a lookup table") - the 5 literal values below are
// exhaustive, not a starter set.
export type ExpenseCategory = "Advertising" | "Shipping" | "Packaging" | "Gifts" | "Other Expenses";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Advertising",
  "Shipping",
  "Packaging",
  "Gifts",
  "Other Expenses",
];

export interface OperatingExpense {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperatingExpenseFilters {
  dateFrom?: string;
  dateTo?: string;
  /** Same "this calendar month" shortcut as MonthlySoldProductsFilters -
   * overrides dateFrom/dateTo with that month's [start, end) bounds when set.
   * Format YYYY-MM. */
  month?: string;
}

export interface OperatingExpenseInput {
  expense_date: string;
  category: ExpenseCategory;
  description?: string | null;
  amount: number;
}
