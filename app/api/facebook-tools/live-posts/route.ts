import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getPageById } from "@/lib/facebookTools/facebookPage.service";
import { getLivePosts, syncLivePosts } from "@/lib/facebookTools/facebookLivePost.service";
import { handleFacebookToolsError } from "../_errors";

/** `pageId` is facebook_pages.id (this table's own uuid PK), not Facebook's
 * Page id — the route resolves the row first since syncLivePosts/getLivePosts
 * are keyed by Facebook's id (facebook_live_posts.facebook_page_id). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const pageId = searchParams.get("pageId");
  const refresh = searchParams.get("refresh") === "true";
  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId" }, { status: 400 });
  }

  try {
    const client = await createClient();
    const page = await getPageById(pageId, client);
    if (!page) return NextResponse.json({ error: "Facebook page not found" }, { status: 404 });

    const posts = refresh
      ? await syncLivePosts(page.facebook_page_id, page.id, client)
      : await getLivePosts(page.facebook_page_id, client);
    return NextResponse.json(posts);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
