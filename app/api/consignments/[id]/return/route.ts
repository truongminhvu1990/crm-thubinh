import { NextRequest, NextResponse } from "next/server";
import { returnConsignment, ConsignmentRuleViolationError } from "@/lib/consignment/consignment.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** RECEIVED or AVAILABLE_FOR_SALE -> RETURNED (D5/D01, LOCKED). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "consignment.return");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const client = await createClient();
    const consignment = await returnConsignment(id, auth.staff.id, client);
    return NextResponse.json(consignment);
  } catch (error) {
    if (error instanceof ConsignmentRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error returning consignment:", error);
    return NextResponse.json({ error: "Không thể trả hàng consignment" }, { status: 500 });
  }
}
