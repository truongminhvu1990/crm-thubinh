import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getPagePostById } from "@/lib/facebookTools/facebookPagePost.service";
import { handleFacebookToolsError } from "../../_errors";

/** Content Repository detail (Phase 2B). Single-row cached-data fetch only
 * — no Graph API call, matching Content Discovery's own "browsing the
 * cache never touches Facebook" rule. `id` is facebook_page_posts.id (this
 * table's own uuid PK). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const post = await getPagePostById(id, client);
    if (!post) return NextResponse.json({ error: "Facebook page post not found" }, { status: 404 });
    return NextResponse.json(post);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
