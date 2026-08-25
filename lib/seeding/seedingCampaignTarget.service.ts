import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SeedingCampaignTarget,
  SeedingCampaignTargetWithPost,
  AddCampaignTargetsResult,
  SeedingCampaignProgress,
  SeedingTaskStatus,
} from "@/types/seeding";
import { logActivity } from "@/lib/activityLog.service";
import { getCampaignById } from "./seedingCampaign.service";
import { SeedingValidationError } from "./seeding.errors";

/** Seeding Campaign Management (Phase 2C) — the Campaign <-> Target Post
 * junction. Kept in its own file, sibling to seedingCampaign.service.ts,
 * same one-concern-per-file convention as facebookLivePost.service.ts /
 * facebookLivePostComment.service.ts. Nothing here writes to Facebook —
 * facebook_page_posts is read-only from this module's point of view. */

interface CachedPostRow {
  id: string;
  facebook_page_id: string;
  facebook_post_id: string;
}

export async function getTargetsByCampaign(
  campaignId: string,
  client: SupabaseClient = supabase
): Promise<SeedingCampaignTargetWithPost[]> {
  const { data, error } = await client
    .from("seeding_campaign_targets")
    .select("*, facebook_page_posts(message, permalink_url, full_picture_url, discovery_status)")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching seeding campaign targets:", error);
    return [];
  }

  return (
    data as unknown as (SeedingCampaignTarget & {
      facebook_page_posts: {
        message: string | null;
        permalink_url: string | null;
        full_picture_url: string | null;
        discovery_status: string;
      } | null;
    })[]
  ).map((row) => {
    const { facebook_page_posts, ...target } = row;
    return {
      ...target,
      message: facebook_page_posts?.message ?? null,
      permalink_url: facebook_page_posts?.permalink_url ?? null,
      full_picture_url: facebook_page_posts?.full_picture_url ?? null,
      discovery_status: facebook_page_posts?.discovery_status ?? "Unavailable",
    };
  });
}

/** Idempotent bulk-add — a facebook_page_post_id already targeted by this
 * campaign is silently skipped (reported in `alreadyTargeted`, not an
 * error), same convention as this codebase's upsert-based sync flows.
 * Cross-Page membership is checked here (a friendly error before any
 * insert is attempted) as well as by the DB trigger
 * (seeding_campaign_targets_check_page) — the app-layer check exists so a
 * bad request fails with a clear message rather than a raw Postgres
 * exception surfacing to the caller. */
export async function addTargetsToCampaign(
  campaignId: string,
  facebookPagePostIds: string[],
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<AddCampaignTargetsResult> {
  if (facebookPagePostIds.length === 0) return { added: [], alreadyTargeted: [] };

  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) throw new Error("Seeding campaign not found");

  const { data: postRows, error: postsError } = await client
    .from("facebook_page_posts")
    .select("id, facebook_page_id, facebook_post_id")
    .in("id", facebookPagePostIds);
  if (postsError) throw postsError;

  const posts = (postRows ?? []) as CachedPostRow[];
  const foundIds = new Set(posts.map((p) => p.id));
  const missing = facebookPagePostIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new SeedingValidationError(`Facebook page post(s) not found in cache: ${missing.join(", ")}`);
  }

  const wrongPage = posts.filter((p) => p.facebook_page_id !== campaign.facebook_page_id);
  if (wrongPage.length > 0) {
    throw new SeedingValidationError(
      `Post(s) belong to a different Facebook Page than this campaign: ${wrongPage.map((p) => p.id).join(", ")}`
    );
  }

  const { data: existingRows, error: existingError } = await client
    .from("seeding_campaign_targets")
    .select("facebook_page_post_id")
    .eq("campaign_id", campaignId);
  if (existingError) throw existingError;
  const existingIds = new Set(((existingRows ?? []) as { facebook_page_post_id: string }[]).map((r) => r.facebook_page_post_id));

  const alreadyTargeted = posts.filter((p) => existingIds.has(p.id)).map((p) => p.id);
  const toInsert = posts.filter((p) => !existingIds.has(p.id));

  if (toInsert.length === 0) {
    return { added: [], alreadyTargeted };
  }

  const { data: inserted, error: insertError } = await client
    .from("seeding_campaign_targets")
    .insert(
      toInsert.map((p) => ({
        campaign_id: campaignId,
        facebook_page_post_id: p.id,
        facebook_post_id: p.facebook_post_id,
      }))
    )
    .select();
  if (insertError) throw insertError;

  await logActivity(
    { staff_id: actorStaffId, action: "seeding_campaign_targets_added", entity: "seeding_campaign", entity_id: campaignId },
    client
  );

  return { added: (inserted ?? []) as SeedingCampaignTarget[], alreadyTargeted };
}

const STATUS_COUNT_KEYS: { status: SeedingTaskStatus; key: keyof Omit<SeedingCampaignProgress, "total"> }[] = [
  { status: "Pending", key: "pending" },
  { status: "In Progress", key: "inProgress" },
  { status: "Done", key: "done" },
  { status: "Failed", key: "failed" },
  { status: "Skipped", key: "skipped" },
  { status: "Cancelled", key: "cancelled" },
];

/** Aggregates every task across every target of a campaign. Uses
 * count:"exact",head:true per status — never fetches task rows, so this
 * has no PostgREST default-row-cap exposure regardless of how large a
 * campaign gets (the same class of bug found and fixed in Phase 2A's
 * createdCount/updatedCount). Reads seeding_tasks.campaign_id directly
 * (denormalized on every new task, per PO decision) rather than joining
 * through seeding_campaign_targets. */
export async function getCampaignProgress(
  campaignId: string,
  client: SupabaseClient = supabase
): Promise<SeedingCampaignProgress> {
  const counts = await Promise.all(
    STATUS_COUNT_KEYS.map(({ status }) =>
      client.from("seeding_tasks").select("*", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", status)
    )
  );

  const progress: SeedingCampaignProgress = {
    total: 0,
    pending: 0,
    inProgress: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
  };

  counts.forEach((result, index) => {
    const { key } = STATUS_COUNT_KEYS[index];
    progress[key] = result.count ?? 0;
  });

  const { count: total } = await client.from("seeding_tasks").select("*", { count: "exact", head: true }).eq("campaign_id", campaignId);
  progress.total = total ?? 0;

  return progress;
}
