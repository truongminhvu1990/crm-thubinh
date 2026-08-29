import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { checkDirectCommentCapability } from "@/lib/seeding/seedingDirectComment.service";
import { handleSeedingError } from "../../../_errors";

/** Phase 2K-BK — read-only, campaign-level: whether Page-sourced direct
 * comment publishing can currently work for this campaign (its connected
 * Page's own health status). Cheap — no live Graph API call. Does NOT
 * cover Personal/Group (always NOT_SUPPORTED, determined client-side
 * from the target's own source_type, already loaded on the campaign
 * detail page). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const capability = await checkDirectCommentCapability(id, client);
    return NextResponse.json(capability);
  } catch (error) {
    return handleSeedingError(error);
  }
}
