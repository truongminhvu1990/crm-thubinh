import { NextRequest, NextResponse } from "next/server";
import { createMoneyDebtLedgerCorrection, MoneyDebtLedgerRuleViolationError } from "@/lib/moneyDebtLedger/moneyDebtLedger.service";
import { CreateMoneyDebtLedgerCorrectionInput } from "@/types/moneyDebtLedger";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";

/** Stage 19B — the "Edit voucher" mechanism. Never issues an UPDATE/DELETE
 * against money_debt_ledger_entries (there is no such route anywhere in
 * this module, and the DB trigger blocks it unconditionally regardless).
 * Creates a new Adjustment row carrying the delta and a corrects_entry_id
 * back-reference via create_money_debt_ledger_correction(), which rejects
 * the call if it would take a Money Changer's balance negative. Gated by
 * the same money_debt_ledger.create permission as every other write in
 * this module — a correction is still a ledger write. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.create");
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as CreateMoneyDebtLedgerCorrectionInput;
    const client = createAdminClient();
    const row = await createMoneyDebtLedgerCorrection(body, auth.staff.id, client);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof AdminClientConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof MoneyDebtLedgerRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating Money & Debt Ledger correction:", error);
    return NextResponse.json({ error: "Không thể ghi nhận điều chỉnh" }, { status: 500 });
  }
}
