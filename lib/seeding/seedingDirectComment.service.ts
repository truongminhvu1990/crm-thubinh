import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SeedingTask,
  SeedingDirectCommentCapability,
  SeedingCampaignPageInfo,
  SeedingTargetCompatibilityResult,
  SeedingTargetCompatibilityMap,
  SeedingDirectCommentPublishResult,
} from "@/types/seeding";
import { FacebookPage } from "@/types/facebookTools";
import { getCampaignById } from "./seedingCampaign.service";
import { getTaskById } from "./seedingTask.service";
import { loadTargetContext } from "./seedingDistribution.service";
import { SeedingValidationError } from "./seeding.errors";
import { getPageByFacebookPageId, getDecryptedPageAccessToken } from "@/lib/facebookTools/facebookPage.service";
import { createComment, FacebookGraphError } from "@/lib/facebookTools/facebookGraphClient";
import { logActivity } from "@/lib/activityLog.service";

/** Phase 2K-BK — Direct Facebook Comment Publish.
 *
 * Page-only, by design (see the 2K-BK feasibility audit): Personal and
 * Group content have no officially supported Graph API path for
 * publishing a comment, and this module never attempts one — no browser
 * automation, no credential storage, no unsupported API. Reuses the
 * existing Comment-task lifecycle (SEEDING_TASK_ALLOWED_TRANSITIONS,
 * locked PO decision 2026-08-26) as-is: Pending -> In Progress ("posting")
 * -> Done ("posted", tagged with the real external_comment_id) or Failed
 * ("failed", reason in the existing result_note field). No new status
 * enum was introduced — the existing one already had exactly the right
 * semantics.
 *
 * AI generation stays completely separate from this module: a task's
 * comment_text is whatever was already generated/edited before this
 * point (see seedingComment.ai.service.ts's own quality gate, 2K-BE) —
 * publishing never re-runs or re-validates generation, it only ever
 * submits the text that's already on the task, verbatim. */

/** Campaign-level check: cheap (no live Graph API call), reads the
 * connected facebook_pages row's own health status
 * (Connected/Reconnect Required/Disconnected) — the same signal Comment
 * Shield already relies on. Shared by every Page-sourced task in the
 * campaign, since capability depends only on the campaign's one
 * connected Page. NOT_SUPPORTED (Personal/Group) is a per-task
 * determination the caller makes from the target's own source_type —
 * this function only ever answers "can Page-sourced direct commenting
 * work for this campaign at all." */
export async function checkDirectCommentCapability(
  campaignId: string,
  client: SupabaseClient = supabase
): Promise<SeedingDirectCommentCapability> {
  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) return { availability: "UNAVAILABLE", reason: "Không tìm thấy campaign" };

  const page = campaign.facebook_page_id ? await getPageByFacebookPageId(campaign.facebook_page_id, client) : null;
  if (!page) return { availability: "UNAVAILABLE", reason: "Facebook Page của campaign này chưa được kết nối trong CRM" };
  return derivePageCapability(page);
}

/** Phase 2K-BO — extracted from checkDirectCommentCapability's own logic
 * (behavior unchanged, byte-for-byte) so the Account Center can compute
 * the exact same server-side capability for a connected Page directly,
 * without needing a campaign in scope. Single source of truth: both
 * checkDirectCommentCapability (campaign-scoped, used by the publish
 * flow) and the Account Center's page listing (account-scoped) resolve
 * capability through this one function — never two independent
 * implementations of the same rule. */
export function derivePageCapability(page: Pick<FacebookPage, "status"> | null): SeedingDirectCommentCapability {
  if (!page) return { availability: "UNAVAILABLE", reason: "Facebook Page chưa được kết nối trong CRM" };
  if (page.status === "Reconnect Required") {
    return { availability: "UNAVAILABLE", reason: "Facebook Page cần được kết nối lại trước khi đăng comment trực tiếp" };
  }
  if (page.status === "Disconnected") {
    return { availability: "UNAVAILABLE", reason: "Facebook Page đã ngắt kết nối" };
  }
  return { availability: "AVAILABLE" };
}

/** Phase 2K-BP — Campaign Detail's "Connected Facebook Page" panel reads
 * this directly: the campaign's own facebook_page_id, the resolved
 * Page's display name/status (or null/null when unresolvable), and its
 * capability computed through the exact same derivePageCapability used
 * everywhere else — never a second, UI-side capability decision. Never
 * throws on a missing campaign/Page — always returns an honest "no Page"
 * shape instead, the same "explicit unknown, not a guess" convention as
 * checkDirectCommentCapability. */
export async function getCampaignPageInfo(campaignId: string, client: SupabaseClient = supabase): Promise<SeedingCampaignPageInfo> {
  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) {
    return { facebook_page_id: null, page_name: null, status: null, capability: { availability: "UNAVAILABLE", reason: "Không tìm thấy campaign" } };
  }
  if (!campaign.facebook_page_id) {
    return {
      facebook_page_id: null,
      page_name: null,
      status: null,
      capability: { availability: "UNAVAILABLE", reason: "Campaign chưa gắn với Facebook Page nào" },
    };
  }

  const page = await getPageByFacebookPageId(campaign.facebook_page_id, client);
  return {
    facebook_page_id: campaign.facebook_page_id,
    page_name: page?.page_name ?? null,
    status: page?.status ?? null,
    capability: derivePageCapability(page),
  };
}

type TargetCompatibilityRow = {
  id: string;
  manual_content_reference_id: string | null;
  facebook_page_posts: { facebook_page_id: string } | { facebook_page_id: string }[] | null;
};

/** Phase 2K-BQ — pure derivation, single source of truth for both the
 * per-target and batch (per-campaign) compatibility functions below.
 * Compares ONLY two already-persisted, FK-backed columns
 * (facebook_page_posts.facebook_page_id vs the campaign's own
 * facebook_page_id) — never any form of URL/ID-pattern/text inference. */
function deriveTargetCompatibility(
  campaignFacebookPageId: string | null,
  targetRow: TargetCompatibilityRow
): SeedingTargetCompatibilityResult {
  if (targetRow.manual_content_reference_id) {
    return {
      compatibility: "NOT_SUPPORTED",
      reason: "Nguồn Personal/Group không hỗ trợ đăng comment trực tiếp qua API.",
    };
  }

  if (!campaignFacebookPageId) {
    return {
      compatibility: "UNKNOWN",
      reason: "Campaign hiện chưa gắn với Facebook Page nào để so sánh.",
    };
  }

  const postOwner = Array.isArray(targetRow.facebook_page_posts)
    ? targetRow.facebook_page_posts[0]
    : targetRow.facebook_page_posts;
  const postOwningPageId = postOwner?.facebook_page_id ?? null;
  if (!postOwningPageId) {
    return {
      compatibility: "UNKNOWN",
      reason: "Không xác định được Facebook Page sở hữu bài viết này.",
    };
  }

  if (postOwningPageId === campaignFacebookPageId) {
    return { compatibility: "COMPATIBLE" };
  }

  return {
    compatibility: "INCOMPATIBLE",
    reason: "Bài viết này thuộc một Facebook Page khác với Connected Page hiện tại của campaign — có thể không đăng được bằng Page hiện tại.",
  };
}

/** Phase 2K-BQ — batch version: computes compatibility for every target
 * in one campaign in a single pair of queries (campaign + all targets
 * joined to their owning Page), for the Campaign Detail page to annotate
 * every target row without N+1 requests. Always reflects the campaign's
 * CURRENT facebook_page_id — there is no cache to invalidate after a
 * Page reassignment (2K-BP), this function re-reads live on every call,
 * the same live-read pattern every other capability check in this module
 * already uses. */
export async function getTargetCompatibilityForCampaign(
  campaignId: string,
  client: SupabaseClient = supabase
): Promise<SeedingTargetCompatibilityMap> {
  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) return {};

  const { data: targetRows, error } = await client
    .from("seeding_campaign_targets")
    .select("id, manual_content_reference_id, facebook_page_posts(facebook_page_id)")
    .eq("campaign_id", campaignId);
  if (error) throw error;

  const result: SeedingTargetCompatibilityMap = {};
  for (const row of (targetRows ?? []) as TargetCompatibilityRow[]) {
    result[row.id] = deriveTargetCompatibility(campaign.facebook_page_id, row);
  }
  return result;
}

/** Phase 2K-BS — single-target counterpart to getTargetCompatibilityForCampaign,
 * used by publishDirectComment to freshly recompute ONE target's
 * compatibility at publish time. Reuses the exact same pure derivation
 * (deriveTargetCompatibility) — never a second, independent rule. */
export async function checkTargetCompatibility(
  campaignId: string,
  campaignTargetId: string,
  client: SupabaseClient = supabase
): Promise<SeedingTargetCompatibilityResult> {
  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) return { compatibility: "UNKNOWN", reason: "Không tìm thấy campaign" };

  const { data: targetRow, error } = await client
    .from("seeding_campaign_targets")
    .select("id, manual_content_reference_id, facebook_page_posts(facebook_page_id)")
    .eq("id", campaignTargetId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!targetRow) return { compatibility: "UNKNOWN", reason: "Không tìm thấy target" };

  return deriveTargetCompatibility(campaign.facebook_page_id, targetRow as TargetCompatibilityRow);
}

async function markTaskFailed(taskId: string, actorStaffId: string | null, reason: string, client: SupabaseClient): Promise<void> {
  await client
    .from("seeding_tasks")
    .update({ status: "Failed", result_note: reason, executed_at: new Date().toISOString() })
    .eq("id", taskId);
  await logActivity(
    { staff_id: actorStaffId, action: "seeding_task_direct_comment_failed", entity: "seeding_task", entity_id: taskId },
    client
  ).catch(() => {});
}

/** Publishes ONE Comment task's existing comment_text directly to
 * Facebook, as the campaign's connected Page. The whole operation is a
 * single human-initiated action (never autonomous/batch) — a caller
 * invokes this once per explicit user click.
 *
 * Duplicate/concurrent-submission protection: the Pending -> In Progress
 * transition below is an ATOMIC conditional UPDATE
 * (`WHERE id = ... AND status = 'Pending'`), not a read-then-write — a
 * second concurrent or repeated-click call finds zero rows affected
 * (Postgres row-level locking guarantees only one caller ever wins the
 * race) and is rejected honestly, before ever calling Facebook a second
 * time. This is deliberately NOT the same code path as
 * seedingTask.service.ts's updateTaskStatus (which does read-then-write
 * and is fine for its own human-paced manual-status-update use case, but
 * not strong enough a guarantee for this one).
 *
 * Never marks Done until Facebook's own response confirms success
 * (a real comment id) — any failure (validation, missing Page/target
 * data, or a genuine FacebookGraphError from Meta) transitions the task
 * to Failed with an honest reason in result_note, never leaves it
 * silently stuck In Progress, and never claims a fabricated success.
 *
 * Phase 2K-BS — INCOMPATIBLE acknowledgment protocol. `acknowledged`
 * defaults to false (safe default: an old/unmodified caller behaves
 * exactly as before for every case except a genuinely INCOMPATIBLE
 * target, where it now returns a needsAcknowledgment shape instead of
 * attempting a publish). Compatibility is ALWAYS recomputed fresh here,
 * from the same live DB read checkTargetCompatibility/
 * getTargetCompatibilityForCampaign use — the caller's `acknowledged`
 * flag is the only thing ever trusted from the client; no compatibility
 * value, target owner Page, or override is ever accepted from outside.
 *
 * UNKNOWN and COMPATIBLE never require acknowledgment (fall through
 * unconditionally, `acknowledged` is irrelevant to them). NOT_SUPPORTED
 * is unreachable at this point in the function — the `source_type !==
 * "Page"` check above it already rejects every case that could ever
 * produce NOT_SUPPORTED (a manual-content target), so that existing
 * check remains the sole, authoritative NOT_SUPPORTED enforcement.
 *
 * The acknowledgment activity log is written AFTER the atomic claim
 * succeeds (immediately before the real Graph API attempt), not before
 * it — this reuses the SAME atomic Pending -> In Progress claim as the
 * one and only concurrency guard: a losing concurrent request throws at
 * the claim and never reaches the log write, so two concurrent
 * acknowledged requests for an INCOMPATIBLE target can never produce two
 * log entries (or two Graph API calls) — no separate acknowledgment
 * concurrency primitive was introduced. */
export async function publishDirectComment(
  taskId: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase,
  acknowledged: boolean = false
): Promise<SeedingDirectCommentPublishResult> {
  const task = await getTaskById(taskId, client);
  if (!task) throw new SeedingValidationError("Không tìm thấy task");
  if (task.action_type !== "Comment") {
    throw new SeedingValidationError("Đăng trực tiếp chỉ áp dụng cho task loại Comment");
  }
  if (!task.comment_text) {
    throw new SeedingValidationError("Task chưa có nội dung comment để đăng");
  }
  if (!task.campaign_target_id) {
    throw new SeedingValidationError("Task không gắn với target nào — không thể đăng trực tiếp");
  }

  const target = await loadTargetContext(task.campaign_id, task.campaign_target_id, client);
  if (target.source_type !== "Page") {
    throw new SeedingValidationError("Đăng comment trực tiếp chỉ được hỗ trợ cho nguồn Page — nguồn này chưa được Meta hỗ trợ chính thức");
  }

  const capability = await checkDirectCommentCapability(task.campaign_id, client);
  if (capability.availability !== "AVAILABLE") {
    throw new SeedingValidationError(capability.reason ?? "Đăng comment trực tiếp hiện chưa khả dụng");
  }

  const compatibility = await checkTargetCompatibility(task.campaign_id, task.campaign_target_id, client);
  const requiresAcknowledgment = compatibility.compatibility === "INCOMPATIBLE";
  if (requiresAcknowledgment && !acknowledged) {
    return {
      needsAcknowledgment: true,
      compatibility: "INCOMPATIBLE",
      reason: compatibility.reason ?? "Target này có thể thuộc một Facebook Page khác với Connected Page hiện tại của campaign.",
    };
  }

  const { data: claimed, error: claimError } = await client
    .from("seeding_tasks")
    .update({ status: "In Progress", executed_by_staff_id: actorStaffId, executed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "Pending")
    .select()
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    throw new SeedingValidationError("Task đã được xử lý hoặc đang được đăng bởi một yêu cầu khác — không thể đăng lại");
  }

  if (requiresAcknowledgment) {
    // Only the request that just won the atomic claim above reaches this
    // line — a concurrent duplicate found `!claimed` and already threw,
    // so this write can never happen twice for the same publish attempt.
    await logActivity(
      {
        staff_id: actorStaffId,
        action: "seeding_task_direct_comment_incompatible_acknowledged",
        entity: "seeding_task",
        entity_id: taskId,
      },
      client
    ).catch(() => {});
  }

  const { data: targetRow, error: targetRowError } = await client
    .from("seeding_campaign_targets")
    .select("facebook_post_id")
    .eq("id", task.campaign_target_id)
    .maybeSingle();
  if (targetRowError) throw targetRowError;
  const facebookPostId = (targetRow as { facebook_post_id?: string } | null)?.facebook_post_id;
  if (!facebookPostId) {
    const reason = "Không tìm thấy Facebook post id của target";
    await markTaskFailed(taskId, actorStaffId, reason, client);
    throw new SeedingValidationError(reason);
  }

  const campaign = await getCampaignById(task.campaign_id, client);
  const page = campaign?.facebook_page_id ? await getPageByFacebookPageId(campaign.facebook_page_id, client) : null;
  if (!page) {
    const reason = "Không tìm thấy Facebook Page đã kết nối cho campaign này";
    await markTaskFailed(taskId, actorStaffId, reason, client);
    throw new SeedingValidationError(reason);
  }

  try {
    const pageAccessToken = await getDecryptedPageAccessToken(page.id, client);
    const created = await createComment(facebookPostId, task.comment_text, pageAccessToken);

    const { data: done, error: doneError } = await client
      .from("seeding_tasks")
      .update({ status: "Done", external_comment_id: created.id, executed_at: new Date().toISOString() })
      .eq("id", taskId)
      .select()
      .single();
    if (doneError) throw doneError;

    await logActivity(
      { staff_id: actorStaffId, action: "seeding_task_direct_comment_posted", entity: "seeding_task", entity_id: taskId },
      client
    );
    return done as SeedingTask;
  } catch (error) {
    const reason =
      error instanceof FacebookGraphError || error instanceof Error ? error.message : "Đăng comment trực tiếp thất bại";
    await markTaskFailed(taskId, actorStaffId, reason, client);
    throw new SeedingValidationError(reason);
  }
}
