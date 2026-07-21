import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getPermissions } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../_errors";

/** The permission catalog (Role Detail's Quyền tab, the Permission Matrix,
 * Sensitive Field Config's "add permission" picker) - named "catalog"
 * rather than nesting under /api/permissions/permissions. Protected per
 * Decision 19. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const permissions = await getPermissions();
    return NextResponse.json(permissions);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
