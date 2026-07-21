import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getMobileReadinessNotesState, updateMobileReadinessNote } from "@/lib/opsConsole/opsConsole.service";
import { handleOpsError } from "../_errors";

/** Mobile Readiness Status (PRODUCTION_READINESS_UI.md §16) - status board
 * only, tracks/displays, never builds any of the 6 capabilities. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const state = await getMobileReadinessNotesState();
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
    const { item_key, note } = body as { item_key: string; note: string };
    if (!item_key || typeof note !== "string") {
      return NextResponse.json({ error: "item_key, note là bắt buộc" }, { status: 400 });
    }
    await updateMobileReadinessNote(auth.staff.id, item_key, note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleOpsError(error);
  }
}
