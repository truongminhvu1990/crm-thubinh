import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { staffHasPermission } from "@/lib/permission/permissionCenter.service";
import { createClient } from "@/lib/supabase/server";
import { getTaskById, updateTaskStatus, updateTaskCommentText, assignTaskStaff } from "@/lib/seeding/seedingTask.service";
import { handleSeedingError } from "../../_errors";

/** Mark a Task Done/Skipped. Allowed for: seeding.manage (a manager acting
 * on any task), or seeding.execute AND the calling staff member is the
 * task's own assignee — an execute-only staff member can update their own
 * queue but not someone else's.
 *
 * Phase 2K-CF (Issue 2) — a request body with `comment_text` is a
 * content-edit request, routed to a structurally distinct path
 * (seeding.manage only, unassigned-only, enforced atomically inside
 * updateTaskCommentText) before the status-transition branch below is
 * ever reached. A content-edit request can never also carry a status
 * change through this route — the two are mutually exclusive branches,
 * not merged fields on one generic update.
 *
 * Phase 2K-CJ — a request body with `assigned_staff_id` is likewise a
 * structurally distinct assignment request (seeding.manage only,
 * unassigned-only, enforced atomically inside assignTaskStaff), never
 * merged with either branch above. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = await createClient();
    const task = await getTaskById(id, client);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const body = await request.json();

    if (typeof body.comment_text === "string") {
      const canManage = await staffHasPermission(staff, "seeding.manage", client);
      if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const updated = await updateTaskCommentText(id, body.comment_text, staff.id, client);
      return NextResponse.json(updated);
    }

    if (typeof body.assigned_staff_id === "string") {
      const canManage = await staffHasPermission(staff, "seeding.manage", client);
      if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const updated = await assignTaskStaff(id, body.assigned_staff_id, staff.id, client);
      return NextResponse.json(updated);
    }

    const canManage = await staffHasPermission(staff, "seeding.manage", client);
    const canExecuteOwnTask =
      task.assigned_staff_id === staff.id && (await staffHasPermission(staff, "seeding.execute", client));
    if (!canManage && !canExecuteOwnTask) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await updateTaskStatus(id, body, staff.id, client);
    return NextResponse.json(updated);
  } catch (error) {
    return handleSeedingError(error);
  }
}
