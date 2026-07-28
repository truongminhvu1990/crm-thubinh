import { NextRequest, NextResponse } from "next/server";
import {
  getOperatingExpenses,
  getOperatingExpensesTotal,
  validateOperatingExpenseInput,
  createOperatingExpense,
} from "@/lib/operatingExpenses/operatingExpenses.service";
import { OperatingExpenseFilters } from "@/types/operatingExpenses";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { authorizeExpenseWrite } from "./_authorization";

/** Expense Management (Product Owner Decision, 2026-07-28). GET is view-only
 * for any authenticated staff member (Staff role included, per approval's
 * "Staff: View only" tier) - only the write endpoints below are
 * Owner/Manager-gated. */
export async function GET(request: NextRequest) {
  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const filters: OperatingExpenseFilters = {
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    month: searchParams.get("month") ?? undefined,
  };

  const client = await createClient();
  const [rows, total] = await Promise.all([
    getOperatingExpenses(filters, client),
    getOperatingExpensesTotal(filters, client),
  ]);
  return NextResponse.json({ rows, total });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeExpenseWrite(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const validated = validateOperatingExpenseInput(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const client = await createClient();
  const expense = await createOperatingExpense(validated.input, auth.staff.id, client);
  if (!expense) return NextResponse.json({ error: "Lỗi khi tạo chi phí" }, { status: 500 });
  return NextResponse.json(expense, { status: 201 });
}
