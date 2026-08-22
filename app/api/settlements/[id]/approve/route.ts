import { NextRequest, NextResponse } from "next/server";
import { approveSettlement, SettlementRuleViolationError } from "@/lib/settlement/settlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Pending -> Approved. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const client = await createClient();
    const settlement = await approveSettlement(id, auth.staff.id, client);
    return NextResponse.json(settlement);
  } catch (error) {
    if (error instanceof SettlementRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error approving settlement:", error);
    return NextResponse.json({ error: "Không thể duyệt settlement" }, { status: 500 });
  }
}
