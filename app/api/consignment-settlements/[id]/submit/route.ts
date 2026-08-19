import { NextRequest, NextResponse } from "next/server";
import { submitConsignmentSettlement, ConsignmentSettlementRuleViolationError } from "@/lib/consignment/consignmentSettlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Draft -> Pending. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const client = await createClient();
    const settlement = await submitConsignmentSettlement(id, client);
    return NextResponse.json(settlement);
  } catch (error) {
    if (error instanceof ConsignmentSettlementRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error submitting consignment settlement:", error);
    return NextResponse.json({ error: "Không thể gửi duyệt consignment settlement" }, { status: 500 });
  }
}
