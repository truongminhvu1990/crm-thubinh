import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getDeploymentLog, logDeployment } from "@/lib/opsConsole/opsConsole.service";
import { handleOpsError } from "../_errors";

/** Deployment History (PRODUCTION_READINESS_UI.md §3) - manually-entered
 * log, since no deployment automation exists (locked Business Design §3).
 * Desktop-only in the UI (Decision 35) - this endpoint itself doesn't
 * enforce that (server-side, a request is a request); the restriction is a
 * UI-layer control, matching how the locked design scoped it. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const logs = await getDeploymentLog();
    return NextResponse.json(logs);
  } catch (error) {
    return handleOpsError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { environment, version, notes } = body as { environment: string; version: string; notes?: string };
    if (!environment || !version) {
      return NextResponse.json({ error: "environment, version là bắt buộc" }, { status: 400 });
    }
    await logDeployment(auth.staff.id, { environment, version, notes });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleOpsError(error);
  }
}
