import { NextRequest, NextResponse } from "next/server";
import { completeConsignmentSettlement, ConsignmentSettlementRuleViolationError } from "@/lib/consignment/consignmentSettlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Approved -> Completed. Terminal — this is the Customer Paid fact (§5,
 * Final Design Specification). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const client = await createClient();
    const settlement = await completeConsignmentSettlement(id, auth.staff.id, client);
    return NextResponse.json(settlement);
  } catch (error) {
    if (error instanceof ConsignmentSettlementRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error completing consignment settlement:", error);
    return NextResponse.json({ error: "Không thể hoàn tất consignment settlement" }, { status: 500 });
  }
}
