import { NextRequest, NextResponse } from "next/server";
import { getReconciliationCandidates } from "@/lib/moneyDebtLedger/moneyDebtLedger.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Stage 5 (Product Owner Locked Decisions, 2026-08-16), Phase 4/5 — the
 * unified reconciliation candidate picker: historical TECH_H/TechH
 * (payment_method-based, unchanged) merged with the new generic
 * Receiving-Account + Money-Changer-association path. Supersedes
 * /api/money-debt-ledger/tech-h-candidates as the reconciliation modal's
 * data source (that route is left in place, unmodified, per Stage 5's own
 * "do not remove the existing aliases/paths" instruction — it still serves
 * the historical-only shape correctly on its own). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const candidates = await getReconciliationCandidates(client);
  return NextResponse.json(candidates);
}
