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
import { parseFacebookContentUrl, FacebookUrlIdConfidence } from "@/lib/facebookTools/facebookUrlParser";
import { getOrCreateManualContentReference } from "@/lib/facebookTools/facebookManualContent.service";
import { FacebookManualContentSourceType } from "@/types/facebookTools";

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

interface ManualReferenceRow {
  id: string;
  source_type: string;
  source_label: string | null;
  facebook_object_id: string;
}

export async function getTargetsByCampaign(
  campaignId: string,
  client: SupabaseClient = supabase
): Promise<SeedingCampaignTargetWithPost[]> {
  const { data, error } = await client
    .from("seeding_campaign_targets")
    .select(
      "*, facebook_page_posts(message, permalink_url, full_picture_url, discovery_status), facebook_manual_content_references(source_type, source_label, message, permalink_url, full_picture_url)"
    )
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
      facebook_manual_content_references: {
        source_type: string;
        source_label: string | null;
        message: string | null;
        permalink_url: string | null;
        full_picture_url: string | null;
      } | null;
    })[]
  ).map((row) => {
    const { facebook_page_posts, facebook_manual_content_references, ...target } = row;
    // Phase 2J-D — exactly one of the two joins resolves, per the DB's
    // own exclusive-arc CHECK constraint; a Page-backed target behaves
    // byte-for-byte as before this phase.
    if (facebook_manual_content_references) {
      return {
        ...target,
        source_type: facebook_manual_content_references.source_type as "Personal" | "Group",
        source_label: facebook_manual_content_references.source_label,
        message: facebook_manual_content_references.message,
        permalink_url: facebook_manual_content_references.permalink_url,
        full_picture_url: facebook_manual_content_references.full_picture_url,
        // A manual reference has no API-driven reachability signal —
        // "Active" here means "the reference itself still exists," never
        // a claim that Facebook content was actually re-checked.
        discovery_status: "Active",
      };
    }
    return {
      ...target,
      source_type: "Page" as const,
      source_label: null,
      message: facebook_page_posts?.message ?? null,
      permalink_url: facebook_page_posts?.permalink_url ?? null,
      full_picture_url: facebook_page_posts?.full_picture_url ?? null,
      discovery_status: facebook_page_posts?.discovery_status ?? "Unavailable",
    };
  });
}

/** Idempotent bulk-add — a facebook_page_post_id/manual_content_reference_id
 * already targeted by this campaign is silently skipped (reported in
 * `alreadyTargeted`, not an error), same convention as this codebase's
 * upsert-based sync flows. Cross-Page membership is checked here (a
 * friendly error before any insert is attempted) as well as by the DB
 * trigger (seeding_campaign_targets_check_page) — the app-layer check
 * exists so a bad request fails with a clear message rather than a raw
 * Postgres exception surfacing to the caller.
 *
 * Phase 2J-D — manualContentReferenceIds is a new, optional trailing
 * parameter (Architecture B). Every existing call site that only ever
 * passed facebookPagePostIds is byte-for-byte unaffected: the new
 * manual-reference branch below only runs when that array is non-empty,
 * so a Page-only call never touches facebook_manual_content_references at
 * all. */
export async function addTargetsToCampaign(
  campaignId: string,
  facebookPagePostIds: string[],
  actorStaffId: string | null,
  client: SupabaseClient = supabase,
  manualContentReferenceIds: string[] = []
): Promise<AddCampaignTargetsResult> {
  if (facebookPagePostIds.length === 0 && manualContentReferenceIds.length === 0) {
    return { added: [], alreadyTargeted: [] };
  }

  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) throw new Error("Seeding campaign not found");

  let posts: CachedPostRow[] = [];
  if (facebookPagePostIds.length > 0) {
    const { data: postRows, error: postsError } = await client
      .from("facebook_page_posts")
      .select("id, facebook_page_id, facebook_post_id")
      .in("id", facebookPagePostIds);
    if (postsError) throw postsError;

    posts = (postRows ?? []) as CachedPostRow[];
    const foundIds = new Set(posts.map((p) => p.id));
    const missing = facebookPagePostIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new SeedingValidationError(`Facebook page post(s) not found in cache: ${missing.join(", ")}`);
    }

    if (!campaign.facebook_page_id) {
      // A manual-only campaign (Phase 2J-D) has no connected Page at all —
      // there is nothing for a Page-backed target to belong to.
      throw new SeedingValidationError("Campaign này không gắn với Facebook Page nào — không thể thêm bài viết từ Page.");
    }
    const wrongPage = posts.filter((p) => p.facebook_page_id !== campaign.facebook_page_id);
    if (wrongPage.length > 0) {
      throw new SeedingValidationError(
        `Post(s) belong to a different Facebook Page than this campaign: ${wrongPage.map((p) => p.id).join(", ")}`
      );
    }
  }

  let manualRefs: ManualReferenceRow[] = [];
  if (manualContentReferenceIds.length > 0) {
    const { data: refRows, error: refsError } = await client
      .from("facebook_manual_content_references")
      .select("id, source_type, source_label, facebook_object_id")
      .in("id", manualContentReferenceIds);
    if (refsError) throw refsError;

    manualRefs = (refRows ?? []) as ManualReferenceRow[];
    const foundRefIds = new Set(manualRefs.map((r) => r.id));
    const missingRefs = manualContentReferenceIds.filter((id) => !foundRefIds.has(id));
    if (missingRefs.length > 0) {
      throw new SeedingValidationError(`Manual content reference(s) not found: ${missingRefs.join(", ")}`);
    }
  }

  const { data: existingRows, error: existingError } = await client
    .from("seeding_campaign_targets")
    .select("facebook_page_post_id, manual_content_reference_id")
    .eq("campaign_id", campaignId);
  if (existingError) throw existingError;
  const existingRowsTyped = (existingRows ?? []) as { facebook_page_post_id: string | null; manual_content_reference_id: string | null }[];
  const existingPageIds = new Set(existingRowsTyped.map((r) => r.facebook_page_post_id).filter((v): v is string => !!v));
  const existingManualIds = new Set(existingRowsTyped.map((r) => r.manual_content_reference_id).filter((v): v is string => !!v));

  const alreadyTargetedPages = posts.filter((p) => existingPageIds.has(p.id)).map((p) => p.id);
  const toInsertPages = posts.filter((p) => !existingPageIds.has(p.id));
  const alreadyTargetedManual = manualRefs.filter((r) => existingManualIds.has(r.id)).map((r) => r.id);
  const toInsertManual = manualRefs.filter((r) => !existingManualIds.has(r.id));

  const alreadyTargeted = [...alreadyTargetedPages, ...alreadyTargetedManual];

  if (toInsertPages.length === 0 && toInsertManual.length === 0) {
    return { added: [], alreadyTargeted };
  }

  const { data: inserted, error: insertError } = await client
    .from("seeding_campaign_targets")
    .insert([
      ...toInsertPages.map((p) => ({
        campaign_id: campaignId,
        facebook_page_post_id: p.id,
        facebook_post_id: p.facebook_post_id,
      })),
      ...toInsertManual.map((r) => ({
        campaign_id: campaignId,
        manual_content_reference_id: r.id,
        facebook_post_id: r.facebook_object_id,
      })),
    ])
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

export interface QuickCaptureTargetResult {
  outcome: "page_target_added" | "page_target_already_targeted" | "manual_target_added" | "manual_target_already_targeted";
  detectedSourceType: "Page" | FacebookManualContentSourceType;
  idConfidence: FacebookUrlIdConfidence;
  target: SeedingCampaignTarget | null;
}

async function findExistingTarget(
  campaignId: string,
  column: "facebook_page_post_id" | "manual_content_reference_id",
  value: string,
  client: SupabaseClient
): Promise<SeedingCampaignTarget | null> {
  const { data, error } = await client
    .from("seeding_campaign_targets")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq(column, value)
    .maybeSingle();
  if (error) throw error;
  return data as SeedingCampaignTarget | null;
}

/** Phase 2K-BU — Personal Post Quick Capture. ONE operation: paste a URL,
 * get a campaign target — reusing every existing piece (parseFacebookContentUrl,
 * facebook_page_posts lookup, getOrCreateManualContentReference,
 * addTargetsToCampaign) rather than inventing a parallel path. No new
 * table, no schema change.
 *
 * Source detection order, "resolve through what we actually already
 * know, never guess":
 * 1. A real Group permalink (parser-detected, unambiguous) -> Group.
 * 2. The resolved object id matches an ALREADY-KNOWN facebook_page_posts
 *    row (any Connected Page, cross-checked against the Graph API's own
 *    {page-id}_{post-id} composite id format, confirmed real via live Dev
 *    data) -> Page. Delegates to addTargetsToCampaign for the existing
 *    cross-Page validation (a post belonging to a different Page than
 *    this campaign's own is rejected there, unchanged).
 * 3. Otherwise -> Personal (or the caller's explicit sourceTypeOverride)
 *    via getOrCreateManualContentReference.
 *
 * Idempotent end-to-end: pasting the same URL twice reuses the same
 * reference (getOrCreateManualContentReference) and reports
 * "already_targeted" via addTargetsToCampaign's own existing dedup check
 * — never a duplicate reference, never a duplicate target. */
export async function quickCaptureTargetFromUrl(
  campaignId: string,
  rawUrl: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase,
  sourceTypeOverride?: FacebookManualContentSourceType
): Promise<QuickCaptureTargetResult> {
  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) throw new SeedingValidationError("Không tìm thấy campaign");

  const parsed = parseFacebookContentUrl(rawUrl);
  if (!parsed.ok) {
    throw new SeedingValidationError(parsed.reason);
  }

  if (parsed.isGroupUrl) {
    if (sourceTypeOverride && sourceTypeOverride !== "Group") {
      throw new SeedingValidationError('Đây là link bài viết trong Nhóm — vui lòng chọn nguồn "Nhóm" để nhập link này');
    }
    return captureAsManualTarget(campaignId, rawUrl, parsed.facebookObjectId, parsed.idConfidence, "Group", actorStaffId, client);
  }

  // Cross-check against already-known Page posts. Suffix-match handles
  // the Graph API's composite id format ({page-id}_{post-id}) against the
  // bare post id parsed from a permalink URL — same fetch-all-then-check
  // convention already used by importManualContentUrls' own dedup check,
  // safe at this project's real data scale.
  const { data: pagePostRows, error: pagePostError } = await client
    .from("facebook_page_posts")
    .select("id, facebook_post_id");
  if (pagePostError) throw pagePostError;
  const matchedPagePost = ((pagePostRows ?? []) as { id: string; facebook_post_id: string }[]).find(
    (p) => p.facebook_post_id === parsed.facebookObjectId || p.facebook_post_id.endsWith(`_${parsed.facebookObjectId}`)
  );

  if (matchedPagePost) {
    if (sourceTypeOverride) {
      throw new SeedingValidationError(
        "Bài viết này đã được nhận diện là bài của một Facebook Page đã kết nối — không thể chọn nguồn Personal/Group"
      );
    }
    const result = await addTargetsToCampaign(campaignId, [matchedPagePost.id], actorStaffId, client);
    const target = result.added[0] ?? (await findExistingTarget(campaignId, "facebook_page_post_id", matchedPagePost.id, client));
    return {
      outcome: result.added.length > 0 ? "page_target_added" : "page_target_already_targeted",
      detectedSourceType: "Page",
      idConfidence: parsed.idConfidence,
      target,
    };
  }

  return captureAsManualTarget(
    campaignId,
    rawUrl,
    parsed.facebookObjectId,
    parsed.idConfidence,
    sourceTypeOverride ?? "Personal",
    actorStaffId,
    client
  );
}

async function captureAsManualTarget(
  campaignId: string,
  rawUrl: string,
  facebookObjectId: string,
  idConfidence: FacebookUrlIdConfidence,
  sourceType: FacebookManualContentSourceType,
  actorStaffId: string | null,
  client: SupabaseClient
): Promise<QuickCaptureTargetResult> {
  const { reference } = await getOrCreateManualContentReference(
    { facebookObjectId, sourceType, permalinkUrl: rawUrl },
    actorStaffId,
    client
  );
  const result = await addTargetsToCampaign(campaignId, [], actorStaffId, client, [reference.id]);
  const target = result.added[0] ?? (await findExistingTarget(campaignId, "manual_content_reference_id", reference.id, client));
  return {
    outcome: result.added.length > 0 ? "manual_target_added" : "manual_target_already_targeted",
    // Reflects what's ACTUALLY persisted on the reference — never the
    // locally-computed `sourceType` above, since an already-existing
    // reference keeps whatever source_type it was first imported under
    // (see getOrCreateManualContentReference's own doc comment).
    detectedSourceType: reference.source_type,
    idConfidence,
    target,
  };
}
