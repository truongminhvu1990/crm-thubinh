import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { renameTeam } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../../_errors";

/** Team Management's "Rename Team" (Decision 13, PERMISSION_UI.md §7) -
 * bulk-rewrites every staff row's team_id from old to new. */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { old_team_id, new_team_id } = body as { old_team_id: string; new_team_id: string };
    if (!old_team_id?.trim() || !new_team_id?.trim()) {
      return NextResponse.json({ error: "old_team_id, new_team_id là bắt buộc" }, { status: 400 });
    }
    const count = await renameTeam(auth.staff.id, old_team_id, new_team_id.trim());
    return NextResponse.json({ renamed_count: count });
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
