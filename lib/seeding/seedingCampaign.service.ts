import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { SeedingCampaign, CreateSeedingCampaignInput, UpdateSeedingCampaignInput, SEEDING_CAMPAIGN_ALLOWED_TRANSITIONS } from "@/types/seeding";
import { logActivity } from "@/lib/activityLog.service";
import { getPageByFacebookPageId, getDecryptedPageAccessToken, isReconnectRequiredError, markPageReconnectRequired } from "@/lib/facebookTools/facebookPage.service";
import { getPostContent } from "@/lib/facebookTools/facebookGraphClient";
import { SeedingValidationError } from "./seeding.errors";

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
 * has no snapshot yet.
 *
 * Phase 2J-D — a manual-reference target reads the same way from
 * facebook_manual_content_references instead. Its `message` is always null
 * in this phase (no token can read Personal/Group content) — this
 * correctly, honestly propagates that null rather than fabricating a
 * snapshot; never a code change from what "no message available" already
 * meant here. */
async function snapshotFromCache(
  target: { pagePostId: string } | { manualRefId: string },
  client: SupabaseClient
): Promise<string | null> {
  const table = "pagePostId" in target ? "facebook_page_posts" : "facebook_manual_content_references";
  const id = "pagePostId" in target ? target.pagePostId : target.manualRefId;
  const { data, error } = await client.from(table).select("message").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return (data as { message: string | null }).message;
}

export async function createCampaign(
  input: CreateSeedingCampaignInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingCampaign> {
  const firstPageTargetId = input.targetFacebookPagePostIds?.[0];
  const firstManualTargetId = input.targetManualContentReferenceIds?.[0];
  const post_content_snapshot = firstPageTargetId
    ? await snapshotFromCache({ pagePostId: firstPageTargetId }, client)
    : firstManualTargetId
      ? await snapshotFromCache({ manualRefId: firstManualTargetId }, client)
      : null;

  const { data, error } = await client
    .from("seeding_campaigns")
    .insert({
      name: input.name,
      // Phase 2J-D — null for a manual-only campaign (Architecture B: no
      // synthetic/fake Page row is ever created). Every existing caller
      // that always sent a real facebook_page_id is unaffected.
      facebook_page_id: input.facebook_page_id ?? null,
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

/** Phase 2G (M2) — a status change is validated against
 * SEEDING_CAMPAIGN_ALLOWED_TRANSITIONS before the write, the same
 * fetch-current/check-allowed/reject shape already established by
 * seedingTask.service.ts's updateTaskStatus — no new validation engine.
 * Only triggers when `changes.status` is present and actually differs from
 * the current value, so this stays a no-op for every other field edit
 * (name/objective/post_content_snapshot) and for an idempotent resend of
 * the current status. A direct API call cannot bypass this by skipping
 * the UI — the check lives here, not in the page component. */
export async function updateCampaign(
  id: string,
  changes: UpdateSeedingCampaignInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingCampaign> {
  if (changes.status !== undefined) {
    const current = await getCampaignById(id, client);
    if (!current) throw new Error("Seeding campaign not found");
    if (changes.status !== current.status) {
      const allowed = SEEDING_CAMPAIGN_ALLOWED_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(changes.status)) {
        throw new SeedingValidationError(`Invalid campaign status transition: ${current.status} -> ${changes.status}`);
      }
    }
  }

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

/** Phase 2K-BP — Reassign Connected Page. Deliberately a SEPARATE
 * function from updateCampaign/WRITABLE_FIELDS, not a fourth field
 * folded into the generic update path: this one needs its own
 * validation (the target Page must actually exist as a connected
 * facebook_pages row — never trust a client-supplied facebook_page_id
 * directly, per this phase's own hard requirement) that no other
 * campaign field needs.
 *
 * Idempotent by design: reassigning to the campaign's own current Page
 * is a no-op (no write, no activity-log entry) — matches this phase's
 * "same Page reassignment must be handled honestly, no unnecessary side
 * effect" requirement.
 *
 * Does NOT touch seeding_campaign_targets, seeding_tasks, or any
 * existing task's execution_account_id/assigned_staff_id/
 * external_comment_id — this changes exactly one thing: which Page a
 * campaign's future Direct Comment attempts authenticate as. Every
 * existing target's facebook_post_id (Facebook's own composite id,
 * inherently tied to whichever Page actually created that post) is left
 * completely untouched — if the newly assigned Page is genuinely a
 * different real Facebook identity than the one those posts were
 * created on, a future Direct Comment attempt on an EXISTING target may
 * legitimately fail at the Graph API with a permission error; that is
 * the existing, correct "never fake success" behavior
 * (seedingDirectComment.service.ts), not something this function needs
 * to special-case. */
export async function reassignCampaignPage(
  campaignId: string,
  facebookPageId: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingCampaign> {
  if (!facebookPageId?.trim()) {
    throw new SeedingValidationError("Vui lòng chọn một Facebook Page");
  }

  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) throw new SeedingValidationError("Không tìm thấy campaign");

  if (campaign.facebook_page_id === facebookPageId) {
    return campaign;
  }

  // Never trust the client-supplied id directly — the target Page must
  // resolve to a real connected facebook_pages row.
  const page = await getPageByFacebookPageId(facebookPageId, client);
  if (!page) {
    throw new SeedingValidationError("Facebook Page được chọn không tồn tại hoặc chưa được kết nối trong CRM");
  }

  const { data, error } = await client
    .from("seeding_campaigns")
    .update({ facebook_page_id: facebookPageId })
    .eq("id", campaignId)
    .select()
    .single();
  if (error) throw error;

  await logActivity(
    { staff_id: actorStaffId, action: "seeding_campaign_page_reassigned", entity: "seeding_campaign", entity_id: campaignId },
    client
  );
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
  // Structurally unreachable: facebook_post_id is only ever set by the
  // legacy pre-Phase-2C single-post creation path, which always supplies a
  // real facebook_page_id — no manual-only campaign can have a
  // facebook_post_id. Guarded anyway for the type checker, not an unsafe
  // non-null assertion.
  if (!campaign.facebook_page_id) throw new Error("Campaign has a facebook_post_id but no facebook_page_id");

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
