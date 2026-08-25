import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getPageById } from "@/lib/facebookTools/facebookPage.service";
import { getPagePostsPage, syncPagePosts } from "@/lib/facebookTools/facebookPagePost.service";
import { FacebookPageContentDiscoveryStatus } from "@/types/facebookTools";
import { handleFacebookToolsError } from "../_errors";

/** `pageId` is facebook_pages.id (this table's own uuid PK), not Facebook's
 * Page id — resolved first since getPagePostsPage/syncPagePosts are keyed
 * by Facebook's id (facebook_page_posts.facebook_page_id), same convention
 * as live-posts/route.ts. */

const VALID_DISCOVERY_STATUSES: FacebookPageContentDiscoveryStatus[] = ["Active", "Unavailable", "Refresh Failed"];

/** GET ?pageId=...&page=&search=&statusType=&discoveryStatus=&dateFrom=&dateTo=
 * — Content Repository UI's paginated, filtered read of the cache (Phase
 * 2B). Cached data only, no Graph API call — browsing never touches
 * Facebook. Never returns the full table: server-side pagination via
 * getPagePostsPage (see that function's own docstring for the exact
 * page-size/range/count-exact shape). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const pageId = searchParams.get("pageId");
  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId" }, { status: 400 });
  }

  const discoveryStatusParam = searchParams.get("discoveryStatus");
  const discoveryStatus =
    discoveryStatusParam && VALID_DISCOVERY_STATUSES.includes(discoveryStatusParam as FacebookPageContentDiscoveryStatus)
      ? (discoveryStatusParam as FacebookPageContentDiscoveryStatus)
      : undefined;

  try {
    const client = await createClient();
    const page = await getPageById(pageId, client);
    if (!page) return NextResponse.json({ error: "Facebook page not found" }, { status: 404 });

    const result = await getPagePostsPage(
      {
        pageId: page.facebook_page_id,
        page: Number(searchParams.get("page") ?? "1"),
        search: searchParams.get("search") ?? undefined,
        statusType: searchParams.get("statusType") ?? undefined,
        discoveryStatus,
        dateFrom: searchParams.get("dateFrom") ?? undefined,
        dateTo: searchParams.get("dateTo") ?? undefined,
      },
      client
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}

/** POST { pageId } — manual sync from Facebook ("Làm mới"). No cron, no
 * background scheduler — this is the only trigger. Bounded
 * (DEFAULT_PAGE_POSTS_SYNC_MAX_PAGES pages per call, a CRM operational
 * policy, not a Meta-guaranteed safe number — see facebookGraphClient.ts).
 * Returns the sync's own result metadata (requestCount/fetchedCount/
 * createdCount/updatedCount/hasMore/nextCursor), not the full cached post
 * list — the caller must not infer "fully synced" when hasMore is true; a
 * separate GET reads the accumulated cache. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const pageId = body.pageId as string | undefined;
    if (!pageId) return NextResponse.json({ error: "Missing pageId" }, { status: 400 });

    const client = await createClient();
    const page = await getPageById(pageId, client);
    if (!page) return NextResponse.json({ error: "Facebook page not found" }, { status: 404 });

    const result = await syncPagePosts(page.facebook_page_id, page.id, client);
    return NextResponse.json(result);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
