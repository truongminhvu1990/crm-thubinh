import { NextRequest, NextResponse } from "next/server";
import { getEligibleCompensations } from "@/lib/settlement/settlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Handed Off, not-yet-settled compensations (Product Owner Revision
 * 2026-07-31, Decision 2 — Confirmed must never appear here) — the Create
 * Settlement picker's own data source, Step 2 of the two-step flow. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const compensations = await getEligibleCompensations(client);
  return NextResponse.json(compensations);
}
