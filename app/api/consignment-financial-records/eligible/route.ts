import { NextRequest, NextResponse } from "next/server";
import { getEligibleConsignmentFinancialRecords } from "@/lib/consignment/consignmentSettlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Consignment Financial Records not yet claimed by any Consignment
 * Settlement Item — the Create Consignment Settlement picker's own data
 * source. No `consignment.manage`/`consignment_financial_record.*`
 * permission exists (Permission Coverage Audit, Increment 3 — flagged
 * blocker, D12 forbids inventing a new key). Reuses `settlement.manage` as
 * the closest existing gate, since this endpoint is part of the
 * Settlement-pattern extension (D8) — flagged as an imperfect reuse: it
 * conflates authority over the existing, Compensation-facing Settlement
 * with authority over this separate Consignment Settlement capability. An
 * Owner/Admin granting `settlement.manage` today grants both; this is not
 * silently hidden, only reported. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const records = await getEligibleConsignmentFinancialRecords(client);
  return NextResponse.json(records);
}
