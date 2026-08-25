import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getPageById } from "@/lib/facebookTools/facebookPage.service";
import { getPagePostsPage, syncPagePosts } from "@/lib/facebookTools/facebookPagePost.service";
import { FacebookPageContentDiscoveryStatus } from "@/types/facebookTools";
import { handleSeedingError } from "../../../_errors";

/** Phase 2C's Post Picker — Semi Seeding's own read of "which posts are
 * cached for this Page," gated by `seeding.manage` rather than
 * `facebook_tools.manage`, exact same precedent as ../../route.ts (which
 * already proxies getConnectedPages the same way, so a seeding.manage-only
 * user isn't blocked reading Facebook Tools data). Reuses
 * getPagePostsPage() unchanged — cache-only, bounded/paginated, no Graph
 * API call, same as Content Repository. `pageId` is facebook_pages.id
 * (this table's own uuid PK), same convention as every other Facebook
 * Tools route. */

const VALID_DISCOVERY_STATUSES: FacebookPageContentDiscoveryStatus[] = ["Active", "Unavailable", "Refresh Failed"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { pageId } = await params;
  const { searchParams } = request.nextUrl;

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
      },
      client
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleSeedingError(error);
  }
}

/** POST — manual sync from Facebook ("Làm mới dữ liệu"), for the Post
 * Picker's own "Làm mới" button when creating a Campaign. Exact same
 * bounded sync as app/api/facebook-tools/page-posts/route.ts's POST (same
 * `syncPagePosts` call, unchanged) — only the permission gate differs
 * (`seeding.manage`, matching this file's own GET). Not a new sync
 * mechanism: no cron, same DEFAULT_PAGE_POSTS_SYNC_MAX_PAGES bound, same
 * hasMore/nextCursor honesty. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { pageId } = await params;

  try {
    const client = await createClient();
    const page = await getPageById(pageId, client);
    if (!page) return NextResponse.json({ error: "Facebook page not found" }, { status: 404 });

    const result = await syncPagePosts(page.facebook_page_id, page.id, client);
    return NextResponse.json(result);
  } catch (error) {
    return handleSeedingError(error);
  }
}
