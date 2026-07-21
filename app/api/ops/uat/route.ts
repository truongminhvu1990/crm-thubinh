import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getUatProgressState, markUatItemVerified } from "@/lib/opsConsole/opsConsole.service";
import { handleOpsError } from "../_errors";

/** UAT Progress (PRODUCTION_READINESS_UI.md §11 / Spec §14.1). */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const state = await getUatProgressState();
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
    const { role, item_key, verified } = body as { role: string; item_key: string; verified: boolean };
    if (!role || !item_key || typeof verified !== "boolean") {
      return NextResponse.json({ error: "role, item_key, verified là bắt buộc" }, { status: 400 });
    }
    await markUatItemVerified(auth.staff.id, role, item_key, verified);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleOpsError(error);
  }
}
