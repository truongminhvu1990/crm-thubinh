import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getManualContentCampaignUsage } from "@/lib/facebookTools/facebookManualContent.service";
import { handleFacebookToolsError } from "../../_errors";

/** Phase 2K-BZ (P2 #1) — Content Repository <-> Campaign linkage.
 * ?ids=uuid1,uuid2,... -> which campaign(s), if any, currently target
 * each reference. Same permission as the rest of Content Repository
 * (facebook_tools.manage) — the campaign names surfaced here are
 * read-only navigational context, not a grant of seeding.manage; the
 * drill-through link itself still requires seeding.manage on arrival. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  try {
    const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const client = await createClient();
    const usage = await getManualContentCampaignUsage(ids, client);
    return NextResponse.json(usage);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
