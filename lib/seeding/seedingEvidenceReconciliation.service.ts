import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SeedingTask,
  SeedingTaskEvidenceResult,
  SeedingTaskEvidenceConfidence,
  SeedingTaskWithEvidence,
  SeedingEvidenceReconciliationBatchResult,
  SEEDING_TASK_EVIDENCE_TRANSIENT_RESULTS,
} from "@/types/seeding";
import { logActivity } from "@/lib/activityLog.service";
import { getPostCommentsBoundedSample, FacebookLivePostCommentData } from "@/lib/facebookTools/facebookGraphClient";
import { getDecryptedPageAccessToken, getPageByFacebookPageId, markPageReconnectRequired, isReconnectRequiredError } from "@/lib/facebookTools/facebookPage.service";
import { getCampaignById } from "./seedingCampaign.service";
import { findExactMatch, rankAiCandidates, hashCommentText, hashEvidenceSnapshot } from "./seedingEvidenceMatch.deterministic";
import { requestEvidenceMatchFromClaude, getEvidenceModelVersion, EVIDENCE_PROMPT_VERSION, AiEvidenceMatchInput, AiEvidenceMatchResult } from "./seedingEvidenceMatch.ai.service";

/** Phase 2F — AI-Powered Evidence Reconciliation orchestration. Batch/
 * polling pattern (PO-locked architecture), mirroring
 * facebookHideJob.service.ts's processNextBatch: no cron/queue/worker, the
 * caller (a manager-triggered UI) calls reconcileNextBatch() repeatedly
 * until hasMoreCandidates is false. Bounded, resumable, safe to interrupt —
 * state lives entirely in seeding_task_evidence_results/_checks, never in
 * memory between calls.
 *
 * seeding_tasks itself is NEVER written by anything in this file — no
 * .update() call against that table appears anywhere below. This is a
 * structural guarantee, not just a convention. */

export const DEFAULT_BATCH_SIZE = 10;

interface CandidateTask {
  id: string;
  campaign_target_id: string;
  comment_text: string;
  facebook_post_id: string;
  /** Phase 2J-D — true when this task's target is a manual Personal/Group
   * reference (facebook_manual_content_references), not a Page-synced
   * post. No token exists that can read such content, so this task can
   * never be Graph-verified — reconcileNextBatch skips it honestly rather
   * than attempting a fetch that would either crash or require faking a
   * result. */
  isManualSource: boolean;
}

/** Pure, exported for direct unit testing. A task is eligible for the next
 * batch round when: never checked before, its comment_text changed since
 * the last recorded check (hash mismatch), or its last result was one of
 * the transient-failure states (Partial Evidence / Evidence Unavailable /
 * Reconnect Required) — which represent "we couldn't get a real answer
 * yet," not a real conclusion. A resolved-and-unchanged task (Exact Match /
 * AI Match / Not Found / Ambiguous with an unchanged comment_text) is never
 * re-selected — this IS the idempotency mechanism (§7-8): it prevents
 * re-fetching Facebook and re-calling AI before either ever happens, not
 * after. */
export function isTaskEligibleForReconciliation(
  commentText: string,
  existing: { result: SeedingTaskEvidenceResult; comment_text_hash: string } | undefined
): boolean {
  if (!existing) return true;
  if (hashCommentText(commentText) !== existing.comment_text_hash) return true;
  return (SEEDING_TASK_EVIDENCE_TRANSIENT_RESULTS as string[]).includes(existing.result);
}

async function loadCandidateTasks(campaignId: string, client: SupabaseClient): Promise<CandidateTask[]> {
  const { data: tasks, error: tasksError } = await client
    .from("seeding_tasks")
    .select("id, campaign_target_id, comment_text")
    .eq("campaign_id", campaignId)
    .eq("action_type", "Comment")
    .not("campaign_target_id", "is", null)
    .not("comment_text", "is", null);
  if (tasksError) throw tasksError;

  const commentTasks = (tasks ?? []) as { id: string; campaign_target_id: string; comment_text: string }[];
  if (commentTasks.length === 0) return [];

  const targetIds = [...new Set(commentTasks.map((t) => t.campaign_target_id))];
  const { data: targetRows, error: targetsError } = await client
    .from("seeding_campaign_targets")
    .select("id, facebook_post_id, manual_content_reference_id")
    .in("id", targetIds);
  if (targetsError) throw targetsError;
  const targetRowsTyped = (targetRows ?? []) as { id: string; facebook_post_id: string; manual_content_reference_id: string | null }[];
  const postIdByTarget = new Map(targetRowsTyped.map((t) => [t.id, t.facebook_post_id]));
  const isManualByTarget = new Map(targetRowsTyped.map((t) => [t.id, !!t.manual_content_reference_id]));

  const { data: existingRows, error: existingError } = await client
    .from("seeding_task_evidence_results")
    .select("task_id, result, comment_text_hash")
    .in(
      "task_id",
      commentTasks.map((t) => t.id)
    );
  if (existingError) throw existingError;
  const existingByTaskId = new Map(
    ((existingRows ?? []) as { task_id: string; result: SeedingTaskEvidenceResult; comment_text_hash: string }[]).map((r) => [r.task_id, r])
  );

  return commentTasks
    .filter((t) => postIdByTarget.has(t.campaign_target_id))
    .filter((t) => isTaskEligibleForReconciliation(t.comment_text, existingByTaskId.get(t.id)))
    .map((t) => ({
      id: t.id,
      campaign_target_id: t.campaign_target_id,
      comment_text: t.comment_text,
      facebook_post_id: postIdByTarget.get(t.campaign_target_id)!,
      isManualSource: isManualByTarget.get(t.campaign_target_id) ?? false,
    }));
}

interface PersistInput {
  taskId: string;
  result: SeedingTaskEvidenceResult;
  matchedCommentId: string | null;
  matchedSnippet: string | null;
  confidence: SeedingTaskEvidenceConfidence | null;
  commentTextHash: string;
  evidenceSnapshotHash: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  actorStaffId: string | null;
}

/** Writes the current-state row (upsert by task_id) AND an append-only
 * history row — the two-table hybrid (PO-locked). Never touches
 * seeding_tasks. */
async function persistResult(input: PersistInput, client: SupabaseClient): Promise<void> {
  const row = {
    task_id: input.taskId,
    result: input.result,
    matched_comment_id: input.matchedCommentId,
    matched_comment_snippet: input.matchedSnippet,
    confidence: input.confidence,
    comment_text_hash: input.commentTextHash,
    evidence_snapshot_hash: input.evidenceSnapshotHash,
    model_version: input.modelVersion,
    prompt_version: input.promptVersion,
    checked_at: new Date().toISOString(),
    checked_by_staff_id: input.actorStaffId,
  };

  const { error: upsertError } = await client.from("seeding_task_evidence_results").upsert(row, { onConflict: "task_id" });
  if (upsertError) throw upsertError;

  const { error: historyError } = await client.from("seeding_task_evidence_checks").insert(row);
  if (historyError) throw historyError;
}

async function reconcileTask(
  task: CandidateTask,
  comments: FacebookLivePostCommentData[],
  hasMore: boolean,
  actorStaffId: string | null,
  client: SupabaseClient,
  aiMatchFn: (input: AiEvidenceMatchInput) => Promise<AiEvidenceMatchResult>
): Promise<SeedingTaskEvidenceResult> {
  const commentTextHash = hashCommentText(task.comment_text);
  const evidenceSnapshotHash = hashEvidenceSnapshot(comments);

  const persist = (
    result: SeedingTaskEvidenceResult,
    extra: Partial<Pick<PersistInput, "matchedCommentId" | "matchedSnippet" | "confidence" | "modelVersion" | "promptVersion">> = {}
  ) =>
    persistResult(
      {
        taskId: task.id,
        result,
        matchedCommentId: extra.matchedCommentId ?? null,
        matchedSnippet: extra.matchedSnippet ?? null,
        confidence: extra.confidence ?? null,
        commentTextHash,
        evidenceSnapshotHash,
        modelVersion: extra.modelVersion ?? null,
        promptVersion: extra.promptVersion ?? null,
        actorStaffId,
      },
      client
    );

  // Sample incomplete — Stage 3 (AI) never runs over evidence it wasn't
  // shown. Never a false Not Found (module scope, §2/§5).
  if (hasMore) {
    await persist("Partial Evidence");
    return "Partial Evidence";
  }

  const exact = findExactMatch(task.comment_text, comments);
  if (exact.outcome === "Exact Match") {
    await persist("Exact Match", { matchedCommentId: exact.matchedCommentId, matchedSnippet: exact.matchedSnippet });
    return "Exact Match";
  }

  const candidates = rankAiCandidates(task.comment_text, comments);
  if (comments.length === 0 || candidates.length === 0) {
    await persist("Not Found");
    return "Not Found";
  }

  try {
    const aiResult = await aiMatchFn({
      assignedCommentText: task.comment_text,
      candidates: candidates.map((c) => c.message ?? ""),
    });
    const matched = aiResult.bestMatchIndex !== null ? (candidates[aiResult.bestMatchIndex] ?? null) : null;
    const outcome: SeedingTaskEvidenceResult = aiResult.confidence === "high" && matched ? "AI Match (High Confidence)" : "Ambiguous";
    await persist(outcome, {
      matchedCommentId: matched?.id ?? null,
      matchedSnippet: matched?.message ?? null,
      confidence: aiResult.confidence,
      modelVersion: getEvidenceModelVersion(),
      promptVersion: EVIDENCE_PROMPT_VERSION,
    });
    return outcome;
  } catch (aiError) {
    console.error("Evidence reconciliation AI call failed:", aiError);
    await persist("Evidence Unavailable");
    return "Evidence Unavailable";
  }
}

/** One batch round: pick up to `batchSize` eligible Comment tasks, group by
 * target post (one Facebook fetch per unique post, reused across every
 * task pointed at it — §E), run deterministic-then-AI matching per task,
 * persist. Returns hasMoreCandidates so the caller (the campaign detail
 * UI's "Chạy đối soát" action) knows whether to call again — identical
 * shape/intent to FacebookHideJobProgress's batchProcessed. */
export async function reconcileNextBatch(
  campaignId: string,
  batchSize: number = DEFAULT_BATCH_SIZE,
  actorStaffId: string | null,
  client: SupabaseClient = supabase,
  aiMatchFn: (input: AiEvidenceMatchInput) => Promise<AiEvidenceMatchResult> = requestEvidenceMatchFromClaude
): Promise<SeedingEvidenceReconciliationBatchResult> {
  const campaign = await getCampaignById(campaignId, client);
  if (!campaign) throw new Error("Seeding campaign not found");

  const allCandidates = await loadCandidateTasks(campaignId, client);
  if (allCandidates.length === 0) {
    return { processed: 0, hasMoreCandidates: false, results: [], skippedNoConnectedSource: [] };
  }

  const batch = allCandidates.slice(0, batchSize);
  const hasMoreCandidates = allCandidates.length > batch.length;

  // Phase 2J-D — a manual-source task's target (Personal/Group content, no
  // connected Page/token) is structurally impossible to Graph-verify. It
  // must never reach getPageByFacebookPageId/getDecryptedPageAccessToken
  // at all (that path assumes a real, usable token and would throw on a
  // null/absent one) — nor may it be marked with any evidence_result,
  // which would either misrepresent an attempt that never happened or
  // require inventing a new persisted state (see the Phase 2J-D
  // reconciliation report for why no existing state honestly fits).
  // Its evidence_result simply stays at the existing, honest "never
  // checked" null; the skip is reported only in this batch's own response.
  const pageBackedBatch = batch.filter((t) => !t.isManualSource);
  const skippedNoConnectedSource = batch
    .filter((t) => t.isManualSource)
    .map((t) => ({ taskId: t.id, reason: "Nội dung này không có Facebook Page kết nối để tự động đối soát" }));

  const results: { taskId: string; result: SeedingTaskEvidenceResult }[] = [];
  let reconnectMarked = false;

  if (pageBackedBatch.length === 0) {
    await logActivity(
      { staff_id: actorStaffId, action: "seeding_evidence_reconciliation_batch_run", entity: "seeding_campaign", entity_id: campaignId },
      client
    );
    return { processed: 0, hasMoreCandidates, results: [], skippedNoConnectedSource };
  }

  if (!campaign.facebook_page_id) {
    // Structurally unreachable: a Page-backed target can only exist when
    // its campaign has a real facebook_page_id (DB trigger
    // seeding_campaign_targets_check_page enforces this on write) — so
    // pageBackedBatch.length > 0 guarantees this is non-null. Guarded
    // explicitly anyway rather than asserted, for defense in depth.
    throw new Error("Seeding campaign has Page-backed candidates but no facebook_page_id");
  }
  const page = await getPageByFacebookPageId(campaign.facebook_page_id, client);
  if (!page) throw new Error("Facebook page not found for this campaign");
  const token = await getDecryptedPageAccessToken(page.id, client);

  const byPost = new Map<string, CandidateTask[]>();
  for (const task of pageBackedBatch) {
    const list = byPost.get(task.facebook_post_id) ?? [];
    list.push(task);
    byPost.set(task.facebook_post_id, list);
  }

  for (const [postId, tasksForPost] of byPost) {
    let fetched: { comments: FacebookLivePostCommentData[]; hasMore: boolean } | null = null;
    let fetchError: unknown = null;
    try {
      fetched = await getPostCommentsBoundedSample(postId, token);
    } catch (error) {
      fetchError = error;
    }

    if (fetchError) {
      const requiresReconnect = isReconnectRequiredError(fetchError);
      if (requiresReconnect && !reconnectMarked) {
        await markPageReconnectRequired(page.id, client);
        reconnectMarked = true;
      }
      const failResult: SeedingTaskEvidenceResult = requiresReconnect ? "Reconnect Required" : "Evidence Unavailable";
      for (const task of tasksForPost) {
        await persistResult(
          {
            taskId: task.id,
            result: failResult,
            matchedCommentId: null,
            matchedSnippet: null,
            confidence: null,
            commentTextHash: hashCommentText(task.comment_text),
            evidenceSnapshotHash: null,
            modelVersion: null,
            promptVersion: null,
            actorStaffId,
          },
          client
        );
        results.push({ taskId: task.id, result: failResult });
      }
      continue;
    }

    for (const task of tasksForPost) {
      const outcome = await reconcileTask(task, fetched!.comments, fetched!.hasMore, actorStaffId, client, aiMatchFn);
      results.push({ taskId: task.id, result: outcome });
    }
  }

  await logActivity(
    { staff_id: actorStaffId, action: "seeding_evidence_reconciliation_batch_run", entity: "seeding_campaign", entity_id: campaignId },
    client
  );

  return { processed: results.length, hasMoreCandidates, results, skippedNoConnectedSource };
}

/** Read-only: every Comment task in a campaign, enriched with its current
 * evidence result (nulls if never checked). Feeds both the default
 * exception-only view and the "view all" toggle (§6) — filtering by
 * SEEDING_TASK_EVIDENCE_EXCEPTION_RESULTS happens client-side against this
 * one list, no separate endpoint needed. */
export async function getEvidenceQueueForCampaign(campaignId: string, client: SupabaseClient = supabase): Promise<SeedingTaskWithEvidence[]> {
  const { data: tasks, error: tasksError } = await client
    .from("seeding_tasks")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("action_type", "Comment")
    .order("created_at", { ascending: true });
  if (tasksError) throw tasksError;
  const taskRows = (tasks ?? []) as SeedingTask[];
  if (taskRows.length === 0) return [];

  const { data: evidenceRows, error: evidenceError } = await client
    .from("seeding_task_evidence_results")
    .select("task_id, result, confidence, matched_comment_snippet, checked_at")
    .in(
      "task_id",
      taskRows.map((t) => t.id)
    );
  if (evidenceError) throw evidenceError;

  const evidenceByTaskId = new Map(
    (
      evidenceRows as {
        task_id: string;
        result: SeedingTaskEvidenceResult;
        confidence: SeedingTaskEvidenceConfidence | null;
        matched_comment_snippet: string | null;
        checked_at: string;
      }[]
    ).map((r) => [r.task_id, r])
  );

  return taskRows.map((t) => {
    const evidence = evidenceByTaskId.get(t.id);
    return {
      ...t,
      evidence_result: evidence?.result ?? null,
      evidence_confidence: evidence?.confidence ?? null,
      evidence_matched_comment_snippet: evidence?.matched_comment_snippet ?? null,
      evidence_checked_at: evidence?.checked_at ?? null,
    };
  });
}
