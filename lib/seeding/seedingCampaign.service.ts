import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { SeedingCampaign, CreateSeedingCampaignInput, UpdateSeedingCampaignInput } from "@/types/seeding";
import { logActivity } from "@/lib/activityLog.service";
import { getPageByFacebookPageId, getDecryptedPageAccessToken, isReconnectRequiredError, markPageReconnectRequired } from "@/lib/facebookTools/facebookPage.service";
import { getPostContent } from "@/lib/facebookTools/facebookGraphClient";

const WRITABLE_FIELDS: (keyof UpdateSeedingCampaignInput)[] = ["name", "objective", "status", "post_content_snapshot"];

function pickWritableFields(input: UpdateSeedingCampaignInput): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((field) => {
    const value = input[field];
    if (value !== undefined) filtered[field] = value;
  });
  return filtered;
}

export async function getCampaigns(client: SupabaseClient = supabase): Promise<SeedingCampaign[]> {
  const { data, error } = await client.from("seeding_campaigns").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching seeding campaigns:", error);
    return [];
  }
  return data as SeedingCampaign[];
}

export async function getCampaignById(id: string, client: SupabaseClient = supabase): Promise<SeedingCampaign | null> {
  const { data, error } = await client.from("seeding_campaigns").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching seeding campaign:", error);
    return null;
  }
  return data as SeedingCampaign | null;
}

/** Legacy path only (a campaign created with a raw facebook_post_id, pre-
 * Phase-2C style) — fetches the post's text via the connected Page's token,
 * the only place seeding_campaigns talks to Graph API. A missing/failed
 * fetch never blocks campaign creation (post_content_snapshot stays null;
 * AI generation still works off objective/product alone, just with less
 * context). */
async function tryFetchPostContentSnapshotFromGraph(
  facebookPageId: string,
  facebookPostId: string,
  client: SupabaseClient
): Promise<string | null> {
  const page = await getPageByFacebookPageId(facebookPageId, client);
  if (!page) return null;

  try {
    const accessToken = await getDecryptedPageAccessToken(page.id, client);
    const content = await getPostContent(facebookPostId, accessToken);
    return content.text;
  } catch (error) {
    if (isReconnectRequiredError(error)) await markPageReconnectRequired(page.id, client);
    console.error("Error fetching Facebook post content for seeding campaign:", error);
    return null;
  }
}

/** Phase 2C path — reads the first selected target's message straight from
 * the facebook_page_posts cache (no Graph API call, per the "không gọi
 * Graph API khi tạo campaign" requirement). Only used when the campaign is
 * created with at least one target; a Draft created with 0 targets simply
 * has no snapshot yet. */
async function snapshotFromCache(facebookPagePostId: string, client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.from("facebook_page_posts").select("message").eq("id", facebookPagePostId).maybeSingle();
  if (error || !data) return null;
  return (data as { message: string | null }).message;
}

export async function createCampaign(
  input: CreateSeedingCampaignInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingCampaign> {
  const firstTargetId = input.targetFacebookPagePostIds?.[0];
  const post_content_snapshot = firstTargetId ? await snapshotFromCache(firstTargetId, client) : null;

  const { data, error } = await client
    .from("seeding_campaigns")
    .insert({
      name: input.name,
      facebook_page_id: input.facebook_page_id,
      objective: input.objective,
      product_id: input.product_id ?? null,
      status: input.status ?? "Draft",
      post_content_snapshot,
      created_by_staff_id: actorStaffId,
    })
    .select()
    .single();
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "seeding_campaign_created", entity: "seeding_campaign", entity_id: data.id }, client);
  return data as SeedingCampaign;
}

export async function updateCampaign(
  id: string,
  changes: UpdateSeedingCampaignInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingCampaign> {
  const { data, error } = await client
    .from("seeding_campaigns")
    .update(pickWritableFields(changes))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "seeding_campaign_updated", entity: "seeding_campaign", entity_id: id }, client);
  return data as SeedingCampaign;
}

/** "Làm mới nội dung bài post" — legacy (pre-Phase-2C, single-post)
 * campaigns only; re-fetches via Graph API on demand (manual, not
 * scheduled). A multi-target campaign has no single canonical post to
 * refresh this way — its snapshot was set once at creation from the first
 * target's cache. */
export async function refreshPostContentSnapshot(id: string, client: SupabaseClient = supabase): Promise<SeedingCampaign> {
  const campaign = await getCampaignById(id, client);
  if (!campaign) throw new Error("Seeding campaign not found");
  if (!campaign.facebook_post_id) throw new Error("Campaign has no single facebook_post_id to refresh (multi-target campaign)");

  const post_content_snapshot = await tryFetchPostContentSnapshotFromGraph(campaign.facebook_page_id, campaign.facebook_post_id, client);

  const { data, error } = await client
    .from("seeding_campaigns")
    .update({ post_content_snapshot })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SeedingCampaign;
}
