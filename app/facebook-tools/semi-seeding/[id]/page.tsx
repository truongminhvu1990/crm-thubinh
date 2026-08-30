"use client";

import { useCallback, useEffect, useState, use } from "react";
import { Sparkles, RefreshCw, AlertTriangle, ImageOff, ExternalLink, Link2, Plus, ThumbsUp, MessageCircle, Share2, SearchCheck, Send, Pencil, Trash2 } from "lucide-react";
import {
  SeedingCampaign,
  SeedingCommentSuggestion,
  SeedingCommentIntent,
  SeedingTask,
  SeedingTaskStatus,
  SeedingCampaignTargetWithPost,
  SeedingCampaignProgress,
  SeedingTaskWithEvidence,
  SeedingEvidenceReconciliationBatchResult,
  SeedingDirectCommentCapability,
  SeedingCampaignPageInfo,
  SeedingPageAccountWithStats,
  SeedingTargetCompatibilityMap,
  SEEDING_COMMENT_CATEGORY_LABELS,
  SEEDING_TASK_ALLOWED_TRANSITIONS,
  SEEDING_TASK_EVIDENCE_EXCEPTION_RESULTS,
  SEEDING_CAMPAIGN_ALLOWED_TRANSITIONS,
} from "@/types/seeding";
import {
  seedingCampaignStatusLabel,
  seedingTaskStatusLabel,
  seedingTaskActionTypeLabel,
  SEEDING_COMMENT_INTENT_OPTIONS,
  resolveTargetDisplayText,
  seedingCampaignStatusBadgeVariant,
} from "@/lib/seeding/seeding.constants";
import { handleFacebookLinkClick, isMobileUserAgent } from "@/lib/utils";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import CampaignDistributionModal from "@/components/seeding/CampaignDistributionModal";

function taskStatusBadge(status: SeedingTaskStatus) {
  const label = seedingTaskStatusLabel(status);
  if (status === "Done") return <Badge variant="success">{label}</Badge>;
  if (status === "Failed") return <Badge variant="destructive">{label}</Badge>;
  if (status === "In Progress") return <Badge variant="default">{label}</Badge>;
  if (status === "Skipped" || status === "Cancelled") return <Badge variant="muted">{label}</Badge>;
  return <Badge variant="warning">{label}</Badge>;
}

/** Statuses that ask for a reason before committing (Phase 2E) — same
 * result_note field/API every other status already writes to (with
 * null), no new business rule. */
const STATUSES_REQUIRING_REASON = new Set<SeedingTaskStatus>(["Failed", "Skipped"]);

/** Phase 2F — evidence result badge. CONTENT-only reconciliation: this
 * never claims staff identity is verified, only that matching text was (or
 * wasn't) found on the target post. Exception results (see
 * SEEDING_TASK_EVIDENCE_EXCEPTION_RESULTS) render as "warning" — they're
 * the ones a manager should look at; Exact Match/AI Match/Not Found are
 * real, resolved answers and render as "success"/"muted". */
function evidenceResultBadge(evidence: SeedingTaskWithEvidence | undefined) {
  if (!evidence?.evidence_result) {
    return <span className="text-xs text-muted-foreground">Chưa kiểm tra</span>;
  }
  const result = evidence.evidence_result;
  const isException = (SEEDING_TASK_EVIDENCE_EXCEPTION_RESULTS as string[]).includes(result);
  const variant = isException ? "warning" : result === "Not Found" ? "muted" : "success";
  return (
    <div className="space-y-0.5">
      <Badge variant={variant}>{result}</Badge>
      {evidence.evidence_checked_at && (
        <p className="text-[10px] text-muted-foreground">
          {new Date(evidence.evidence_checked_at).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

function actionIcon(actionType: string) {
  if (actionType === "Like") return <ThumbsUp className="w-3.5 h-3.5" />;
  if (actionType === "Share") return <Share2 className="w-3.5 h-3.5" />;
  return <MessageCircle className="w-3.5 h-3.5" />;
}

export default function SeedingCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [campaign, setCampaign] = useState<SeedingCampaign | null>(null);
  const [isChangingCampaignStatus, setIsChangingCampaignStatus] = useState(false);
  // Phase 2G (M1-B) — only set when closing (-> Completed) would leave
  // Pending/In Progress tasks behind; holds the count so the confirmation
  // modal can state it explicitly. Never itself mutates any task.
  // Phase 2H (H1) — unfinishedCount is null specifically when progress
  // could not be determined (never a fabricated number) — the modal
  // renders distinct, honest copy for that case instead of a count.
  const [completionWarning, setCompletionWarning] = useState<{ next: SeedingCampaign["status"]; unfinishedCount: number | null } | null>(
    null
  );
  const [targets, setTargets] = useState<SeedingCampaignTargetWithPost[]>([]);
  const [suggestions, setSuggestions] = useState<SeedingCommentSuggestion[]>([]);
  const [tasks, setTasks] = useState<SeedingTask[]>([]);
  const [progress, setProgress] = useState<SeedingCampaignProgress | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Phase 2K-BY (P1 #7) — a single, page-level visible error surface for
  // secondary/background actions (status transitions, background
  // reloads) that previously failed silently (console.error only). This
  // never replaces a primary action's own inline error (Quick Capture,
  // description save, Page reassignment already show their own) — it
  // only covers the gap: actions with no dedicated error UI of their own.
  const [actionError, setActionError] = useState<string | null>(null);
  // Phase 2K-BY (P1 #3) — Remove Target. Only ever offered/attempted for
  // a target with zero tasks (client-side hint matching the server's own
  // authoritative check) — a target with any task, including a
  // completed one, can never be removed, by design.
  const [removingTargetId, setRemovingTargetId] = useState<string | null>(null);
  // Phase 2K-BO — so a Share task's row can show WHICH execution account
  // it's assigned to (previously invisible on this page — only
  // assigned_staff_id was shown). Read-only lookup, id -> display_name.
  const [executionAccountNameById, setExecutionAccountNameById] = useState<Map<string, string>>(new Map());

  // Phase 2F — AI-Powered Evidence Reconciliation. Content-only: never
  // implies staff identity is verified.
  const [evidenceByTaskId, setEvidenceByTaskId] = useState<Map<string, SeedingTaskWithEvidence>>(new Map());
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const [productDescription, setProductDescription] = useState("");
  // Phase 2K-AI — optional: which single target's own content the AI
  // should use instead of the campaign-level snapshot. Empty = unchanged
  // prior behavior (campaign-level context, same as every existing call).
  const [generateTargetId, setGenerateTargetId] = useState("");
  // Phase 2K-AW — request-time only, never persisted; "ALL" preserves the
  // exact pre-2K-AW mixed-intent default behavior.
  const [commentIntent, setCommentIntent] = useState<SeedingCommentIntent>("ALL");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Comment-task creation (from an AI suggestion, target-aware).
  const [assigning, setAssigning] = useState<{ target: SeedingCampaignTargetWithPost; suggestion: SeedingCommentSuggestion } | null>(
    null
  );
  // Like/Share/direct-Comment task creation — Comment here means a
  // manager-typed task, no AI suggestion involved (suggested_comment_id
  // stays unset for this path).
  const [creatingSimpleTask, setCreatingSimpleTask] = useState<{
    target: SeedingCampaignTargetWithPost;
    actionType: "Like" | "Share" | "Comment";
  } | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [editableComment, setEditableComment] = useState("");
  const [taskError, setTaskError] = useState<string | null>(null);
  // Phase 2I (I1) — duplicate-click protection: disables the submit button
  // and blocks re-entrant calls while a create request is in flight. The
  // server-side check in createTask/createTaskInternal is the real safety
  // net; this is the immediate visible feedback the PO specifically asked
  // for ("Đang tạo...") so a manager never has a reason to click again.
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Mobile-first fallback (real iPhone UAT, 2026-08-26) — same guaranteed
  // manual "Copy link" path as My Tasks/the runner, offered here too at
  // the target level for whoever previews a post from this page on
  // mobile. Independent of every task-level flow above.
  const [copiedLinkTargetId, setCopiedLinkTargetId] = useState<string | null>(null);

  // Mobile-open fix rev.2 (real iPhone UAT, 2026-08-27) — client-side
  // only, after mount (see the runner page's identical comment for why
  // this can't be computed at render time without a hydration mismatch).
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    (async () => {
      setIsMobile(isMobileUserAgent());
    })();
  }, []);

  // Phase 2I (I2/I3) — bulk Comment task creation across many selected
  // targets with one shared comment. Independent of the single-target
  // assigning/creatingSimpleTask flows above — reuses the same
  // staffOptions/suggestions state, nothing duplicated.
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkComment, setBulkComment] = useState("");
  const [bulkAssigneeId, setBulkAssigneeId] = useState("");
  const [bulkScheduledAt, setBulkScheduledAt] = useState("");
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResultSummary, setBulkResultSummary] = useState<string | null>(null);

  // Result note capture (Phase 2E) — Failed/Skipped ask for a reason
  // before the PATCH fires; every other transition stays immediate,
  // unchanged. Reuses handleTaskStatus's existing resultNote param and the
  // existing result_note field/API — no new business rule.
  const [pendingTaskChange, setPendingTaskChange] = useState<{ taskId: string; status: SeedingTaskStatus } | null>(null);
  const [taskReasonInput, setTaskReasonInput] = useState("");

  // Phase 2K-S — distribution modal, scoped to one target at a time (a
  // distribution operates on exactly one campaign_target_id, same
  // per-target granularity as the existing Task Like/Share/Comment
  // buttons above). Owns no distribution logic itself — see
  // components/seeding/CampaignDistributionModal.tsx.
  const [distributingTarget, setDistributingTarget] = useState<SeedingCampaignTargetWithPost | null>(null);

  // Phase 2K-BK — Direct Facebook Comment Publish (Page-only; see
  // lib/seeding/seedingDirectComment.service.ts's own doc comment for the
  // feasibility rationale). Campaign-level: shared by every Page-sourced
  // Comment task on this page, since it depends only on the campaign's
  // one connected Page. null while loading/unknown — rendered as
  // unavailable, never as available-by-default.
  const [directCommentCapability, setDirectCommentCapability] = useState<SeedingDirectCommentCapability | null>(null);
  // Which task is currently mid-publish — disables its own button and
  // shows a loading state; a task not in this set is never blocked from
  // being clicked by another task's in-flight request.
  const [postingTaskId, setPostingTaskId] = useState<string | null>(null);

  // Phase 2K-BP — Reassign Connected Page. campaignPageInfo mirrors
  // exactly what the server resolves for THIS campaign's own Page (name/
  // status/capability) — never a client-side guess. reassignCandidates
  // is fetched fresh, on demand, only when the picker is opened (not
  // preloaded), from the same Account Center overview 2K-BO already
  // built — no duplicate "list connected pages" logic.
  const [campaignPageInfo, setCampaignPageInfo] = useState<SeedingCampaignPageInfo | null>(null);
  const [showReassignPageModal, setShowReassignPageModal] = useState(false);
  const [reassignCandidates, setReassignCandidates] = useState<SeedingPageAccountWithStats[]>([]);
  const [isLoadingReassignCandidates, setIsLoadingReassignCandidates] = useState(false);
  const [selectedReassignPageId, setSelectedReassignPageId] = useState("");
  const [isReassigningPage, setIsReassigningPage] = useState(false);
  const [reassignPageError, setReassignPageError] = useState<string | null>(null);

  // Phase 2K-BQ — Page/Target Compatibility Safety. Server-computed only
  // (getTargetCompatibilityForCampaign); the client never submits a
  // compatibility status or override. Empty map while loading/unknown —
  // a target absent from the map renders as no badge, never as
  // implicitly compatible.
  const [targetCompatibility, setTargetCompatibility] = useState<SeedingTargetCompatibilityMap>({});

  // Phase 2K-BU — Personal Post Quick Capture. sourceTypeOverride is only
  // ever "Personal" | "Group" | "" (auto) — the client can never assert
  // "Page" (that's only ever server-detected from a real
  // facebook_page_posts match). Modal stays open after a successful
  // capture (input cleared) so staff can paste the next link right away —
  // the common case is several links in a row, not just one.
  const [showQuickCaptureModal, setShowQuickCaptureModal] = useState(false);
  const [quickCaptureUrl, setQuickCaptureUrl] = useState("");
  const [quickCaptureSourceOverride, setQuickCaptureSourceOverride] = useState<"Personal" | "Group" | "">("");
  const [isQuickCapturing, setIsQuickCapturing] = useState(false);
  const [quickCaptureError, setQuickCaptureError] = useState<string | null>(null);
  const [quickCaptureLastResult, setQuickCaptureLastResult] = useState<{
    outcome: string;
    detectedSourceType: string;
    idConfidence: string;
  } | null>(null);

  // Phase 2K-BX — Target Card internal identification description. This
  // is never an edit to the original Facebook post — only the staff's
  // own internal note (facebook_manual_content_references.source_label),
  // only ever offered for a manual (Personal/Group) target. One editor
  // open at a time, inline on the card it belongs to.
  const [editingDescriptionTargetId, setEditingDescriptionTargetId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  // Phase 2K-BS — server returned needsAcknowledgment for this task; the
  // reason shown is whatever the server just recomputed fresh (never the
  // possibly-stale targetCompatibility map fetched at page load).
  const [acknowledgmentModal, setAcknowledgmentModal] = useState<{ taskId: string; reason: string } | null>(null);

  const staffOptions = useStaffOptions();

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setForbidden(false);
    setActionError(null);
    try {
      const [campaignRes, targetsRes, suggestionsRes, tasksRes, progressRes, evidenceRes, directCommentRes, executionAccountsRes, pageInfoRes, targetCompatibilityRes] = await Promise.all([
        fetch(`/api/seeding/campaigns/${id}`),
        fetch(`/api/seeding/campaigns/${id}/targets`),
        fetch(`/api/seeding/campaigns/${id}/generate-comments`),
        fetch(`/api/seeding/tasks?campaignId=${id}`),
        fetch(`/api/seeding/campaigns/${id}/progress`),
        fetch(`/api/seeding/campaigns/${id}/evidence-reconciliation`),
        fetch(`/api/seeding/campaigns/${id}/direct-comment-capability`),
        fetch(`/api/seeding/execution-accounts`),
        fetch(`/api/seeding/campaigns/${id}/page-info`),
        fetch(`/api/seeding/campaigns/${id}/target-compatibility`),
      ]);
      if (campaignRes.status === 403) {
        setForbidden(true);
        return;
      }
      if (!campaignRes.ok) throw new Error(await campaignRes.text());
      setCampaign(await campaignRes.json());
      if (targetsRes.ok) setTargets(await targetsRes.json());
      if (suggestionsRes.ok) setSuggestions(await suggestionsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (progressRes.ok) setProgress(await progressRes.json());
      if (evidenceRes.ok) {
        const queue: SeedingTaskWithEvidence[] = await evidenceRes.json();
        setEvidenceByTaskId(new Map(queue.map((t) => [t.id, t])));
      }
      setDirectCommentCapability(directCommentRes.ok ? await directCommentRes.json() : { availability: "UNAVAILABLE" });
      if (executionAccountsRes.ok) {
        const accountsList: { id: string; display_name: string }[] = await executionAccountsRes.json();
        setExecutionAccountNameById(new Map(accountsList.map((a) => [a.id, a.display_name])));
      }
      if (pageInfoRes.ok) setCampaignPageInfo(await pageInfoRes.json());
      setTargetCompatibility(targetCompatibilityRes.ok ? await targetCompatibilityRes.json() : {});
    } catch (error) {
      console.error("Failed to load seeding campaign detail:", error);
      setActionError("Không thể tải dữ liệu campaign — vui lòng tải lại trang.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /** Phase 2K-AR — display isolation: switching the target selector loads
   * exactly that target's persisted suggestions (via the new
   * ?campaign_target_id= scoped GET), never a mix of every target ever
   * generated for. An empty targetId reloads the unchanged campaign-level
   * list (the existing "no target selected" fallback). */
  async function loadSuggestionsForTarget(targetId: string) {
    try {
      const query = targetId ? `?campaign_target_id=${targetId}` : "";
      const res = await fetch(`/api/seeding/campaigns/${id}/generate-comments${query}`);
      if (res.ok) setSuggestions(await res.json());
    } catch (error) {
      console.error("Failed to load target-scoped suggestions:", error);
      setActionError("Không thể tải gợi ý comment cho bài viết này.");
    }
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/seeding/campaigns/${id}/generate-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productDescription: productDescription || undefined,
          campaign_target_id: generateTargetId || undefined,
          intent: commentIntent,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo gợi ý");
      const newSuggestions: SeedingCommentSuggestion[] = await res.json();
      // Phase 2K-AN — replace, not accumulate: seeding_comment_suggestions
      // rows carry no target reference, so an ever-growing list silently
      // mixes a fresh, correctly-grounded batch with older suggestions
      // from a different target generated earlier in this same session.
      // A full fix (tagging each batch with the target it was generated
      // for) needs a schema change — flagged, not made, this phase.
      setSuggestions(newSuggestions);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "Không thể tạo gợi ý");
    } finally {
      setIsGenerating(false);
    }
  }

  // Phase 2F — browser-driven batch polling (same pattern as Comment
  // Shield's processNextBatch): calls the batch endpoint repeatedly until
  // no more eligible candidates remain or a safety round cap is hit. No
  // cron/queue — closing this page simply stops the loop; every round
  // already persisted is unaffected, safe to resume by clicking again.
  const MAX_RECONCILE_ROUNDS = 20;

  async function runEvidenceReconciliation() {
    setIsReconciling(true);
    setReconcileError(null);
    try {
      let hasMore = true;
      let rounds = 0;
      while (hasMore && rounds < MAX_RECONCILE_ROUNDS) {
        const res = await fetch(`/api/seeding/campaigns/${id}/evidence-reconciliation`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể đối soát bằng chứng");
        const result: SeedingEvidenceReconciliationBatchResult = await res.json();
        hasMore = result.hasMoreCandidates;
        rounds += 1;
      }
      const queueRes = await fetch(`/api/seeding/campaigns/${id}/evidence-reconciliation`);
      if (queueRes.ok) {
        const queue: SeedingTaskWithEvidence[] = await queueRes.json();
        setEvidenceByTaskId(new Map(queue.map((t) => [t.id, t])));
      }
    } catch (error) {
      setReconcileError(error instanceof Error ? error.message : "Không thể đối soát bằng chứng");
    } finally {
      setIsReconciling(false);
    }
  }

  function openAssign(target: SeedingCampaignTargetWithPost, suggestion: SeedingCommentSuggestion) {
    setAssigning({ target, suggestion });
    setEditableComment(suggestion.content);
    setAssigneeId("");
    setScheduledAt("");
    setTaskError(null);
  }

  function openSimpleTask(target: SeedingCampaignTargetWithPost, actionType: "Like" | "Share" | "Comment") {
    setCreatingSimpleTask({ target, actionType });
    setAssigneeId("");
    setScheduledAt("");
    setEditableComment("");
    setTaskError(null);
  }

  async function submitTask(body: Record<string, unknown>) {
    // Phase 2I (I1) — ignore a re-entrant call outright (belt-and-suspenders
    // alongside the button's own disabled state) rather than letting a
    // second network request fire at all.
    if (isSubmittingTask) return;
    setTaskError(null);
    setIsSubmittingTask(true);
    try {
      const res = await fetch("/api/seeding/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo task");
      const task: SeedingTask = await res.json();
      // Dedupe by id: if the server returned an existing non-terminal
      // duplicate instead of a new row (createTask's own protection), this
      // never pushes a second visual copy of the same task.
      setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]));
      setAssigning(null);
      setCreatingSimpleTask(null);
      const progressRes = await fetch(`/api/seeding/campaigns/${id}/progress`);
      if (progressRes.ok) setProgress(await progressRes.json());
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Không thể tạo task");
    } finally {
      setIsSubmittingTask(false);
    }
  }

  async function handleCreateCommentTask() {
    if (!assigning) return;
    await submitTask({
      campaign_target_id: assigning.target.id,
      action_type: "Comment",
      comment_text: editableComment,
      suggested_comment_id: assigning.suggestion.id,
      assigned_staff_id: assigneeId || undefined,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  }

  async function handleCreateSimpleTask() {
    if (!creatingSimpleTask) return;
    if (creatingSimpleTask.actionType === "Comment" && !editableComment.trim()) {
      setTaskError("Vui lòng nhập nội dung comment");
      return;
    }
    await submitTask({
      campaign_target_id: creatingSimpleTask.target.id,
      action_type: creatingSimpleTask.actionType,
      comment_text: creatingSimpleTask.actionType === "Comment" ? editableComment : undefined,
      assigned_staff_id: assigneeId || undefined,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  }

  /** Mobile-first fallback (real iPhone UAT, 2026-08-26) — see the state
   * declaration above. Copies the raw, untransformed canonical permalink
   * so it can be opened manually if the automatic Facebook-app handoff
   * doesn't land on the right post. */
  async function handleCopyTargetLink(targetId: string, permalinkUrl: string) {
    try {
      await navigator.clipboard.writeText(permalinkUrl);
      setCopiedLinkTargetId(targetId);
      setTimeout(() => setCopiedLinkTargetId((id) => (id === targetId ? null : id)), 2000);
    } catch (error) {
      console.error("Clipboard copy failed:", error);
      setActionError("Không thể copy link — trình duyệt từ chối quyền truy cập clipboard.");
    }
  }

  // Phase 2I (I2) — bulk target selection, independent of any single-target
  // modal state above.
  function toggleBulkSelectMode() {
    setBulkSelectMode((prev) => !prev);
    setSelectedTargetIds(new Set());
  }

  function toggleTargetSelected(targetId: string) {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }

  function openBulkModal() {
    setBulkComment("");
    setBulkAssigneeId("");
    setBulkScheduledAt("");
    setBulkError(null);
    setBulkResultSummary(null);
    setShowBulkModal(true);
  }

  /** Phase 2I (I2) — one deliberate action creates one Comment task per
   * selected target, all sharing the same content/assignee/date. Always
   * reports an honest per-target outcome (created/skipped/failed) — never
   * a single fabricated pass/fail, per the module's own requirement. */
  async function submitBulkCommentTasks() {
    if (isSubmittingBulk) return;
    if (!bulkComment.trim()) {
      setBulkError("Vui lòng nhập nội dung comment");
      return;
    }
    setIsSubmittingBulk(true);
    setBulkError(null);
    setBulkResultSummary(null);
    try {
      const res = await fetch(`/api/seeding/campaigns/${id}/tasks/bulk-comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetIds: [...selectedTargetIds],
          comment_text: bulkComment,
          assigned_staff_id: bulkAssigneeId || undefined,
          scheduled_at: bulkScheduledAt ? new Date(bulkScheduledAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo task hàng loạt");
      const result: {
        created: { targetId: string; taskId: string }[];
        skipped: { targetId: string; reason: string }[];
        failed: { targetId: string; error: string }[];
      } = await res.json();

      setBulkResultSummary(
        `Đã tạo ${result.created.length} task` +
          (result.skipped.length > 0 ? ` · bỏ qua ${result.skipped.length} (đã có task giống hệt)` : "") +
          (result.failed.length > 0 ? ` · lỗi ${result.failed.length}` : "")
      );

      // Refresh from the server rather than fabricating the new rows
      // client-side — the honest source of truth for what actually exists.
      const [tasksRes, progressRes] = await Promise.all([
        fetch(`/api/seeding/tasks?campaignId=${id}`),
        fetch(`/api/seeding/campaigns/${id}/progress`),
      ]);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (progressRes.ok) setProgress(await progressRes.json());

      if (result.failed.length === 0) {
        setShowBulkModal(false);
        setBulkSelectMode(false);
        setSelectedTargetIds(new Set());
      }
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Không thể tạo task hàng loạt");
    } finally {
      setIsSubmittingBulk(false);
    }
  }

  function handleTaskStatusClick(taskId: string, status: SeedingTaskStatus) {
    if (STATUSES_REQUIRING_REASON.has(status)) {
      setPendingTaskChange({ taskId, status });
      setTaskReasonInput("");
      return;
    }
    handleTaskStatus(taskId, status);
  }

  async function confirmPendingTaskChange() {
    if (!pendingTaskChange) return;
    await handleTaskStatus(pendingTaskChange.taskId, pendingTaskChange.status, taskReasonInput || undefined);
    setPendingTaskChange(null);
  }

  async function handleTaskStatus(taskId: string, status: SeedingTaskStatus, resultNote?: string) {
    try {
      const res = await fetch(`/api/seeding/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, result_note: resultNote ?? null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể cập nhật task");
      const updated: SeedingTask = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      const progressRes = await fetch(`/api/seeding/campaigns/${id}/progress`);
      if (progressRes.ok) setProgress(await progressRes.json());
    } catch (error) {
      console.error("Failed to update seeding task status:", error);
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật trạng thái task");
    }
  }

  /** Phase 2K-BK — human-initiated, one task at a time (no autonomous/
   * batch publishing). Whether this call succeeds or fails, the task's
   * true status was already persisted server-side (Done or Failed) — so
   * on failure this resyncs the whole task list from the server rather
   * than guessing a shape, the same "trust the server, don't fabricate"
   * principle the publish endpoint itself follows. */
  // Phase 2K-BS — acknowledged=true is sent ONLY from the modal's "Vẫn
  // đăng comment" button, after the server has already told us (via a
  // needsAcknowledgment response to the first, unacknowledged attempt)
  // that this specific target is INCOMPATIBLE. The server re-checks
  // compatibility fresh on every call regardless of this flag — this
  // flag never carries a compatibility value, only "the staff saw the
  // warning and chose to proceed."
  async function handleDirectPublish(taskId: string, acknowledged = false) {
    setPostingTaskId(taskId);
    try {
      const res = await fetch(`/api/seeding/tasks/${taskId}/publish-comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result?.needsAcknowledgment) {
          setAcknowledgmentModal({ taskId, reason: result.reason ?? "Target này có thể thuộc một Facebook Page khác." });
          return;
        }
        setAcknowledgmentModal(null);
        const updated: SeedingTask = result;
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      } else {
        setAcknowledgmentModal(null);
        const tasksRes = await fetch(`/api/seeding/tasks?campaignId=${id}`);
        if (tasksRes.ok) setTasks(await tasksRes.json());
      }
    } catch (error) {
      console.error("Failed to publish direct comment:", error);
      setActionError("Không thể đăng comment trực tiếp — lỗi kết nối, vui lòng thử lại.");
    } finally {
      setPostingTaskId(null);
    }
  }

  function handleCancelAcknowledgment() {
    // No fetch, no state change beyond closing the modal — matches the
    // "cancel produces zero DB write / zero Graph API call / zero
    // activity log" requirement exactly, since nothing was ever sent.
    setAcknowledgmentModal(null);
  }

  /** Phase 2K-BU — one click: paste -> parse -> detect Page/Personal/
   * Group -> create-or-reuse reference -> create-or-reuse target, all
   * server-side (quickCaptureTargetFromUrl). Never sends a claimed
   * source_type for a URL the server can resolve to a known Page post —
   * sourceTypeOverride is only ever a hint for the Personal/Group case. */
  async function handleQuickCapture() {
    if (!quickCaptureUrl.trim()) return;
    setIsQuickCapturing(true);
    setQuickCaptureError(null);
    try {
      const res = await fetch(`/api/seeding/campaigns/${id}/quick-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: quickCaptureUrl.trim(), source_type_override: quickCaptureSourceOverride || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? "Không thể thêm bài viết này");
      }
      setQuickCaptureLastResult({
        outcome: body.outcome,
        detectedSourceType: body.detectedSourceType,
        idConfidence: body.idConfidence,
      });
      setQuickCaptureUrl("");
      await loadAll();
    } catch (error) {
      setQuickCaptureError(error instanceof Error ? error.message : "Không thể thêm bài viết này");
    } finally {
      setIsQuickCapturing(false);
    }
  }

  /** Phase 2K-BY (P1 #3) — a genuinely destructive, irreversible action
   * (unlike every other button on this card) — a lightweight native
   * confirm rather than a tenth modal on an already modal-heavy page.
   * The server re-verifies zero tasks itself regardless of what this
   * client believes — this button is only ever shown when the client's
   * own `targetTasks.length === 0`, but that is a UX hint, not the
   * enforcement. */
  async function handleRemoveTarget(target: SeedingCampaignTargetWithPost) {
    if (!window.confirm("Xoá target này khỏi campaign? Không thể hoàn tác.")) return;
    setRemovingTargetId(target.id);
    try {
      const res = await fetch(`/api/seeding/campaigns/${id}/targets/${target.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Không thể xoá target");
      setTargets((prev) => prev.filter((t) => t.id !== target.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể xoá target");
    } finally {
      setRemovingTargetId(null);
    }
  }

  function quickCaptureResultLabel(): string {
    if (!quickCaptureLastResult) return "";
    const sourceLabel =
      quickCaptureLastResult.detectedSourceType === "Page"
        ? "Facebook Page đã kết nối"
        : quickCaptureLastResult.detectedSourceType === "Group"
          ? "Nhóm (Manual Reference)"
          : "Cá nhân (Manual Reference)";
    const dup = quickCaptureLastResult.outcome.includes("already_targeted") ? " — bài viết này đã có trong campaign" : "";
    return `Đã lưu — nguồn: ${sourceLabel}${dup}`;
  }

  /** Phase 2K-BX — opens the inline editor for one target's internal
   * description, pre-filled with the current value (empty if none). */
  function openDescriptionEditor(target: SeedingCampaignTargetWithPost) {
    setEditingDescriptionTargetId(target.id);
    setDescriptionDraft(target.source_label ?? "");
    setDescriptionError(null);
  }

  function cancelDescriptionEditor() {
    // No fetch — cancel is a pure client-side no-op, original value is
    // simply never sent.
    setEditingDescriptionTargetId(null);
    setDescriptionDraft("");
    setDescriptionError(null);
  }

  async function saveDescription(targetId: string) {
    setIsSavingDescription(true);
    setDescriptionError(null);
    try {
      const res = await fetch(`/api/seeding/campaigns/${id}/targets/${targetId}/description`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionDraft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Không thể lưu mô tả");
      setTargets((prev) => prev.map((t) => (t.id === targetId ? { ...t, source_label: body.sourceLabel } : t)));
      setEditingDescriptionTargetId(null);
    } catch (error) {
      setDescriptionError(error instanceof Error ? error.message : "Không thể lưu mô tả");
    } finally {
      setIsSavingDescription(false);
    }
  }

  /** Phase 2K-BP — opens the picker and fetches the candidate list fresh
   * (the same Account Center overview 2K-BO already built) — never
   * preloaded/stale, and never filtered down to AVAILABLE-only: an admin
   * may deliberately reassign to a currently-UNAVAILABLE Page (e.g. one
   * they're about to reconnect), per this phase's own "prioritize
   * business correctness over forcing AVAILABLE-only" instruction. */
  async function openReassignPageModal() {
    setReassignPageError(null);
    setSelectedReassignPageId(campaignPageInfo?.facebook_page_id ?? "");
    setShowReassignPageModal(true);
    setIsLoadingReassignCandidates(true);
    try {
      const res = await fetch("/api/seeding/account-center");
      if (!res.ok) throw new Error(await res.text());
      const overview = await res.json();
      setReassignCandidates(overview.pages);
    } catch (error) {
      console.error("Failed to load connected Page candidates:", error);
      // Reuses this modal's own existing error state (reassignPageError) —
      // it's already open and already has a dedicated error slot, no need
      // for a second, redundant page-level banner.
      setReassignPageError("Không thể tải danh sách Facebook Page — vui lòng đóng và thử lại.");
    } finally {
      setIsLoadingReassignCandidates(false);
    }
  }

  async function handleConfirmReassignPage() {
    if (!selectedReassignPageId) return;
    setIsReassigningPage(true);
    setReassignPageError(null);
    try {
      const res = await fetch(`/api/seeding/campaigns/${id}/reassign-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facebook_page_id: selectedReassignPageId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể đổi Connected Page");
      setShowReassignPageModal(false);
      // Full reload — page-info AND direct-comment-capability both
      // re-resolve live from the server against the campaign's new
      // facebook_page_id; nothing here is cached client-side.
      await loadAll();
    } catch (error) {
      setReassignPageError(error instanceof Error ? error.message : "Không thể đổi Connected Page");
    } finally {
      setIsReassigningPage(false);
    }
  }

  async function handleChangeCampaignStatus(status: SeedingCampaign["status"]) {
    setIsChangingCampaignStatus(true);
    try {
      const res = await fetch(`/api/seeding/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể đổi trạng thái campaign");
      const updated: SeedingCampaign = await res.json();
      setCampaign(updated);
    } catch (error) {
      console.error("Failed to change seeding campaign status:", error);
      setActionError(error instanceof Error ? error.message : "Không thể đổi trạng thái campaign");
    } finally {
      setIsChangingCampaignStatus(false);
    }
  }

  /** Phase 2G (M1-B) — gates the "-> Completed" transition behind an
   * explicit confirmation whenever Pending/In Progress tasks still exist;
   * every other transition (including the M1-A reopen, Completed ->
   * Active) proceeds immediately, unchanged from before. Purely a UI
   * checkpoint — no task is touched here or anywhere in
   * handleChangeCampaignStatus regardless of which path is taken.
   *
   * Phase 2H (H1) — fail-safe, not fail-open: if `progress` never loaded
   * (its fetch in loadAll() only calls setProgress on progressRes.ok, so a
   * transient failure of just that one request leaves it null with no
   * retry), this used to fall straight through to immediate completion
   * with zero warning regardless of real unfinished-task count. Now an
   * unknown count is treated the same as "don't skip the confirmation" —
   * the modal shows honest "could not determine" copy instead of ever
   * fabricating a number. */
  function handleStatusButtonClick(next: SeedingCampaign["status"]) {
    if (next === "Completed") {
      if (!progress) {
        setCompletionWarning({ next, unfinishedCount: null });
        return;
      }
      const unfinishedCount = progress.pending + progress.inProgress;
      if (unfinishedCount > 0) {
        setCompletionWarning({ next, unfinishedCount });
        return;
      }
    }
    handleChangeCampaignStatus(next);
  }

  async function confirmCompletionWarning() {
    if (!completionWarning) return;
    await handleChangeCampaignStatus(completionWarning.next);
    setCompletionWarning(null);
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <Card className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            Bạn chưa được cấp quyền <code>seeding.manage</code>.
          </p>
        </Card>
      </div>
    );
  }

  // Phase 2K-BY (P1 #7) — loadAll failing (network error, etc.) previously
  // left this page silently stuck on the loading skeleton forever
  // (isLoading turns false but campaign stays null, and the skeleton
  // below only ever rendered while isLoading was true — actionError had
  // no reachable render path). Distinct from the still-loading case: an
  // honest failure state with the real error and a retry action.
  if (!isLoading && !campaign) {
    return (
      <div className="p-6">
        <Card className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm">{actionError ?? "Không thể tải campaign."}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => loadAll()}>
            Thử lại
          </Button>
        </Card>
      </div>
    );
  }

  if (isLoading || !campaign) {
    // Phase 2I (I6) — keeps the page's own shell/context (icon, padding,
    // card outlines) instead of an almost-blank screen with a tiny
    // spinner, and states what is loading rather than leaving it to guess.
    return (
      <div className="p-6 space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary/40 animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-56 bg-muted rounded animate-pulse" />
            <div className="h-3 w-40 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <Card>
          <div className="h-16 bg-muted rounded animate-pulse" />
        </Card>
        <Card>
          <div className="h-16 bg-muted rounded animate-pulse" />
        </Card>
        <p className="text-sm text-muted-foreground text-center">Đang tải campaign...</p>
      </div>
    );
  }

  const suggestionsByCategory = Object.entries(SEEDING_COMMENT_CATEGORY_LABELS).map(([category, label]) => ({
    category,
    label,
    items: suggestions.filter((s) => s.category === category),
  }));

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Phase 2K-BY (P1 #7) — visible surface for secondary-action
         failures (status transitions, background reloads) that
         previously only console.error'd. Dismissible; a fresh loadAll()
         call clears it. Never shown for primary actions that already
         have their own inline error (Quick Capture, description edit,
         Page reassignment). */}
      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} className="text-destructive/70 hover:text-destructive text-xs">
            Đóng
          </button>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground">
              {campaign.objective} · <Badge variant={seedingCampaignStatusBadgeVariant(campaign.status)}>{seedingCampaignStatusLabel(campaign.status)}</Badge> · {targets.length} bài viết
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {(SEEDING_CAMPAIGN_ALLOWED_TRANSITIONS[campaign.status] ?? []).map((next) => (
            <Button
              key={next}
              size="sm"
              variant="secondary"
              isLoading={isChangingCampaignStatus}
              onClick={() => handleStatusButtonClick(next)}
            >
              Chuyển sang {seedingCampaignStatusLabel(next)}
            </Button>
          ))}
        </div>
      </div>

      {/* Phase 2K-BP — Connected Facebook Page. Renders exactly what the
         server resolved (campaignPageInfo) — never a client-side guess.
         Explicit "no Page" state when the campaign is manual-only,
         never assumed. */}
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-medium text-foreground">Connected Facebook Page</h2>
              {campaignPageInfo === null ? (
                <p className="text-sm text-muted-foreground">Đang tải...</p>
              ) : !campaignPageInfo.facebook_page_id ? (
                <p className="text-sm text-muted-foreground">Campaign này chưa gắn với Facebook Page nào (chỉ dùng nguồn thủ công).</p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="text-sm text-foreground">{campaignPageInfo.page_name ?? campaignPageInfo.facebook_page_id}</span>
                  {campaignPageInfo.status === "Connected" && <Badge variant="success">Đã kết nối</Badge>}
                  {campaignPageInfo.status === "Reconnect Required" && <Badge variant="warning">Cần kết nối lại</Badge>}
                  {campaignPageInfo.status === "Disconnected" && <Badge variant="muted">Đã ngắt kết nối</Badge>}
                  {campaignPageInfo.capability.availability === "AVAILABLE" ? (
                    <Badge variant="success">Đăng trực tiếp: Khả dụng</Badge>
                  ) : (
                    <Badge variant="muted">Đăng trực tiếp: {campaignPageInfo.capability.availability === "NOT_SUPPORTED" ? "Không hỗ trợ" : "Chưa khả dụng"}</Badge>
                  )}
                </div>
              )}
              {campaignPageInfo?.capability.reason && (
                <p className="text-xs text-muted-foreground mt-1 max-w-md">{campaignPageInfo.capability.reason}</p>
              )}
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={openReassignPageModal}>
            Đổi Connected Page
          </Button>
        </div>
      </Card>

      {progress && (
        <Card>
          <h2 className="font-medium text-foreground mb-3">Tiến độ campaign</h2>
          <p className="text-sm text-foreground mb-3">
            Hoàn thành {progress.done}/{progress.total} task
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
            {[
              { label: "Chờ xử lý", value: progress.pending, variant: "warning" as const },
              { label: "Đang thực hiện", value: progress.inProgress, variant: "default" as const },
              { label: "Đã hoàn thành", value: progress.done, variant: "success" as const },
              { label: "Thất bại", value: progress.failed, variant: "destructive" as const },
              { label: "Bỏ qua", value: progress.skipped, variant: "muted" as const },
              { label: "Đã hủy", value: progress.cancelled, variant: "muted" as const },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border p-2">
                <p className="text-lg font-semibold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <SearchCheck className="w-5 h-5 text-primary" />
            <h2 className="font-medium text-foreground">Đối soát bằng chứng (AI)</h2>
            {(() => {
              const exceptionCount = [...evidenceByTaskId.values()].filter(
                (e) => e.evidence_result && (SEEDING_TASK_EVIDENCE_EXCEPTION_RESULTS as string[]).includes(e.evidence_result)
              ).length;
              return exceptionCount > 0 ? <Badge variant="warning">{exceptionCount} cần xem xét</Badge> : null;
            })()}
          </div>
          <Button size="sm" onClick={runEvidenceReconciliation} isLoading={isReconciling}>
            <SearchCheck className="w-4 h-4" /> Chạy đối soát
          </Button>
        </div>
        <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2">
          Chỉ đối soát nội dung comment với các comment thực tế trên bài viết — <strong>không xác minh danh tính người thực hiện</strong>.
        </p>
        {reconcileError && <p className="text-destructive text-sm mt-2">{reconcileError}</p>}
      </Card>

      <Card>
        <div className="flex items-end gap-3 mb-4 flex-wrap">
          <h2 className="font-medium text-foreground">Gợi ý comment (AI)</h2>
        </div>
        <div className="flex items-end gap-3 mb-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Select
              label="Tạo theo bài viết (tùy chọn)"
              placeholder="Toàn bộ campaign (mặc định)"
              options={targets.map((t) => ({ value: t.id, label: resolveTargetDisplayText(t).slice(0, 60) }))}
              value={generateTargetId}
              onChange={(e) => {
                const newTargetId = e.target.value;
                setGenerateTargetId(newTargetId);
                // Phase 2K-AN — root-cause fix: "Sản phẩm liên quan" is a
                // free-text field with no target scoping of its own; left
                // uncleared it silently carries one target's specific facts
                // (size/price/etc.) into a completely different target's
                // generation. Switching targets must not carry it over.
                setProductDescription("");
                // Phase 2K-AR — show that target's own persisted
                // suggestions, not whatever the previously selected
                // target (or the campaign-level list) last displayed.
                loadSuggestionsForTarget(newTargetId);
              }}
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <Select
              label="Mục đích tạo bình luận"
              options={SEEDING_COMMENT_INTENT_OPTIONS}
              value={commentIntent}
              onChange={(e) => setCommentIntent(e.target.value as SeedingCommentIntent)}
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <Input
              label="Sản phẩm liên quan (tùy chọn)"
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="VD: Vòng cẩm thạch ngọc bích size 16"
            />
          </div>
          <Button onClick={handleGenerate} isLoading={isGenerating}>
            <RefreshCw className="w-4 h-4" /> {suggestions.length === 0 ? "Generate" : "Regenerate"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Chọn một bài viết để AI dùng đúng nội dung bài đó; để trống sẽ dùng ngữ cảnh chung của campaign (như trước đây).
        </p>
        {generateError && <p className="text-destructive text-sm mb-3">{generateError}</p>}

        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có gợi ý nào — bấm Generate để AI tạo comment.</p>
        ) : (
          <div className="space-y-4">
            {/* Phase 2K-BZ (P2 #4) — when generation was scoped to one
               specific target (generateTargetId set), a suggestion here
               can be turned into a task directly, with zero scrolling to
               re-find the same text truncated in that target's card
               further down. Reuses openAssign() exactly as the target
               card's own buttons already do — same modal, same
               validation, no new task-creation path. When generation was
               campaign-wide (no target selected), there is no single,
               unambiguous target to attach to, so these stay read-only —
               the label below explains why rather than leaving it
               unexplained. */}
            {suggestionsByCategory.map(({ category, label, items }) =>
              items.length === 0 ? null : (
                <div key={category}>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{label}</h3>
                  <div className="space-y-2">
                    {items.map((s) => {
                      const scopedTarget = generateTargetId ? targets.find((t) => t.id === generateTargetId) : undefined;
                      return scopedTarget ? (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => openAssign(scopedTarget, s)}
                          className="w-full text-left text-sm text-foreground rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                        >
                          {s.content}
                        </button>
                      ) : (
                        <p key={s.id} className="text-sm text-foreground rounded-lg border border-border p-3">
                          {s.content}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )
            )}
            <p className="text-xs text-muted-foreground">
              {generateTargetId
                ? "Bấm vào một gợi ý ở trên để tạo task Comment ngay cho bài viết đã chọn."
                : "Gợi ý này dùng ngữ cảnh chung của campaign — chọn một bài viết cụ thể ở trên để bấm chọn trực tiếp, hoặc chọn gợi ý bên dưới từng bài viết."}
            </p>
          </div>
        )}
      </Card>

      {/* Phase 2K-BU — Personal Post Quick Capture. Always visible,
         whether or not the campaign already has targets — paste any
         Facebook post/video/reel/photo/share link, one click, no manual
         source-type form required for the common case. */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button
          size="sm"
          onClick={() => {
            setQuickCaptureError(null);
            setQuickCaptureLastResult(null);
            setShowQuickCaptureModal(true);
          }}
        >
          <Plus className="w-4 h-4" /> Thêm bài viết Facebook
        </Button>
      </div>

      {targets.length === 0 ? (
        <Card className="text-sm text-muted-foreground">Campaign này chưa có bài viết (target) nào.</Card>
      ) : (
        <>
          {/* Phase 2I (I2) — bulk Comment task creation across many
           * selected targets. Toggling this mode reveals a checkbox on
           * every target card below; it never affects the single-target
           * Task Like/Share/Comment buttons on each card. */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Button size="sm" variant="secondary" onClick={toggleBulkSelectMode}>
              {bulkSelectMode ? "Hủy chọn nhiều bài viết" : "Chọn nhiều bài viết"}
            </Button>
            {bulkSelectMode && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">Đã chọn {selectedTargetIds.size} bài viết</span>
                <Button size="sm" disabled={selectedTargetIds.size === 0} onClick={openBulkModal}>
                  Tạo Task Comment hàng loạt
                </Button>
              </div>
            )}
          </div>

          {targets.map((target) => {
          const targetTasks = tasks.filter((t) => t.campaign_target_id === target.id);
          return (
            <Card key={target.id}>
              <div className="flex items-start gap-3 mb-4">
                {bulkSelectMode && (
                  <input
                    type="checkbox"
                    className="mt-1.5 w-4 h-4 shrink-0 touch-manipulation"
                    checked={selectedTargetIds.has(target.id)}
                    onChange={() => toggleTargetSelected(target.id)}
                    aria-label="Chọn bài viết này cho task hàng loạt"
                  />
                )}
                {target.full_picture_url ? (
                  <img src={target.full_picture_url} alt="" className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <ImageOff className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {/* Phase 2K-BX — display priority: (1) staff's own
                     internal identification (source_label), (2) real
                     Facebook metadata (message), (3) an honest, visually
                     calm empty state — never "(không có nội dung)",
                     which read as broken data rather than "nothing here
                     yet". Editing (manual targets only) always acts on
                     source_label specifically, never on `message`. */}
                  {editingDescriptionTargetId === target.id ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="VD: Vòng ni 54.6 khách đang quan tâm"
                        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      {descriptionError && <p className="text-destructive text-xs">{descriptionError}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" isLoading={isSavingDescription} onClick={() => saveDescription(target.id)}>
                          Lưu
                        </Button>
                        <Button size="sm" variant="secondary" onClick={cancelDescriptionEditor} disabled={isSavingDescription}>
                          Hủy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className={
                        target.source_label || target.message
                          ? "text-sm text-foreground line-clamp-2"
                          : // Phase 2K-BZ (P2 #6) — plain muted text, no
                            // italic: every other empty state in this
                            // module (task lists, account lists,
                            // campaign list) uses this exact style; this
                            // was the one accidental outlier.
                            "text-sm text-muted-foreground"
                      }
                    >
                      {resolveTargetDisplayText(target)}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {editingDescriptionTargetId !== target.id && target.manual_content_reference_id && (
                      <button
                        type="button"
                        onClick={() => openDescriptionEditor(target)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Pencil className="w-3.5 h-3.5" /> {target.source_label ? "Chỉnh sửa mô tả" : "Thêm mô tả"}
                      </button>
                    )}
                    {target.discovery_method && (
                      <Badge variant="muted">
                        {target.discovery_method === "Quick Capture" ? "Nhập qua Quick Capture" : target.discovery_method}
                      </Badge>
                    )}
                    {targetCompatibility[target.id]?.compatibility === "INCOMPATIBLE" && (
                      <Badge variant="destructive" title={targetCompatibility[target.id]?.reason}>
                        Có thể không tương thích với Page hiện tại
                      </Badge>
                    )}
                    {targetCompatibility[target.id]?.compatibility === "UNKNOWN" && (
                      <Badge variant="muted" title={targetCompatibility[target.id]?.reason}>
                        Chưa xác định được Page sở hữu
                      </Badge>
                    )}
                    {target.discovery_status !== "Active" && (
                      <Badge variant={target.discovery_status === "Unavailable" ? "destructive" : "warning"}>
                        {target.discovery_status === "Unavailable" ? "Bài không còn truy cập" : "Đồng bộ lỗi gần nhất"}
                      </Badge>
                    )}
                    {target.permalink_url && (
                      <>
                        <a
                          href={target.permalink_url}
                          target={isMobile ? undefined : "_blank"}
                          rel={isMobile ? undefined : "noopener noreferrer"}
                          onClick={(e) => handleFacebookLinkClick(e, target.permalink_url!)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Mở trên Facebook
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyTargetLink(target.id, target.permalink_url!)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Link2 className="w-3.5 h-3.5" /> {copiedLinkTargetId === target.id ? "Đã copy!" : "Copy link"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => openSimpleTask(target, "Like")}>
                    <ThumbsUp className="w-4 h-4" /> Task Like
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openSimpleTask(target, "Share")}>
                    <Share2 className="w-4 h-4" /> Task Share
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openSimpleTask(target, "Comment")}>
                    <MessageCircle className="w-4 h-4" /> Task Comment (tự nhập)
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setDistributingTarget(target)}>
                    <Send className="w-4 h-4" /> Phân phối task
                  </Button>
                  {targetTasks.length === 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRemoveTarget(target)}
                      isLoading={removingTargetId === target.id}
                    >
                      <Trash2 className="w-4 h-4" /> Xoá target
                    </Button>
                  )}
                </div>
              </div>

              {suggestions.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Tạo task Comment từ gợi ý:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <Button key={s.id} size="sm" variant="secondary" onClick={() => openAssign(target, s)}>
                        <Plus className="w-3.5 h-3.5" /> {s.content.slice(0, 24)}
                        {s.content.length > 24 ? "…" : ""}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {targetTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có task nào cho bài này.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-2 pr-4">Hành động</th>
                        <th className="py-2 pr-4">Nội dung</th>
                        <th className="py-2 pr-4">Nhân viên được giao</th>
                        {/* Phase 2K-BO — only Share (distribution) tasks ever set
                           execution_account_id; every other row shows "—". */}
                        <th className="py-2 pr-4">Account thực hiện</th>
                        <th className="py-2 pr-4">Người thực hiện</th>
                        <th className="py-2 pr-4">Thời gian thực hiện</th>
                        <th className="py-2 pr-4">Trạng thái</th>
                        <th className="py-2 pr-4">Bằng chứng (nội dung)</th>
                        <th className="py-2 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetTasks.map((t) => {
                        const nextActions = SEEDING_TASK_ALLOWED_TRANSITIONS[t.status] ?? [];
                        return (
                          <tr key={t.id} className="border-b border-border last:border-0 align-top">
                            <td className="py-3 pr-4 text-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                {actionIcon(t.action_type)} {seedingTaskActionTypeLabel(t.action_type)}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-foreground max-w-xs">{t.comment_text || "—"}</td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {staffOptions.find((s) => s.value === t.assigned_staff_id)?.label ?? "Chưa gán"}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {t.execution_account_id ? executionAccountNameById.get(t.execution_account_id) ?? "—" : "—"}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {t.executed_by_staff_id ? staffOptions.find((s) => s.value === t.executed_by_staff_id)?.label ?? "—" : "—"}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                              {t.executed_at
                                ? new Date(t.executed_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })
                                : "—"}
                            </td>
                            <td className="py-3 pr-4">
                              {taskStatusBadge(t.status)}
                              {t.result_note && <p className="text-xs text-muted-foreground mt-1">{t.result_note}</p>}
                            </td>
                            <td className="py-3 pr-4">
                              {t.action_type === "Comment" ? (
                                evidenceResultBadge(evidenceByTaskId.get(t.id))
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 whitespace-nowrap">
                              {/* Phase 2K-BK — Direct Facebook Comment Publish. Page-only
                                 (see the 2K-BK feasibility audit: no officially supported
                                 API path exists for Personal/Group). Never shown as an
                                 available action for a source it isn't supported for. */}
                              {t.action_type === "Comment" && t.status === "Pending" && (
                                <div className="mb-1.5">
                                  {target.source_type !== "Page" ? (
                                    <span className="text-xs text-muted-foreground">
                                      Không hỗ trợ đăng trực tiếp cho nguồn {target.source_type} — dùng quy trình thủ công bên dưới.
                                    </span>
                                  ) : directCommentCapability?.availability === "AVAILABLE" ? (
                                    <div className="space-y-1">
                                      {/* Phase 2K-BY (P1 #6) — presentation-only reinforcement,
                                         co-located with the action it warns about (the card-header
                                         badge from 2K-BQ can be several rows above this specific
                                         task). Never blocks the click, never alters
                                         handleDirectPublish — the server's own fresh
                                         checkTargetCompatibility + needsAcknowledgment protocol
                                         (2K-BS) remains the sole source of truth; this is only a
                                         heads-up before the first click, not a second gate.
                                         COMPATIBLE/UNKNOWN intentionally render nothing extra
                                         here — UNKNOWN already has its own honest, non-alarmist
                                         badge in the card header and must not be duplicated as a
                                         louder warning down here. */}
                                      {targetCompatibility[target.id]?.compatibility === "INCOMPATIBLE" && (
                                        <p className="text-xs text-destructive flex items-center gap-1">
                                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                          Có thể không tương thích với Page hiện tại
                                        </p>
                                      )}
                                      <Button
                                        size="sm"
                                        onClick={() => handleDirectPublish(t.id)}
                                        isLoading={postingTaskId === t.id}
                                        disabled={postingTaskId !== null && postingTaskId !== t.id}
                                      >
                                        <Send className="w-3.5 h-3.5" /> Đăng comment
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Đăng trực tiếp: {directCommentCapability?.reason ?? "chưa khả dụng"} — dùng quy trình thủ công bên dưới.
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="flex gap-1.5 flex-wrap">
                                {nextActions.map((next) => (
                                  <Button key={next} size="sm" variant="secondary" onClick={() => handleTaskStatusClick(t.id, next)}>
                                    {seedingTaskStatusLabel(next)}
                                  </Button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
          })}
        </>
      )}

      {assigning && (
        <Modal open={!!assigning} title="Tạo task Comment" onClose={() => setAssigning(null)}>
          <div className="space-y-3">
            <Input label="Nội dung comment" value={editableComment} onChange={(e) => setEditableComment(e.target.value)} />
            <Select label="Người thực hiện" placeholder="Chưa gán" options={staffOptions} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />
            <Input label="Thời gian dự kiến" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            {taskError && <p className="text-destructive text-sm">{taskError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setAssigning(null)}>
                Hủy
              </Button>
              <Button onClick={handleCreateCommentTask} isLoading={isSubmittingTask}>
                {isSubmittingTask ? "Đang tạo..." : "Tạo task"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {creatingSimpleTask && (
        <Modal
          open={!!creatingSimpleTask}
          title={`Tạo task ${seedingTaskActionTypeLabel(creatingSimpleTask.actionType)}`}
          onClose={() => setCreatingSimpleTask(null)}
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nhân viên sẽ mở bài viết trên Facebook và tự thực hiện {seedingTaskActionTypeLabel(creatingSimpleTask.actionType)} —
              CRM không tự động thực hiện hành động này.
            </p>
            {creatingSimpleTask.actionType === "Comment" && (
              <Input
                label="Nội dung comment"
                value={editableComment}
                onChange={(e) => setEditableComment(e.target.value)}
                placeholder="Tự nhập nội dung — không dùng gợi ý AI"
              />
            )}
            <Select label="Người thực hiện" placeholder="Chưa gán" options={staffOptions} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />
            <Input label="Thời gian dự kiến" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            {taskError && <p className="text-destructive text-sm">{taskError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setCreatingSimpleTask(null)}>
                Hủy
              </Button>
              <Button onClick={handleCreateSimpleTask} isLoading={isSubmittingTask}>
                {isSubmittingTask ? "Đang tạo..." : "Tạo task"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showBulkModal && (
        <Modal
          open={showBulkModal}
          title={`Tạo Task Comment hàng loạt (${selectedTargetIds.size} bài viết)`}
          onClose={() => setShowBulkModal(false)}
          size="xl"
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Một nội dung comment sẽ được áp dụng cho tất cả {selectedTargetIds.size} bài viết đã chọn — mỗi bài một task Comment
              riêng, cùng người thực hiện và ngày dự kiến.
            </p>

            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Chọn từ gợi ý AI:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Button key={s.id} type="button" size="sm" variant="secondary" onClick={() => setBulkComment(s.content)}>
                      <Plus className="w-3.5 h-3.5" /> {s.content.slice(0, 24)}
                      {s.content.length > 24 ? "…" : ""}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Input
              label="Nội dung comment (áp dụng cho tất cả bài đã chọn)"
              value={bulkComment}
              onChange={(e) => setBulkComment(e.target.value)}
            />
            <Select
              label="Người thực hiện"
              placeholder="Chưa gán"
              options={staffOptions}
              value={bulkAssigneeId}
              onChange={(e) => setBulkAssigneeId(e.target.value)}
            />
            <Input
              label="Thời gian dự kiến"
              type="datetime-local"
              value={bulkScheduledAt}
              onChange={(e) => setBulkScheduledAt(e.target.value)}
            />
            {bulkError && <p className="text-destructive text-sm">{bulkError}</p>}
            {bulkResultSummary && <p className="text-sm text-foreground">{bulkResultSummary}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowBulkModal(false)}>
                Hủy
              </Button>
              <Button onClick={submitBulkCommentTasks} isLoading={isSubmittingBulk} disabled={selectedTargetIds.size === 0}>
                {isSubmittingBulk ? "Đang tạo..." : `Tạo ${selectedTargetIds.size} task`}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pendingTaskChange && (
        <Modal
          open={!!pendingTaskChange}
          title={`${seedingTaskStatusLabel(pendingTaskChange.status)} — nhập lý do`}
          onClose={() => setPendingTaskChange(null)}
        >
          <div className="space-y-3">
            <Input
              label="Lý do / ghi chú"
              value={taskReasonInput}
              onChange={(e) => setTaskReasonInput(e.target.value)}
              placeholder="VD: Bài viết đã bị ẩn trước khi kịp thao tác"
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPendingTaskChange(null)}>
                Hủy
              </Button>
              <Button onClick={confirmPendingTaskChange}>Xác nhận {seedingTaskStatusLabel(pendingTaskChange.status)}</Button>
            </div>
          </div>
        </Modal>
      )}

      {completionWarning && (
        <Modal open={!!completionWarning} title="Xác nhận hoàn thành campaign" onClose={() => setCompletionWarning(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm text-foreground">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              {completionWarning.unfinishedCount === null ? (
                <p>
                  Không thể xác định số task chưa hoàn tất vào lúc này. Trạng thái các task sẽ giữ nguyên — không tự động đánh dấu
                  Hoàn thành/Thất bại/Bỏ qua. Bạn vẫn muốn chuyển Campaign sang {seedingCampaignStatusLabel(completionWarning.next)}{" "}
                  không?
                </p>
              ) : (
                <p>
                  Campaign này còn <strong>{completionWarning.unfinishedCount} task</strong> chưa hoàn thành (chờ xử lý hoặc đang thực
                  hiện). Trạng thái các task này sẽ giữ nguyên — không tự động đánh dấu Hoàn thành/Thất bại/Bỏ qua. Bạn có chắc muốn
                  chuyển campaign sang {seedingCampaignStatusLabel(completionWarning.next)}?
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setCompletionWarning(null)}>
                Hủy
              </Button>
              <Button isLoading={isChangingCampaignStatus} onClick={confirmCompletionWarning}>
                Xác nhận {seedingCampaignStatusLabel(completionWarning.next)}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {distributingTarget && (
        <CampaignDistributionModal
          campaignId={id}
          target={distributingTarget}
          onClose={() => setDistributingTarget(null)}
          onConfirmed={async () => {
            const [tasksRes, progressRes] = await Promise.all([
              fetch(`/api/seeding/tasks?campaignId=${id}`),
              fetch(`/api/seeding/campaigns/${id}/progress`),
            ]);
            if (tasksRes.ok) setTasks(await tasksRes.json());
            if (progressRes.ok) setProgress(await progressRes.json());
          }}
        />
      )}

      {/* Phase 2K-BP — Reassign Connected Page. Every candidate is shown,
         AVAILABLE or not — an admin may deliberately pick an UNAVAILABLE
         Page (e.g. one about to be reconnected); this UI never hides
         that option or silently downgrades it to "not selectable". The
         reason a Page is UNAVAILABLE is always shown, never suppressed. */}
      <Modal open={showReassignPageModal} title="Đổi Connected Page" onClose={() => setShowReassignPageModal(false)}>
        <div className="space-y-4">
          {isLoadingReassignCandidates ? (
            <p className="text-sm text-muted-foreground">Đang tải danh sách Page...</p>
          ) : reassignCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có Facebook Page nào được kết nối trong CRM.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {reassignCandidates.map((c) => {
                const isCurrent = c.page.facebook_page_id === campaignPageInfo?.facebook_page_id;
                const isSelected = c.page.facebook_page_id === selectedReassignPageId;
                return (
                  <label
                    key={c.page.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <input
                      type="radio"
                      name="reassign-page"
                      className="mt-1"
                      checked={isSelected}
                      onChange={() => setSelectedReassignPageId(c.page.facebook_page_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{c.page.page_name}</span>
                        {isCurrent && <Badge variant="default">Đang dùng</Badge>}
                        {c.page.status === "Connected" && <Badge variant="success">Đã kết nối</Badge>}
                        {c.page.status === "Reconnect Required" && <Badge variant="warning">Cần kết nối lại</Badge>}
                        {c.page.status === "Disconnected" && <Badge variant="muted">Đã ngắt kết nối</Badge>}
                        {c.direct_comment_capability.availability === "AVAILABLE" ? (
                          <Badge variant="success">Đăng trực tiếp: Khả dụng</Badge>
                        ) : (
                          <Badge variant="muted">Đăng trực tiếp: Chưa khả dụng</Badge>
                        )}
                      </div>
                      {c.direct_comment_capability.reason && (
                        <p className="text-xs text-muted-foreground mt-1">{c.direct_comment_capability.reason}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          {reassignPageError && <p className="text-destructive text-sm">{reassignPageError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowReassignPageModal(false)}>
              Hủy
            </Button>
            <Button onClick={handleConfirmReassignPage} isLoading={isReassigningPage} disabled={!selectedReassignPageId}>
              Xác nhận đổi Page
            </Button>
          </div>
        </div>
      </Modal>

      {/* Phase 2K-BS — server-side acknowledgment protocol. Opened only
         by a needsAcknowledgment response to a real publish attempt
         (never speculatively from the target-card badge) — the reason
         shown here is whatever the server just freshly computed, not the
         page-load-time targetCompatibility map. "Vẫn đăng comment" re-
         sends the exact same request with acknowledged:true; the server
         recomputes compatibility again from scratch before deciding
         anything — this modal never tells the server what the
         compatibility is. */}
      <Modal open={!!acknowledgmentModal} title="Target có thể không tương thích" onClose={handleCancelAcknowledgment}>
        {acknowledgmentModal && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              {campaignPageInfo?.page_name
                ? `Connected Page hiện tại của campaign là "${campaignPageInfo.page_name}".`
                : "Campaign đang có một Connected Page."}
            </p>
            <p className="text-sm text-foreground">{acknowledgmentModal.reason}</p>
            <p className="text-sm text-muted-foreground">
              Comment có thể không đăng được lên bài viết này bằng Page hiện tại. Facebook (Graph API) vẫn là bên quyết định cuối
              cùng — hệ thống chỉ cảnh báo trước, không tự chặn.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={handleCancelAcknowledgment} disabled={postingTaskId === acknowledgmentModal.taskId}>
                Hủy
              </Button>
              <Button
                onClick={() => handleDirectPublish(acknowledgmentModal.taskId, true)}
                isLoading={postingTaskId === acknowledgmentModal.taskId}
                disabled={postingTaskId !== null && postingTaskId !== acknowledgmentModal.taskId}
              >
                Vẫn đăng comment
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Phase 2K-BU — Personal Post Quick Capture. Default flow is
         literally paste + one click: URL input, one primary button,
         nothing else required. "Nguồn (tùy chọn)" only matters for a URL
         the server can't already recognize as a known Page post — a
         Group permalink is auto-detected regardless of this selector, and
         a recognized Page post ignores it entirely (server-side, not
         silently — quickCaptureTargetFromUrl rejects an override in that
         case, surfaced honestly if it somehow gets sent). Stays open
         after a successful capture so pasting several links in a row
         needs no re-opening. */}
      <Modal
        open={showQuickCaptureModal}
        title="Thêm bài viết Facebook"
        onClose={() => setShowQuickCaptureModal(false)}
      >
        <div className="space-y-3">
          <Input
            label="Link bài viết Facebook"
            value={quickCaptureUrl}
            onChange={(e) => setQuickCaptureUrl(e.target.value)}
            placeholder="https://www.facebook.com/.../posts/..."
          />
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nguồn (tùy chọn — để trống nếu không chắc)</label>
            <div className="flex gap-2">
              {(["", "Personal", "Group"] as const).map((opt) => (
                <button
                  key={opt || "auto"}
                  type="button"
                  onClick={() => setQuickCaptureSourceOverride(opt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    quickCaptureSourceOverride === opt
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {opt === "" ? "Tự động" : opt === "Personal" ? "Cá nhân" : "Nhóm"}
                </button>
              ))}
            </div>
          </div>
          {quickCaptureError && <p className="text-destructive text-sm">{quickCaptureError}</p>}
          {quickCaptureLastResult && !quickCaptureError && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
              {quickCaptureResultLabel()}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setShowQuickCaptureModal(false)}>
              Đóng
            </Button>
            <Button onClick={handleQuickCapture} isLoading={isQuickCapturing} disabled={!quickCaptureUrl.trim()}>
              Lưu
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
