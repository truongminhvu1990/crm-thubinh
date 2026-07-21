import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getGoLiveState, setGoLiveApproval } from "@/lib/opsConsole/opsConsole.service";
import { handleOpsError } from "../_errors";

/** Go Live Checklist's Product Owner Approval (Decision 34,
 * PRODUCTION_READINESS_UI.md §13.1) - Pending/Approved, settable only via
 * this endpoint (still gated the same as every other Ops write - a real
 * Product Owner distinction would need its own permission, not decided
 * here; today this endpoint is gated the same as everything else in this
 * module, `settings.manage`). */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const state = await getGoLiveState();
    return NextResponse.json(Object.fromEntries(state));
  } catch (error) {
    return handleOpsError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { approved } = body as { approved: boolean };
    if (typeof approved !== "boolean") {
      return NextResponse.json({ error: "approved là bắt buộc" }, { status: 400 });
    }
    await setGoLiveApproval(auth.staff.id, approved);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleOpsError(error);
  }
}
