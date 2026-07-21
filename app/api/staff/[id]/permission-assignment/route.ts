import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { assignStaffRoleAndTeam, getTeams } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../../../permissions/_errors";

/** User Role Assignment (Decision 10, PERMISSION_UI.md §8) - extends Staff
 * Detail/StaffModal with two new fields (role_id, team_id), written
 * through this dedicated endpoint rather than the existing unprotected
 * updateStaff() client call, so the sensitive act of assigning a role/team
 * is server-side enforced. Every other Staff field keeps using the
 * existing lib/staff.service.ts updateStaff() path unchanged - this
 * endpoint only ever touches role_id/team_id. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  const { id: staffId } = await params;

  try {
    const body = await request.json();
    const fields: { role_id?: string | null; team_id?: string | null } = {};
    if ("role_id" in body) fields.role_id = body.role_id;
    if ("team_id" in body) fields.team_id = body.team_id;

    // Decision 13: Team must come from the existing Team list - no free text.
    if (fields.team_id) {
      const existingTeams = await getTeams();
      if (!existingTeams.some((t) => t.team_id === fields.team_id)) {
        return NextResponse.json(
          { error: "Nhóm không tồn tại - vui lòng tạo nhóm trước khi gán" },
          { status: 400 }
        );
      }
    }

    const staff = await assignStaffRoleAndTeam(auth.staff.id, staffId, fields);
    return NextResponse.json(staff);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
