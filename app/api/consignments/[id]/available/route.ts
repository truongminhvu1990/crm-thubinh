import { NextRequest, NextResponse } from "next/server";
import { markConsignmentAvailable, ConsignmentRuleViolationError } from "@/lib/consignment/consignment.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** RECEIVED -> AVAILABLE_FOR_SALE. Gated by `consignment.create`: only
 * three actions were Product Owner-authorized their own permission key
 * (view/create/return) — marking a Consignment available is treated as
 * part of managing its intake lifecycle, the same capability that creates
 * it, not a fourth, separately-authorized action. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "consignment.create");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const client = await createClient();
    const consignment = await markConsignmentAvailable(id, auth.staff.id, client);
    return NextResponse.json(consignment);
  } catch (error) {
    if (error instanceof ConsignmentRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error marking consignment available:", error);
    return NextResponse.json({ error: "Không thể chuyển sang Sẵn sàng bán" }, { status: 500 });
  }
}
