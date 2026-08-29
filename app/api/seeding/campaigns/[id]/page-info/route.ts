import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getCampaignPageInfo } from "@/lib/seeding/seedingDirectComment.service";
import { handleSeedingError } from "../../../_errors";

/** Phase 2K-BP — Campaign Detail's "Connected Facebook Page" panel: the
 * campaign's own Page (name/status) plus its Direct Comment capability,
 * computed through the same single source of truth
 * (derivePageCapability) every other capability check in this module
 * already uses. Separate from the existing
 * /direct-comment-capability route (2K-BK) so that route's response
 * shape — already relied upon by the existing Direct Comment UI — stays
 * completely unchanged. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const info = await getCampaignPageInfo(id, client);
    return NextResponse.json(info);
  } catch (error) {
    return handleSeedingError(error);
  }
}
