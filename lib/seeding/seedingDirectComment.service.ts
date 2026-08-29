import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { SeedingTask, SeedingDirectCommentCapability } from "@/types/seeding";
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
  if (page.status === "Reconnect Required") {
    return { availability: "UNAVAILABLE", reason: "Facebook Page cần được kết nối lại trước khi đăng comment trực tiếp" };
  }
  if (page.status === "Disconnected") {
    return { availability: "UNAVAILABLE", reason: "Facebook Page đã ngắt kết nối" };
  }
  return { availability: "AVAILABLE" };
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
 * silently stuck In Progress, and never claims a fabricated success. */
export async function publishDirectComment(
  taskId: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingTask> {
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
