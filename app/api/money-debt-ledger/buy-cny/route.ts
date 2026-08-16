import { NextRequest, NextResponse } from "next/server";
import { createBuyCnyTransaction, MoneyDebtLedgerRuleViolationError } from "@/lib/moneyDebtLedger/moneyDebtLedger.service";
import { CreateBuyCnyLedgerTransactionInput } from "@/types/moneyDebtLedger";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §14/D4 — BUY_CNY's own paired write
 * path, kept separate from POST /api/money-debt-ledger since it always
 * produces exactly 2 rows (one VND OUT, one CNY IN) sharing one
 * transaction_group, created atomically by the
 * create_buy_cny_ledger_transaction() database function.
 *
 * 2026-08-16 EXECUTE-privilege fix: same as POST /api/money-debt-ledger —
 * this RPC now only grants EXECUTE to `service_role`, so this call MUST
 * use lib/supabase/admin.ts's createAdminClient() (server-only, the
 * project's existing pattern), never the session-bound client.
 * requirePermission() above is unchanged and still runs first. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.create");
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as CreateBuyCnyLedgerTransactionInput;
    const client = createAdminClient();
    const rows = await createBuyCnyTransaction(body, auth.staff.id, client);
    return NextResponse.json(rows, { status: 201 });
  } catch (error) {
    if (error instanceof AdminClientConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof MoneyDebtLedgerRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating Buy CNY ledger transaction:", error);
    return NextResponse.json({ error: "Không thể ghi nhận giao dịch mua CNY" }, { status: 500 });
  }
}
