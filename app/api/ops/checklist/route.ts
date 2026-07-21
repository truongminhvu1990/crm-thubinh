import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getReleaseChecklistState, toggleReleaseChecklistItem } from "@/lib/opsConsole/opsConsole.service";
import { handleOpsError } from "../_errors";

/** Release Checklist (PRODUCTION_READINESS_UI.md §12) - the single source
 * of truth the Production Dashboard's dimension tiles and Readiness Score
 * both read from. Reuses activity_logs (entity="release_checklist"). */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const state = await getReleaseChecklistState();
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
    const { item_key, checked } = body as { item_key: string; checked: boolean };
    if (!item_key || typeof checked !== "boolean") {
      return NextResponse.json({ error: "item_key, checked là bắt buộc" }, { status: 400 });
    }
    await toggleReleaseChecklistItem(auth.staff.id, item_key, checked);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleOpsError(error);
  }
}
