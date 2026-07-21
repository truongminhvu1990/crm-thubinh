import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getTeams } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../_errors";

/** Team Management's team list (PERMISSION_UI.md §7) and the Permission
 * Dashboard's Total Teams KPI source - protected per Decision 19. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const teams = await getTeams();
    return NextResponse.json(teams);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
