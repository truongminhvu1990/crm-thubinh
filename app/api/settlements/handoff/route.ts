import { NextRequest, NextResponse } from "next/server";
import { handOffCompensations } from "@/lib/settlement/settlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Step 1 of the two-step flow (Product Owner Revision 2026-07-31,
 * Decision 2) — moves selected Confirmed compensations to Handed Off, a
 * separate action from Settlement creation. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const client = await createClient();
    await handOffCompensations(body.compensation_ids ?? [], client);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error handing off compensations:", error);
    return NextResponse.json({ error: "Không thể chuyển giao compensation" }, { status: 500 });
  }
}
