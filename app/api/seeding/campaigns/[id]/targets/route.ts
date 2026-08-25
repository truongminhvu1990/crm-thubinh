import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getTargetsByCampaign, addTargetsToCampaign } from "@/lib/seeding/seedingCampaignTarget.service";
import { handleSeedingError } from "../../../_errors";

/** GET: every target of a campaign, enriched with the linked post's LIVE
 * cache state (message/permalink/discovery_status) — not a snapshot, so
 * the UI can warn if a target's post has since become Unavailable. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const targets = await getTargetsByCampaign(id, client);
    return NextResponse.json(targets);
  } catch (error) {
    return handleSeedingError(error);
  }
}

/** POST { facebookPagePostIds: string[] } — bulk-add targets to an
 * existing (typically Draft) campaign. Idempotent: a post already targeted
 * is silently skipped, reported in `alreadyTargeted`, not an error. Cache
 * data only — no Graph API call. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const facebookPagePostIds = Array.isArray(body.facebookPagePostIds)
      ? (body.facebookPagePostIds as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    if (facebookPagePostIds.length === 0) {
      return NextResponse.json({ error: "Missing facebookPagePostIds" }, { status: 400 });
    }

    const client = await createClient();
    const result = await addTargetsToCampaign(id, facebookPagePostIds, auth.staff.id, client);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleSeedingError(error);
  }
}
