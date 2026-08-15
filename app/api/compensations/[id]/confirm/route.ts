import { NextRequest, NextResponse } from "next/server";
import { confirmCompensation, CompensationRuleViolationError } from "@/lib/compensation/compensation.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Pending -> Confirmed (docs/13_COMPENSATION_SPEC.md §13: `compensation.manage`
 * governs "confirming a Compensation record"). BR-001-gated inside the
 * service function — see confirmCompensation's own doc comment. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "compensation.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const client = await createClient();
    const compensation = await confirmCompensation(id, auth.staff.id, client);
    return NextResponse.json(compensation);
  } catch (error) {
    if (error instanceof CompensationRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error confirming compensation:", error);
    return NextResponse.json({ error: "Không thể xác nhận compensation" }, { status: 500 });
  }
}
