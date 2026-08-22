import { NextRequest, NextResponse } from "next/server";
import { cancelSettlement, SettlementRuleViolationError } from "@/lib/settlement/settlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Draft/Pending/Approved -> Cancelled, with reversal (Finance Project #1,
 * Phase B) — every member Compensation still Handed Off reverts to
 * Confirmed atomically via cancel_settlement_with_reversal(). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const client = await createClient();
    const settlement = await cancelSettlement(id, auth.staff.id, client);
    return NextResponse.json(settlement);
  } catch (error) {
    if (error instanceof SettlementRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error cancelling settlement:", error);
    return NextResponse.json({ error: "Không thể hủy settlement" }, { status: 500 });
  }
}
