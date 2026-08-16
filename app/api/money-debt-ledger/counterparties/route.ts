import { NextRequest, NextResponse } from "next/server";
import { getLedgerCounterparties } from "@/lib/moneyDebtLedger/moneyDebtLedger.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Picker data source for Record Movement / Buy CNY / party filter —
 * partners.partner_type IN ('Money Changer', 'Supplier'), per §6/D2. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const counterparties = await getLedgerCounterparties(client);
  return NextResponse.json(counterparties);
}
