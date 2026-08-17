import { NextRequest, NextResponse } from "next/server";
import { createSupplierPaymentViaMoneyChanger, MoneyDebtLedgerRuleViolationError } from "@/lib/moneyDebtLedger/moneyDebtLedger.service";
import { CreateSupplierPaymentViaMoneyChangerInput } from "@/types/moneyDebtLedger";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";

/** Stage 19B — Supplier Payment via Money Changer's own paired write path,
 * kept separate from POST /api/money-debt-ledger for the same reason as
 * /buy-cny: it always produces exactly 2 rows (one VND OUT against the
 * Money Changer, one CNY OUT against the Supplier) sharing one
 * transaction_group, created atomically by
 * create_supplier_payment_via_money_changer(). Same EXECUTE-privilege
 * shape as every other money-debt-ledger write route — service_role only,
 * via createAdminClient(), after requirePermission() has already run. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.create");
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as CreateSupplierPaymentViaMoneyChangerInput;
    const client = createAdminClient();
    const rows = await createSupplierPaymentViaMoneyChanger(body, auth.staff.id, client);
    return NextResponse.json(rows, { status: 201 });
  } catch (error) {
    if (error instanceof AdminClientConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof MoneyDebtLedgerRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating Supplier Payment via Money Changer transaction:", error);
    return NextResponse.json({ error: "Không thể ghi nhận giao dịch thanh toán nhà cung cấp" }, { status: 500 });
  }
}
