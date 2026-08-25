import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { FacebookHideJob, FacebookHideJobProgress } from "@/types/facebookTools";
import { logActivity } from "@/lib/activityLog.service";
import { listAllComments, hideCommentsBatch, getCommentHiddenStatus } from "./facebookGraphClient";
import { getDecryptedPageAccessToken, getPageByFacebookPageId, markPageReconnectRequired, isReconnectRequiredError } from "./facebookPage.service";
import { getLivePostById, updateLivePostProcessingStatus } from "./facebookLivePost.service";

/** One polling round processes this many comments per Graph API Batch call
 * — comfortably under the 50-subrequest batch limit
 * (facebookGraphClient.ts's hideCommentsBatch), small enough that one round
 * always finishes well inside a serverless function's execution window.
 * There is deliberately no cron/scheduler here: the browser drives progress
 * by calling processNextBatch repeatedly while the Comment Shield page is
 * open (module scope: "Không tự động chạy theo lịch"). Closing the page
 * simply stops the polling — the job (and every comment log row) stays
 * exactly where it was, resumable on the next visit. */
export const HIDE_JOB_BATCH_SIZE = 20;

/** A comment log is retried automatically up to this many attempts within
 * the batch loop before being counted as a permanent error. */
const MAX_ATTEMPTS = 3;

async function getPageAccessTokenForLivePost(
  livePostFacebookPageId: string,
  client: SupabaseClient
): Promise<{ accessToken: string; pageRowId: string }> {
  const page = await getPageByFacebookPageId(livePostFacebookPageId, client);
  if (!page) throw new Error("Facebook page not found for this live post");
  const accessToken = await getDecryptedPageAccessToken(page.id, client);
  return { accessToken, pageRowId: page.id };
}

export async function getHideJobById(id: string, client: SupabaseClient = supabase): Promise<FacebookHideJob | null> {
  const { data, error } = await client.from("facebook_hide_jobs").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching Facebook hide job:", error);
    return null;
  }
  return data as FacebookHideJob | null;
}

/** Latest job for a live post — used so reopening the Comment Shield page
 * offers "Tiếp tục" instead of restarting an in-progress job. */
export async function getLatestHideJobForLivePost(
  livePostId: string,
  client: SupabaseClient = supabase
): Promise<FacebookHideJob | null> {
  const { data, error } = await client
    .from("facebook_hide_jobs")
    .select("*")
    .eq("facebook_live_post_id", livePostId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Error fetching latest Facebook hide job:", error);
    return null;
  }
  return data as FacebookHideJob | null;
}

/** "Ẩn toàn bộ comment": snapshot the post's full comment id list into
 * facebook_hide_comment_logs (one row per comment, status='pending') and
 * create the job row that tracks aggregate progress. Processing itself
 * happens in processNextBatch, called repeatedly by the browser. */
export async function createHideJob(
  livePostId: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<FacebookHideJob> {
  const livePost = await getLivePostById(livePostId, client);
  if (!livePost) throw new Error("Facebook live post not found");

  const { accessToken } = await getPageAccessTokenForLivePost(livePost.facebook_page_id, client);
  const commentIds = await listAllComments(livePost.facebook_post_id, accessToken);

  const { data: job, error: jobError } = await client
    .from("facebook_hide_jobs")
    .insert({
      facebook_live_post_id: livePostId,
      status: commentIds.length > 0 ? "pending" : "completed",
      total_comments: commentIds.length,
      started_by_staff_id: actorStaffId,
      completed_at: commentIds.length > 0 ? null : new Date().toISOString(),
    })
    .select()
    .single();
  if (jobError) throw jobError;

  if (commentIds.length > 0) {
    const { error: logsError } = await client
      .from("facebook_hide_comment_logs")
      .insert(commentIds.map((facebook_comment_id) => ({ hide_job_id: job.id, facebook_comment_id })));
    if (logsError) throw logsError;
  }

  await updateLivePostProcessingStatus(livePostId, commentIds.length > 0 ? "In Progress" : "Completed", client);
  await logActivity(
    { staff_id: actorStaffId, action: "facebook_hide_job_started", entity: "facebook_hide_job", entity_id: job.id },
    client
  );

  return job as FacebookHideJob;
}

/** "Ẩn 1 comment đã chọn" (Phase 4 MVP) — same job/log-row shape as
 * createHideJob, but the comment id list is given explicitly instead of
 * being derived from a fresh listAllComments() fetch. Kept as its own
 * function rather than a shared internal helper so createHideJob and
 * listAllComments stay untouched. Processing still goes through the same
 * processNextBatch/hideCommentsBatch path used by bulk jobs. */
export async function createHideJobForComments(
  livePostId: string,
  commentIds: string[],
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<FacebookHideJob> {
  if (commentIds.length === 0) throw new Error("No comment ids provided");

  const livePost = await getLivePostById(livePostId, client);
  if (!livePost) throw new Error("Facebook live post not found");

  const { data: job, error: jobError } = await client
    .from("facebook_hide_jobs")
    .insert({
      facebook_live_post_id: livePostId,
      status: "pending",
      total_comments: commentIds.length,
      started_by_staff_id: actorStaffId,
      completed_at: null,
    })
    .select()
    .single();
  if (jobError) throw jobError;

  const { error: logsError } = await client
    .from("facebook_hide_comment_logs")
    .insert(commentIds.map((facebook_comment_id) => ({ hide_job_id: job.id, facebook_comment_id })));
  if (logsError) throw logsError;

  await updateLivePostProcessingStatus(livePostId, "In Progress", client);
  await logActivity(
    { staff_id: actorStaffId, action: "facebook_hide_job_started", entity: "facebook_hide_job", entity_id: job.id },
    client
  );

  return job as FacebookHideJob;
}

/** Idempotency guard (2026-08-24): a job already in a terminal status
 * (completed/completed_with_errors/failed) whose recomputed status and
 * counters are unchanged from what's already stored is left untouched —
 * no write, no completed_at re-stamp, no repeat live-post notification.
 * This function has always been safe to call more than once on the same
 * job (processNextBatch's own docstring says so — that's still true), but
 * "safe" used to also mean "silently re-stamps completed_at to now() every
 * time it's called," which a concurrent/duplicate call (e.g. overlapping
 * polling) could trigger with zero underlying log-row change — proven on
 * Dev: a terminal job's completed_at moved hours forward with every
 * facebook_hide_comment_logs row for it provably untouched. A genuine
 * first transition into a terminal state, or any call where the recomputed
 * counters actually differ (a real batch just processed, or
 * retryFailedComments just reopened it), is unaffected — the comparison
 * below only short-circuits on a true no-op. */
async function recomputeAndPersistCounts(jobId: string, client: SupabaseClient): Promise<FacebookHideJob> {
  const currentJob = await getHideJobById(jobId, client);
  if (!currentJob) throw new Error("Facebook hide job not found");

  const { data: logs, error } = await client
    .from("facebook_hide_comment_logs")
    .select("status, attempt_count")
    .eq("hide_job_id", jobId);
  if (error) throw error;

  const successCount = logs.filter((l) => l.status === "success").length;
  const permanentErrorCount = logs.filter((l) => l.status === "error" && l.attempt_count >= MAX_ATTEMPTS).length;
  const remaining = logs.filter(
    (l) => l.status === "pending" || (l.status === "error" && l.attempt_count < MAX_ATTEMPTS)
  ).length;

  const processedCount = successCount + permanentErrorCount;
  const isDone = remaining === 0;
  const status = !isDone
    ? "in_progress"
    : permanentErrorCount === 0
      ? "completed"
      : successCount === 0
        ? "failed"
        : "completed_with_errors";

  const wasAlreadyTerminal =
    currentJob.status === "completed" || currentJob.status === "completed_with_errors" || currentJob.status === "failed";

  if (
    wasAlreadyTerminal &&
    currentJob.status === status &&
    currentJob.processed_count === processedCount &&
    currentJob.success_count === successCount &&
    currentJob.error_count === permanentErrorCount
  ) {
    return currentJob;
  }

  const { data: updated, error: updateError } = await client
    .from("facebook_hide_jobs")
    .update({
      processed_count: processedCount,
      success_count: successCount,
      error_count: permanentErrorCount,
      status,
      completed_at: isDone ? (wasAlreadyTerminal ? currentJob.completed_at : new Date().toISOString()) : null,
    })
    .eq("id", jobId)
    .select()
    .single();
  if (updateError) throw updateError;

  if (isDone && !wasAlreadyTerminal) {
    const job = updated as FacebookHideJob;
    const processingStatus = status === "completed" ? "Completed" : status === "failed" ? "Failed" : "Completed With Errors";
    await updateLivePostProcessingStatus(job.facebook_live_post_id, processingStatus, client);
  }

  return updated as FacebookHideJob;
}

/** One polling round: pick up to HIDE_JOB_BATCH_SIZE pending/retryable
 * comment rows, hide them via one Graph API batch call, persist each
 * result, then recompute the job's aggregate progress. Idempotent to call
 * again on an already-finished job (returns it unchanged, batchProcessed:0)
 * — the UI's polling loop can always call this without checking status
 * first. */
export async function processNextBatch(jobId: string, client: SupabaseClient = supabase): Promise<FacebookHideJobProgress> {
  const job = await getHideJobById(jobId, client);
  if (!job) throw new Error("Facebook hide job not found");
  if (job.status === "completed" || job.status === "completed_with_errors" || job.status === "failed") {
    return { job, batchProcessed: 0 };
  }

  const { data: candidates, error: candidatesError } = await client
    .from("facebook_hide_comment_logs")
    .select("id, facebook_comment_id, attempt_count")
    .eq("hide_job_id", jobId)
    .or(`status.eq.pending,and(status.eq.error,attempt_count.lt.${MAX_ATTEMPTS})`)
    .order("created_at", { ascending: true })
    .limit(HIDE_JOB_BATCH_SIZE);
  if (candidatesError) throw candidatesError;

  if (candidates.length === 0) {
    const finalized = await recomputeAndPersistCounts(jobId, client);
    return { job: finalized, batchProcessed: 0 };
  }

  const livePost = await getLivePostById(job.facebook_live_post_id, client);
  if (!livePost) throw new Error("Facebook live post not found for this job");
  const { accessToken, pageRowId } = await getPageAccessTokenForLivePost(livePost.facebook_page_id, client);

  let results;
  try {
    results = await hideCommentsBatch(
      candidates.map((c) => c.facebook_comment_id),
      accessToken
    );
  } catch (error) {
    if (isReconnectRequiredError(error)) await markPageReconnectRequired(pageRowId, client);
    throw error;
  }

  let reconnectNeeded = false;
  for (const [index, result] of results.entries()) {
    const candidate = candidates[index];
    const attempt_count = candidate.attempt_count + 1;

    if (result.success) {
      await client
        .from("facebook_hide_comment_logs")
        .update({ status: "success", attempt_count, processed_at: new Date().toISOString(), error_message: null })
        .eq("id", candidate.id);
      continue;
    }

    if (result.requiresReconnect) {
      reconnectNeeded = true;
      await client
        .from("facebook_hide_comment_logs")
        .update({
          status: "error",
          attempt_count: MAX_ATTEMPTS,
          error_message: result.errorMessage ?? "Unknown error",
        })
        .eq("id", candidate.id);
      continue;
    }

    // Non-reconnect failure — hideCommentsBatch's subresponse for this
    // comment can be wrong (Case B, 2026-08-25: proven on Dev that
    // POST {id}?is_hidden=true can report failure even though the
    // mutation applied). Verify with one read-only GET before recording
    // a permanent error. Fail-safe: anything other than a confirmed
    // is_hidden === true keeps the original failure — an ambiguous or
    // failed verification call is never treated as success.
    const confirmedHidden = await getCommentHiddenStatus(candidate.facebook_comment_id, accessToken);
    if (confirmedHidden === true) {
      await client
        .from("facebook_hide_comment_logs")
        .update({ status: "success", attempt_count, processed_at: new Date().toISOString(), error_message: null })
        .eq("id", candidate.id);
    } else {
      await client
        .from("facebook_hide_comment_logs")
        .update({
          status: "error",
          attempt_count,
          error_message: result.errorMessage ?? "Unknown error",
        })
        .eq("id", candidate.id);
    }
  }

  if (reconnectNeeded) await markPageReconnectRequired(pageRowId, client);

  const updatedJob = await recomputeAndPersistCounts(jobId, client);
  return { job: updatedJob, batchProcessed: results.length };
}

/** After a job finishes with permanent errors, "Thử lại các comment lỗi" —
 * resets attempt_count on permanently-failed rows back to 0 (pending) and
 * re-opens the job so the UI's polling loop can drain them, without
 * re-fetching the comment id list from Graph API again. */
export async function retryFailedComments(jobId: string, client: SupabaseClient = supabase): Promise<FacebookHideJob> {
  const { error } = await client
    .from("facebook_hide_comment_logs")
    .update({ status: "pending", attempt_count: 0, error_message: null })
    .eq("hide_job_id", jobId)
    .eq("status", "error");
  if (error) throw error;

  return recomputeAndPersistCounts(jobId, client);
}
