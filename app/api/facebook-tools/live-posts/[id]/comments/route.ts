import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getLivePostComments, syncLivePostComments } from "@/lib/facebookTools/facebookLivePostComment.service";
import { handleFacebookToolsError } from "../../../_errors";

/** Phase 3.1 — comment review (read-only). `id` is facebook_live_posts.id
 * (this table's own uuid PK). `?refresh=true` re-fetches from Graph API
 * (a read, never a write to Facebook) before returning; otherwise this
 * only reads the existing facebook_live_post_comments cache. No hide
 * action, no AI, no automation — matches this route's sibling
 * /live-posts exactly. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { searchParams } = request.nextUrl;
  const refresh = searchParams.get("refresh") === "true";

  try {
    const client = await createClient();
    const comments = refresh ? await syncLivePostComments(id, client) : await getLivePostComments(id, client);
    return NextResponse.json(comments);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
