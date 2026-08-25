import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { createHideJob, createHideJobForComments, getLatestHideJobForLivePost } from "@/lib/facebookTools/facebookHideJob.service";
import { handleFacebookToolsError } from "../_errors";

/** "Ẩn toàn bộ comment" (no commentIds) or "Ẩn comment đã chọn" (Phase 4
 * MVP, commentIds present) — creates a job. Processing happens via
 * repeated calls to hide-jobs/[id]/process, not here. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const livePostId = body.livePostId as string | undefined;
    if (!livePostId) return NextResponse.json({ error: "Missing livePostId" }, { status: 400 });

    const commentIds = Array.isArray(body.commentIds)
      ? (body.commentIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0)
      : undefined;

    const client = await createClient();
    const job =
      commentIds && commentIds.length > 0
        ? await createHideJobForComments(livePostId, commentIds, auth.staff.id, client)
        : await createHideJob(livePostId, auth.staff.id, client);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}

/** GET ?livePostId=... — the most recent job for a live post, so reopening
 * the Comment Shield page can offer "Tiếp tục" on an in-progress job
 * instead of restarting from scratch. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const livePostId = searchParams.get("livePostId");
  if (!livePostId) return NextResponse.json({ error: "Missing livePostId" }, { status: 400 });

  try {
    const client = await createClient();
    const job = await getLatestHideJobForLivePost(livePostId, client);
    return NextResponse.json(job);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
