import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getTargetCompatibilityForCampaign } from "@/lib/seeding/seedingDirectComment.service";
import { handleSeedingError } from "../../../_errors";

/** Phase 2K-BQ — Page/Target Compatibility Safety. Read-only: the client
 * only ever asks "what is this campaign's per-target compatibility right
 * now" — it can never submit a compatibility status, an owning Page, or
 * any override/force-compatible flag. Always computed fresh from the
 * campaign's CURRENT facebook_page_id (no cache), so a request made
 * right after a Page reassignment (2K-BP) reflects the new Page
 * automatically. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const map = await getTargetCompatibilityForCampaign(id, client);
    return NextResponse.json(map);
  } catch (error) {
    return handleSeedingError(error);
  }
}
