"use client";

import { useCallback, useEffect, useState, use } from "react";
import { Sparkles, RefreshCw, AlertTriangle, ImageOff, ExternalLink, Plus, ThumbsUp, MessageCircle, Share2, SearchCheck } from "lucide-react";
import {
  SeedingCampaign,
  SeedingCommentSuggestion,
  SeedingTask,
  SeedingTaskStatus,
  SeedingCampaignTargetWithPost,
  SeedingCampaignProgress,
  SeedingTaskWithEvidence,
  SeedingEvidenceReconciliationBatchResult,
  SEEDING_COMMENT_CATEGORY_LABELS,
  SEEDING_TASK_ALLOWED_TRANSITIONS,
  SEEDING_TASK_EVIDENCE_EXCEPTION_RESULTS,
  SEEDING_CAMPAIGN_ALLOWED_TRANSITIONS,
} from "@/types/seeding";
import { seedingCampaignStatusLabel, seedingTaskStatusLabel, seedingTaskActionTypeLabel } from "@/lib/seeding/seeding.constants";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";

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

  // Phase 2F — AI-Powered Evidence Reconciliation. Content-only: never
  // implies staff identity is verified.
  const [evidenceByTaskId, setEvidenceByTaskId] = useState<Map<string, SeedingTaskWithEvidence>>(new Map());
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const [productDescription, setProductDescription] = useState("");
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

  // Result note capture (Phase 2E) — Failed/Skipped ask for a reason
  // before the PATCH fires; every other transition stays immediate,
  // unchanged. Reuses handleTaskStatus's existing resultNote param and the
  // existing result_note field/API — no new business rule.
  const [pendingTaskChange, setPendingTaskChange] = useState<{ taskId: string; status: SeedingTaskStatus } | null>(null);
  const [taskReasonInput, setTaskReasonInput] = useState("");

  const staffOptions = useStaffOptions();

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setForbidden(false);
    try {
      const [campaignRes, targetsRes, suggestionsRes, tasksRes, progressRes, evidenceRes] = await Promise.all([
        fetch(`/api/seeding/campaigns/${id}`),
        fetch(`/api/seeding/campaigns/${id}/targets`),
        fetch(`/api/seeding/campaigns/${id}/generate-comments`),
        fetch(`/api/seeding/tasks?campaignId=${id}`),
        fetch(`/api/seeding/campaigns/${id}/progress`),
        fetch(`/api/seeding/campaigns/${id}/evidence-reconciliation`),
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
    } catch (error) {
      console.error("Failed to load seeding campaign detail:", error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleGenerate() {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/seeding/campaigns/${id}/generate-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDescription: productDescription || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo gợi ý");
      const newSuggestions: SeedingCommentSuggestion[] = await res.json();
      setSuggestions((prev) => [...prev, ...newSuggestions]);
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
    setTaskError(null);
    try {
      const res = await fetch("/api/seeding/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo task");
      const task: SeedingTask = await res.json();
      setTasks((prev) => [...prev, task]);
      setAssigning(null);
      setCreatingSimpleTask(null);
      const progressRes = await fetch(`/api/seeding/campaigns/${id}/progress`);
      if (progressRes.ok) setProgress(await progressRes.json());
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Không thể tạo task");
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
      if (!res.ok) throw new Error(await res.text());
      const updated: SeedingCampaign = await res.json();
      setCampaign(updated);
    } catch (error) {
      console.error("Failed to change seeding campaign status:", error);
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

  if (isLoading || !campaign) {
    return (
      <div className="p-6">
        <div className="animate-spin text-2xl">⟳</div>
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground">
              {campaign.objective} · <Badge variant="warning">{seedingCampaignStatusLabel(campaign.status)}</Badge> · {targets.length} bài viết
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
          <h2 className="font-medium text-foreground">Gợi ý comment (AI) — dùng chung cho cả campaign</h2>
        </div>
        <div className="flex items-end gap-3 mb-4 flex-wrap">
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
        {generateError && <p className="text-destructive text-sm mb-3">{generateError}</p>}

        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có gợi ý nào — bấm Generate để AI tạo comment.</p>
        ) : (
          <div className="space-y-4">
            {suggestionsByCategory.map(({ category, label, items }) =>
              items.length === 0 ? null : (
                <div key={category}>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{label}</h3>
                  <div className="space-y-2">
                    {items.map((s) => (
                      <p key={s.id} className="text-sm text-foreground rounded-lg border border-border p-3">
                        {s.content}
                      </p>
                    ))}
                  </div>
                </div>
              )
            )}
            <p className="text-xs text-muted-foreground">Chọn một gợi ý khi tạo task Comment cho từng bài viết bên dưới.</p>
          </div>
        )}
      </Card>

      {targets.length === 0 ? (
        <Card className="text-sm text-muted-foreground">Campaign này chưa có bài viết (target) nào.</Card>
      ) : (
        targets.map((target) => {
          const targetTasks = tasks.filter((t) => t.campaign_target_id === target.id);
          return (
            <Card key={target.id}>
              <div className="flex items-start gap-3 mb-4">
                {target.full_picture_url ? (
                  <img src={target.full_picture_url} alt="" className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <ImageOff className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground line-clamp-2">{target.message || "(không có nội dung)"}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {target.discovery_status !== "Active" && (
                      <Badge variant={target.discovery_status === "Unavailable" ? "destructive" : "warning"}>
                        {target.discovery_status === "Unavailable" ? "Bài không còn truy cập" : "Đồng bộ lỗi gần nhất"}
                      </Badge>
                    )}
                    {target.permalink_url && (
                      <a
                        href={target.permalink_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Mở trên Facebook
                      </a>
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
                        <th className="py-2 pr-4">Người thực hiện</th>
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
        })
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
              <Button onClick={handleCreateCommentTask}>Tạo task</Button>
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
              <Button onClick={handleCreateSimpleTask}>Tạo task</Button>
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
    </div>
  );
}
