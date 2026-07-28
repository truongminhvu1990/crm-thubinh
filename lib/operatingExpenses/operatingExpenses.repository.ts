import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { OperatingExpense, OperatingExpenseFilters, OperatingExpenseInput } from "@/types/operatingExpenses";

// Raw data access only, against the new operating_expenses table
// (supabase/migrations/20260809_operating_expenses_module.sql). created_by is
// enriched with the staff member's full_name for display, same "join staff,
// take first_name" shape used elsewhere in this codebase (e.g.
// getActivityLogsByEntity in lib/activityLog.service.ts).

interface ExpenseRow {
  id: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  staff: { full_name: string } | { full_name: string }[] | null;
}

const EXPENSE_COLUMNS =
  "id, expense_date, category, description, amount, created_by, created_at, updated_at, staff:created_by(full_name)";

function firstStaffName(staff: ExpenseRow["staff"]): string | null {
  if (!staff) return null;
  return Array.isArray(staff) ? staff[0]?.full_name ?? null : staff.full_name;
}

function toExpense(row: ExpenseRow): OperatingExpense {
  return {
    id: row.id,
    expense_date: row.expense_date,
    category: row.category as OperatingExpense["category"],
    description: row.description,
    amount: Number(row.amount) || 0,
    created_by: row.created_by,
    created_by_name: firstStaffName(row.staff),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Same [start, end) month-shortcut math as
 * monthlySoldProducts.repository.ts's own resolveMonthRange - kept as a
 * separate small copy rather than a shared import, since the two modules'
 * date filters are otherwise independent (this one has no
 * salesperson/category/customer filters at all). */
function resolveMonthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = new Date(y, m, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDateFilters(query: any, filters: OperatingExpenseFilters): any {
  const monthRange = filters.month ? resolveMonthRange(filters.month) : null;
  const dateFrom = monthRange?.start ?? filters.dateFrom;
  const dateTo = monthRange?.end ?? filters.dateTo;
  if (dateFrom) query = query.gte("expense_date", dateFrom);
  if (dateTo) query = query.lt("expense_date", dateTo);
  return query;
}

export async function getOperatingExpenses(
  filters: OperatingExpenseFilters,
  client: SupabaseClient = supabase
): Promise<OperatingExpense[]> {
  let query = client.from("operating_expenses").select(EXPENSE_COLUMNS);
  query = applyDateFilters(query, filters);
  query = query.order("expense_date", { ascending: false }).order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching operating expenses:", error);
    return [];
  }
  return ((data as unknown as ExpenseRow[]) || []).map(toExpense);
}

/** Backs both the Expense Management section's own "Total Operating
 * Expenses" stat and the main report's Profit/Loss formula (Total Revenue -
 * Product Cost - Operating Expenses) - date-range-only, deliberately ignoring
 * product/salesperson/customer filters (expenses are a period-level cost,
 * not tied to any one product/staff dimension). */
export async function getOperatingExpensesTotal(
  filters: OperatingExpenseFilters,
  client: SupabaseClient = supabase
): Promise<number> {
  let query = client.from("operating_expenses").select("amount");
  query = applyDateFilters(query, filters);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching operating expenses total:", error);
    return 0;
  }
  return ((data as { amount: number }[]) || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

export async function createOperatingExpense(
  input: OperatingExpenseInput,
  createdBy: string,
  client: SupabaseClient = supabase
): Promise<OperatingExpense | null> {
  const { data, error } = await client
    .from("operating_expenses")
    .insert({
      expense_date: input.expense_date,
      category: input.category,
      description: input.description || null,
      amount: input.amount,
      created_by: createdBy,
    })
    .select(EXPENSE_COLUMNS)
    .single();
  if (error || !data) {
    console.error("Error creating operating expense:", error);
    return null;
  }
  return toExpense(data as unknown as ExpenseRow);
}

/** Edit/Delete are both permitted (no append-only requirement per the
 * Product Owner's Expense Management approval) - updated_at is maintained
 * here explicitly rather than by a DB trigger, matching this codebase's
 * existing "application sets its own timestamps" convention. */
export async function updateOperatingExpense(
  id: string,
  input: OperatingExpenseInput,
  client: SupabaseClient = supabase
): Promise<OperatingExpense | null> {
  const { data, error } = await client
    .from("operating_expenses")
    .update({
      expense_date: input.expense_date,
      category: input.category,
      description: input.description || null,
      amount: input.amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(EXPENSE_COLUMNS)
    .single();
  if (error || !data) {
    console.error("Error updating operating expense:", error);
    return null;
  }
  return toExpense(data as unknown as ExpenseRow);
}

export async function deleteOperatingExpense(id: string, client: SupabaseClient = supabase): Promise<boolean> {
  const { error } = await client.from("operating_expenses").delete().eq("id", id);
  if (error) {
    console.error("Error deleting operating expense:", error);
    return false;
  }
  return true;
}
