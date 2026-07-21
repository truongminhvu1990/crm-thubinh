import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { createRole, getRoles } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../_errors";

/** Role List (PERMISSION_UI.md §2) and every other screen's role dropdown/
 * column list - protected per Decision 19 (GET endpoints require the
 * appropriate permission, same as writes). */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const roles = await getRoles();
    return NextResponse.json(roles);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}

/** Role List's "Add Role" (PERMISSION_UI.md §2). */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    if (!body.role_key?.trim() || !body.name?.trim()) {
      return NextResponse.json({ error: "role_key và name là bắt buộc" }, { status: 400 });
    }
    const role = await createRole(auth.staff.id, {
      role_key: body.role_key.trim(),
      name: body.name.trim(),
      description: body.description?.trim() || undefined,
    });
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
