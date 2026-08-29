import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { staffHasPermission } from "@/lib/permission/permissionCenter.service";
import { createClient } from "@/lib/supabase/server";
import { getTaskById } from "@/lib/seeding/seedingTask.service";
import { publishDirectComment } from "@/lib/seeding/seedingDirectComment.service";
import { handleSeedingError } from "../../../_errors";

/** Phase 2K-BK — human-initiated, one task at a time (never autonomous or
 * batch). Same authorization boundary as the existing task status PATCH
 * (app/api/seeding/tasks/[id]/route.ts), enforced here server-side, not
 * only in the UI: seeding.manage (a manager acting on any task), or
 * seeding.execute AND the calling staff member is the task's own
 * assignee. Publishing is fundamentally an execution action on one
 * specific task, same trust boundary as marking it Done/Failed manually. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = await createClient();
    const task = await getTaskById(id, client);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const canManage = await staffHasPermission(staff, "seeding.manage", client);
    const canExecuteOwnTask =
      task.assigned_staff_id === staff.id && (await staffHasPermission(staff, "seeding.execute", client));
    if (!canManage && !canExecuteOwnTask) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await publishDirectComment(id, staff.id, client);
    return NextResponse.json(updated);
  } catch (error) {
    return handleSeedingError(error);
  }
}
