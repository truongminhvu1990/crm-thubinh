import { NextRequest, NextResponse } from "next/server";
import { getSettlements, createSettlement, SettlementRuleViolationError } from "@/lib/settlement/settlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "settlement.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const client = await createClient();
  const settlements = await getSettlements(
    { searchTerm: searchParams.get("search") ?? undefined, status: searchParams.get("status") ?? undefined },
    client
  );
  return NextResponse.json(settlements);
}

/** Creates a Settlement Request from one or more eligible (Handed Off, not
 * yet settled) Compensations — docs/14_SETTLEMENT_SPEC.md §4/§8, Settlement
 * 1:N Settlement Items (Product Owner Revision 2026-07-31, Decision 1). */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const client = await createClient();
    const settlement = await createSettlement(body.compensation_ids ?? [], body.settlement_method || "Bank Transfer", client);
    return NextResponse.json(settlement, { status: 201 });
  } catch (error) {
    if (error instanceof SettlementRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating settlement:", error);
    return NextResponse.json({ error: "Không thể tạo settlement" }, { status: 500 });
  }
}
