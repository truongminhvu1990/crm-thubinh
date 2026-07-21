import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { toggleRolePermission } from "@/lib/permission/permissionCenter.service";
import { getRolePermissions } from "@/lib/permission/permissionCenter.repository";
import { handlePermissionServiceError } from "../_errors";

/** Every grant/checkbox state across Role Detail's Quyền tab, the
 * Permission Matrix, and Role List's permission counts - protected per
 * Decision 19. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const grants = await getRolePermissions();
    return NextResponse.json(grants);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}

/** Role Detail's Quyền tab and the Permission Matrix (PERMISSION_UI.md
 * §3.1, §4) - both write to this same endpoint/table, "commit on toggle". */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { role_id, permission_id, grant } = body as { role_id: string; permission_id: string; grant: boolean };
    if (!role_id || !permission_id || typeof grant !== "boolean") {
      return NextResponse.json({ error: "role_id, permission_id, grant là bắt buộc" }, { status: 400 });
    }
    await toggleRolePermission(auth.staff.id, role_id, permission_id, grant);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
