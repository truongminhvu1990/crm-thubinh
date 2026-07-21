import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getPermissionDashboardKpis } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../_errors";

/** Permission Dashboard's 5 KPIs (Decision 16, PERMISSION_UI.md §18) -
 * protected per Decision 19. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const kpis = await getPermissionDashboardKpis();
    return NextResponse.json(kpis);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
