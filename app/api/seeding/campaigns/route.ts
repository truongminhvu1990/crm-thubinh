import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getCampaigns, createCampaign } from "@/lib/seeding/seedingCampaign.service";
import { addTargetsToCampaign } from "@/lib/seeding/seedingCampaignTarget.service";
import { handleSeedingError } from "../_errors";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const campaigns = await getCampaigns(client);
    return NextResponse.json(campaigns);
  } catch (error) {
    return handleSeedingError(error);
  }
}

/** Phase 2C — creates the campaign, then (if any post was pre-selected in
 * the Content Repository / Post Picker) adds each as a Target in the same
 * call. Not atomic across the two tables (Supabase JS has no multi-table
 * transaction) — if target-adding fails after the campaign insert
 * succeeds, the result is a Draft campaign with 0 targets, which is
 * already a valid state (PO decision), not corruption.
 *
 * Phase 2J-D — targetManualContentReferenceIds (Personal/Group manually-
 * imported content) may be sent alongside or instead of
 * targetFacebookPagePostIds, producing a mixed or manual-only campaign
 * respectively (facebook_page_id is simply omitted from the body for a
 * manual-only campaign — createCampaign already treats it as optional). */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const input = await request.json();
    const client = await createClient();
    const campaign = await createCampaign(input, auth.staff.id, client);

    const targetIds = Array.isArray(input.targetFacebookPagePostIds)
      ? (input.targetFacebookPagePostIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    const manualTargetIds = Array.isArray(input.targetManualContentReferenceIds)
      ? (input.targetManualContentReferenceIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (targetIds.length > 0 || manualTargetIds.length > 0) {
      await addTargetsToCampaign(campaign.id, targetIds, auth.staff.id, client, manualTargetIds);
    }

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    return handleSeedingError(error);
  }
}
