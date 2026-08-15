import { NextRequest, NextResponse } from "next/server";
import { getBatchStaticReportData } from "@/lib/reports/reports.service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";

/** Backend API Foundation (Package 4C, Wave 4).
 *
 * Reporting API Permission Enforcement (docs/REPORTING_MASTER_SPEC.md §12,
 * LOCKED Rev 3) — Product Owner Implementation Directive, 2026-08-15:
 * gated by `reports.view`, closing the gap the Production Readiness Audit
 * confirmed this route (and 12 others) never received when Decision Q-12
 * was originally implemented. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const data = await getBatchStaticReportData(client);
  return NextResponse.json(data);
}
