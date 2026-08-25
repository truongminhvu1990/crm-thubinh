import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getPageById } from "@/lib/facebookTools/facebookPage.service";
import { getDistinctStatusTypes } from "@/lib/facebookTools/facebookPagePost.service";
import { handleFacebookToolsError } from "../../_errors";

/** GET ?pageId=... — the content-type filter's option list: distinct
 * status_type values actually present in this Page's cache (PO decision,
 * 2026-08-26: never a hardcoded/invented list — a future sync can surface a
 * status_type never seen before, and the filter must reflect the real
 * data). Cached data only, no Graph API call. Static route — Next.js
 * resolves this ahead of the sibling `[id]` dynamic route, same as any
 * `/foo/known-name` vs `/foo/[id]` pair. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const pageId = searchParams.get("pageId");
  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId" }, { status: 400 });
  }

  try {
    const client = await createClient();
    const page = await getPageById(pageId, client);
    if (!page) return NextResponse.json({ error: "Facebook page not found" }, { status: 404 });

    const statusTypes = await getDistinctStatusTypes(page.facebook_page_id, client);
    return NextResponse.json(statusTypes);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
