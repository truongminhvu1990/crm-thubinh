import { NextRequest, NextResponse } from "next/server";
import { getTechHReconciliationCandidates } from "@/lib/moneyDebtLedger/moneyDebtLedger.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §12 — picker data source for the TECH_H
 * Reconciliation flow: payments.payment_method = 'TECH_H' with a remaining
 * (not-yet-fully-reconciled) amount. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const candidates = await getTechHReconciliationCandidates(client);
  return NextResponse.json(candidates);
}
