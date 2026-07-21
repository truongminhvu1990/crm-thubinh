import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { assignTeam, getTeams } from "@/lib/permission/permissionCenter.service";
import { handlePermissionServiceError } from "../../_errors";

/** Team Management's "Assign Team" / "Remove from team" (Decision 13,
 * PERMISSION_UI.md §7, §12) - bulk-writes staff.team_id for every selected
 * staff row. team_id: null removes the selected staff from any team. */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { staff_ids, team_id, is_new_team } = body as {
      staff_ids: string[];
      team_id: string | null;
      /** True only for the sanctioned "Create Team" flow (§7) - the one
       * place Decision 13 allows a team name that isn't already in use. */
      is_new_team?: boolean;
    };
    if (!Array.isArray(staff_ids) || staff_ids.length === 0) {
      return NextResponse.json({ error: "staff_ids là bắt buộc" }, { status: 400 });
    }

    // Decision 13: no arbitrary text entry outside the Create Team flow -
    // server-side, not just the UI's closed-list control, so this is a real
    // guarantee, not a cosmetic one.
    if (team_id && !is_new_team) {
      const existingTeams = await getTeams();
      if (!existingTeams.some((t) => t.team_id === team_id)) {
        return NextResponse.json(
          { error: "Nhóm không tồn tại - vui lòng tạo nhóm trước khi gán" },
          { status: 400 }
        );
      }
    }

    await assignTeam(auth.staff.id, staff_ids, team_id ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
