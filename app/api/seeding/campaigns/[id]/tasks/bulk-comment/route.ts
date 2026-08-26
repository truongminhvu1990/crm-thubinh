import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { createBulkCommentTasks } from "@/lib/seeding/seedingTask.service";
import { handleSeedingError } from "../../../../_errors";

/** Phase 2I (I2) — POST { targetIds: string[], comment_text, assigned_staff_id?,
 * scheduled_at? }: create one Comment task per selected target, all with
 * the same content/assignee/date. seeding.manage only — same gate as
 * every other task-creation path (creating/assigning is planning, not
 * execution). Always 200 with a per-target created/skipped/failed report,
 * never a single pass/fail — a partial failure is not an HTTP error. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const targetIds = Array.isArray(body.targetIds)
      ? (body.targetIds as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];

    const client = await createClient();
    const result = await createBulkCommentTasks(
      id,
      {
        targetIds,
        comment_text: body.comment_text,
        assigned_staff_id: body.assigned_staff_id || undefined,
        scheduled_at: body.scheduled_at || undefined,
      },
      auth.staff.id,
      client
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleSeedingError(error);
  }
}
