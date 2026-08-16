import { NextRequest, NextResponse } from "next/server";
import { getAllBalances, getLedgerCounterparties } from "@/lib/moneyDebtLedger/moneyDebtLedger.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §19/§27 — Balance(party, currency) =
 * SUM(IN) - SUM(OUT), computed live (D5/D8, no balance table, no stored
 * running_balance). Joins in party name/type so the UI doesn't need a
 * second round trip per row. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const [balances, counterparties] = await Promise.all([getAllBalances(client), getLedgerCounterparties(client)]);
  const partyById = new Map(counterparties.map((p) => [p.id, p]));

  const enriched = balances.map((b) => ({ ...b, party: partyById.get(b.party_id) ?? null }));
  return NextResponse.json(enriched);
}
