import { NextRequest, NextResponse } from "next/server";
import {
  validateOperatingExpenseInput,
  updateOperatingExpense,
  deleteOperatingExpense,
} from "@/lib/operatingExpenses/operatingExpenses.service";
import { createClient } from "@/lib/supabase/server";
import { authorizeExpenseWrite } from "../_authorization";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeExpenseWrite(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const validated = validateOperatingExpenseInput(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const client = await createClient();
  const expense = await updateOperatingExpense(id, validated.input, client);
  if (!expense) return NextResponse.json({ error: "Lỗi khi cập nhật chi phí" }, { status: 500 });
  return NextResponse.json(expense);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeExpenseWrite(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const ok = await deleteOperatingExpense(id, client);
  if (!ok) return NextResponse.json({ error: "Lỗi khi xóa chi phí" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
