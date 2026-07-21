import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { cloneRolePermissions, createRole } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../../../_errors";

/** Clone Permission (Decision 14, PERMISSION_UI.md §3.3) - target is either
 * a brand-new role (name + role_key supplied) or an existing role
 * (target_role_id supplied). Scoped to role_permissions only, per the
 * action's literal name - Data Scope/Sensitive Fields are not touched. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  const { id: sourceRoleId } = await params;

  try {
    const body = await request.json();
    let targetRoleId: string = body.target_role_id;

    if (!targetRoleId) {
      if (!body.role_key?.trim() || !body.name?.trim()) {
        return NextResponse.json({ error: "target_role_id hoặc role_key/name là bắt buộc" }, { status: 400 });
      }
      const newRole = await createRole(auth.staff.id, {
        role_key: body.role_key.trim(),
        name: body.name.trim(),
        description: body.description?.trim() || undefined,
      });
      targetRoleId = newRole.id;
    }

    const clonedCount = await cloneRolePermissions(auth.staff.id, sourceRoleId, targetRoleId);
    return NextResponse.json({ target_role_id: targetRoleId, cloned_count: clonedCount });
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
