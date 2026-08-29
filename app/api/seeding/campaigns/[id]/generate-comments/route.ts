import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getSuggestionsForCampaign, getSuggestionsForCampaignTarget, generateCommentSuggestions } from "@/lib/seeding/seedingComment.ai.service";
import { SeedingCommentIntent } from "@/types/seeding";
import { handleSeedingError } from "../../../_errors";

/** GET returns suggestions for display; POST generates one more batch —
 * the same endpoint serves both "Generate" (no prior suggestions) and
 * "Regenerate" (prior suggestions exist and are fed back to Claude as
 * "avoid" context, see seedingComment.ai.service.ts).
 * GET ?campaign_target_id= — Phase 2K-AR: when given, returns ONLY
 * suggestions persisted with that exact campaign_target_id (never a
 * legacy/untagged row); omitted, behavior is unchanged (every suggestion
 * for the campaign, the existing campaign-level fallback).
 * POST body: { productDescription?, campaign_target_id?, intent? } —
 * campaign_target_id (Phase 2K-AI) is optional and, when given, scopes the
 * AI's post-content input to that exact target (ownership-checked against
 * `id`) and tags every newly persisted row with it (Phase 2K-AR); omitted,
 * behavior is unchanged (campaign-level snapshot, untagged rows). intent
 * (Phase 2K-AW) is optional, request-time only, never persisted — steers
 * the angle of this one generation batch; omitted, behaves exactly like
 * "ALL" (the pre-2K-AW mixed-intent default). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const campaignTargetId = request.nextUrl.searchParams.get("campaign_target_id");

  try {
    const client = await createClient();
    const suggestions = campaignTargetId
      ? await getSuggestionsForCampaignTarget(id, campaignTargetId, client)
      : await getSuggestionsForCampaign(id, client);
    return NextResponse.json(suggestions);
  } catch (error) {
    return handleSeedingError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const productDescription = (body.productDescription as string | undefined) ?? null;
    const campaignTargetId = body.campaign_target_id as string | undefined;
    const intent = body.intent as SeedingCommentIntent | undefined;
    const client = await createClient();
    const suggestions = await generateCommentSuggestions(id, productDescription, client, undefined, campaignTargetId, intent);
    return NextResponse.json(suggestions, { status: 201 });
  } catch (error) {
    return handleSeedingError(error);
  }
}
