import { SupabaseClient } from "@supabase/supabase-js";
import {
  EXPENSE_CATEGORIES,
  OperatingExpense,
  OperatingExpenseFilters,
  OperatingExpenseInput,
} from "@/types/operatingExpenses";
import * as repo from "./operatingExpenses.repository";

export async function getOperatingExpenses(
  filters: OperatingExpenseFilters,
  client?: SupabaseClient
): Promise<OperatingExpense[]> {
  return repo.getOperatingExpenses(filters, client);
}

export async function getOperatingExpensesTotal(filters: OperatingExpenseFilters, client?: SupabaseClient): Promise<number> {
  return repo.getOperatingExpensesTotal(filters, client);
}

/** Shared by the create (POST) and edit (PATCH) endpoints - the one place
 * that decides what makes an expense entry valid, so the two routes can
 * never drift apart on validation. */
export function validateOperatingExpenseInput(
  body: Record<string, unknown>
): { input: OperatingExpenseInput } | { error: string } {
  if (typeof body.expense_date !== "string" || !body.expense_date) {
    return { error: "Ngày chi phí là bắt buộc" };
  }
  if (typeof body.category !== "string" || !EXPENSE_CATEGORIES.includes(body.category as OperatingExpenseInput["category"])) {
    return { error: "Danh mục không hợp lệ" };
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Số tiền phải là một số không âm" };
  }

  return {
    input: {
      expense_date: body.expense_date,
      category: body.category as OperatingExpenseInput["category"],
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      amount,
    },
  };
}

export async function createOperatingExpense(
  input: OperatingExpenseInput,
  createdBy: string,
  client?: SupabaseClient
): Promise<OperatingExpense | null> {
  return repo.createOperatingExpense(input, createdBy, client);
}

export async function updateOperatingExpense(
  id: string,
  input: OperatingExpenseInput,
  client?: SupabaseClient
): Promise<OperatingExpense | null> {
  return repo.updateOperatingExpense(id, input, client);
}

export async function deleteOperatingExpense(id: string, client?: SupabaseClient): Promise<boolean> {
  return repo.deleteOperatingExpense(id, client);
}
