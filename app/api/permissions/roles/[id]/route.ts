import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess, createRequestClient } from "@/lib/permission/serverAuth";
import { updateRole, setRoleActive, getRoleById } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../../_errors";

/** Role Detail's own page load (PERMISSION_UI.md §3) - protected per
 * Decision 19. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const role = await getRoleById(id, createRequestClient(request));
    if (!role) return NextResponse.json({ error: "Không tìm thấy vai trò" }, { status: 404 });
    return NextResponse.json(role);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}

/** Role Detail's Edit modal and Disable/Enable toggle (PERMISSION_UI.md §2, §3). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const client = createRequestClient(request);
    let role;
    if (typeof body.is_active === "boolean") {
      role = await setRoleActive(auth.staff.id, id, body.is_active, client);
    } else {
      role = await updateRole(
        auth.staff.id,
        id,
        {
          name: body.name?.trim(),
          description: body.description?.trim(),
        },
        client
      );
    }
    return NextResponse.json(role);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
