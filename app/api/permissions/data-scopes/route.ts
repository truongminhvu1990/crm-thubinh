import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { setDataScope } from "@/lib/permission/permissionCenter.service";
import { getRoleDataScopes } from "@/lib/permission/permissionCenter.repository";
import { DataScopeResource, DataScope } from "@/types/permissionCenter";
import { handlePermissionServiceError } from "../_errors";

/** Data Scope tab and the Data Scope Matrix (PERMISSION_UI.md §3.2/§5,
 * §5.1) - protected per Decision 19. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const scopes = await getRoleDataScopes();
    return NextResponse.json(scopes);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}

/** Data Scope tab (PERMISSION_UI.md §3.2/§5) - upserts (role_id, resource). */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { role_id, resource, scope } = body as { role_id: string; resource: DataScopeResource; scope: DataScope };
    if (!role_id || !resource || !scope) {
      return NextResponse.json({ error: "role_id, resource, scope là bắt buộc" }, { status: 400 });
    }
    await setDataScope(auth.staff.id, role_id, resource, scope);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
