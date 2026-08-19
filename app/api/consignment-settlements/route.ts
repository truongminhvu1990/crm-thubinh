import { NextRequest, NextResponse } from "next/server";
import {
  getConsignmentSettlements,
  createConsignmentSettlement,
  ConsignmentSettlementRuleViolationError,
} from "@/lib/consignment/consignmentSettlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Reuses `settlement.view`/`settlement.manage` — see
 * app/api/consignment-financial-records/eligible/route.ts's own comment
 * for why (Permission Coverage Audit, Increment 3, flagged blocker). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "settlement.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const client = await createClient();
  const settlements = await getConsignmentSettlements(
    { searchTerm: searchParams.get("search") ?? undefined, status: searchParams.get("status") ?? undefined },
    client
  );
  return NextResponse.json(settlements);
}

/** Creates a Consignment Settlement Request from one or more eligible
 * (not-yet-claimed) Consignment Financial Records for the same Consignor
 * (D8/D03/D04, LOCKED). */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const client = await createClient();
    const settlement = await createConsignmentSettlement(
      body.consignment_financial_record_ids ?? [],
      body.settlement_method || "Bank Transfer",
      client
    );
    return NextResponse.json(settlement, { status: 201 });
  } catch (error) {
    if (error instanceof ConsignmentSettlementRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating consignment settlement:", error);
    return NextResponse.json({ error: "Không thể tạo consignment settlement" }, { status: 500 });
  }
}
