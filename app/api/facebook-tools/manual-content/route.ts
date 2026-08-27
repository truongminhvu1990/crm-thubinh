import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getManualContentIndex, importManualContentUrls } from "@/lib/facebookTools/facebookManualContent.service";
import { handleFacebookToolsError } from "../_errors";

/** Phase 2J-D — Content Repository's "Nhập link" (manual import) surface.
 * Same permission as every other Facebook Tools/Content Repository route
 * (facebook_tools.manage) — this is the same "manage content in the
 * repository" concept as Page sync/browsing, no new permission needed.
 *
 * GET: every manually-imported Personal/Group reference, for the Content
 * Repository UI's own "manual content" section. Cached data only, same
 * convention as GET /page-posts.
 *
 * POST { urls: string[], source_type, source_label? }: batch-parses and
 * imports. Always 200 with an honest created/skipped/failed report — a
 * partial failure is not an HTTP error, same convention as
 * /api/seeding/campaigns/[id]/tasks/bulk-comment (Phase 2I). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const rows = await getManualContentIndex(client);
    return NextResponse.json(rows);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const urls = Array.isArray(body.urls) ? (body.urls as unknown[]).filter((v): v is string => typeof v === "string") : [];

    const client = await createClient();
    const result = await importManualContentUrls(
      { urls, source_type: body.source_type, source_label: body.source_label || undefined },
      auth.staff.id,
      client
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
