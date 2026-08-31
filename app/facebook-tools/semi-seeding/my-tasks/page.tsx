"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ImageOff, ExternalLink, ThumbsUp, MessageCircle, Share2, ClipboardList, Lock, PlayCircle, Copy, Link2, Maximize2 } from "lucide-react";
import { SeedingTaskWithContext, SeedingTaskStatus, SEEDING_TASK_ALLOWED_TRANSITIONS } from "@/types/seeding";
import { seedingTaskStatusLabel, seedingTaskActionTypeLabel } from "@/lib/seeding/seeding.constants";
import { cn, handleFacebookLinkClick, isMobileUserAgent } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";

/** Facebook Tools → Semi Seeding → My Tasks (Phase 2D/2E). The
 * `seeding.execute` surface — everything assigned to the CALLING staff
 * member, across every campaign, gated server-side by `seeding.execute`
 * alone (not `seeding.manage`). No Facebook write action anywhere on this
 * page: the only Facebook-facing control is an external permalink link the
 * staff member opens to act on themselves; every status update here just
 * writes back to the CRM via the existing PATCH /api/seeding/tasks/[id].
 *
 * Mobile-first fallback (real iPhone UAT, 2026-08-26) — Safari's Universal
 * Link handoff into the native Facebook app is OS-controlled and not
 * something the CRM can force or verify; "Copy link bài viết" gives the
 * employee a guaranteed manual path to the exact post independent of
 * whether that handoff succeeds. Still no Facebook write anywhere here —
 * clipboard-only, same as Copy comment.
 *
 * Mobile-open fix rev.2 (real iPhone UAT, 2026-08-27) — a same-tab
 * window.location.assign() call (rev.1) still failed to open a Page Post
 * correctly on a real device; only the browser's own genuine, unmodified
 * anchor default navigation worked. "Mở Facebook" below is a real
 * <a href> and, on mobile, its click is left completely untouched — no
 * preventDefault, no JS navigation — see lib/utils.ts
 * isMobileUserAgent/handleFacebookLinkClick. */

/** Statuses that ask for a reason before committing — reused, not a new
 * business rule: same result_note field/API every other status already
 * writes to (with null). */
const STATUSES_REQUIRING_REASON = new Set<SeedingTaskStatus>(["Failed", "Skipped"]);

function taskStatusBadge(status: SeedingTaskStatus) {
  const label = seedingTaskStatusLabel(status);
  if (status === "Done") return <Badge variant="success">{label}</Badge>;
  if (status === "Failed") return <Badge variant="destructive">{label}</Badge>;
  if (status === "In Progress") return <Badge variant="default">{label}</Badge>;
  if (status === "Skipped" || status === "Cancelled") return <Badge variant="muted">{label}</Badge>;
  return <Badge variant="warning">{label}</Badge>;
}

function discoveryStatusWarning(status: string | null) {
  if (!status || status === "Active") return null;
  const message =
    status === "Unavailable"
      ? "Bài viết này hiện không còn truy cập được trên Facebook."
      : "Lần đồng bộ gần nhất của bài viết này bị lỗi — dữ liệu có thể không còn mới nhất.";
  return (
    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {message}
    </p>
  );
}

/** Phase 2G (M1-C) — informational + UI-gating only: closing a campaign
 * never touches task data (see seedingTask.service.ts), this just tells
 * the assignee not to expect normal execution to still be tracked here.
 * A Manager reopening the campaign (Completed -> Active) makes this
 * disappear on the next load with no other action needed. */
function campaignClosedNotice() {
  return (
    <p className="text-xs text-foreground bg-muted border border-border rounded-lg px-2 py-1.5 flex items-center gap-1.5">
      <Lock className="w-3.5 h-3.5 shrink-0" /> Campaign này đã đóng (Hoàn thành) — không cần tiếp tục thao tác cho task này.
    </p>
  );
}

function actionIcon(actionType: string) {
  if (actionType === "Like") return <ThumbsUp className="w-4 h-4" />;
  if (actionType === "Share") return <Share2 className="w-4 h-4" />;
  return <MessageCircle className="w-4 h-4" />;
}

/** Phase 2K-CF (Issue 1) — same eligibility concept the sequential
 * runner (my-tasks/run/page.tsx's own isEligible) and the "Bắt đầu thực
 * hiện tuần tự" button already used inline here — extracted once, in
 * this file only, so the new status filter/tab uses the exact same
 * definition as the button it sits next to. Run's own eligibility logic
 * is untouched. */
function isTaskActionable(t: SeedingTaskWithContext): boolean {
  return t.campaign_status !== "Completed" && (t.status === "Pending" || t.status === "In Progress");
}

type TaskFilterMode = "actionable" | "all";

export default function MySeedingTasksPage() {
  const [tasks, setTasks] = useState<SeedingTaskWithContext[]>([]);
  const [filterMode, setFilterMode] = useState<TaskFilterMode>("actionable");
  const [forbidden, setForbidden] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [copiedCommentTaskId, setCopiedCommentTaskId] = useState<string | null>(null);
  const [copiedLinkTaskId, setCopiedLinkTaskId] = useState<string | null>(null);

  const [pendingChange, setPendingChange] = useState<{ taskId: string; status: SeedingTaskStatus } | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  // Phase 2K-BY (P1 #7) — visible surface for actions that previously
  // only console.error'd (load failure, status update failure, clipboard
  // denial).
  const [actionError, setActionError] = useState<string | null>(null);
  // Mobile-open fix rev.2 — client-side only, after mount (see the
  // runner page's identical comment for why this can't be computed at
  // render time without risking a hydration mismatch).
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    (async () => {
      setIsMobile(isMobileUserAgent());
    })();
  }, []);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setForbidden(false);
    setActionError(null);
    try {
      const res = await fetch("/api/seeding/tasks?assignedToMe=true");
      if (res.status === 403 || res.status === 401) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setTasks(await res.json());
    } catch (error) {
      console.error("Failed to load my seeding tasks:", error);
      setActionError("Không thể tải danh sách công việc — vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function submitStatus(taskId: string, status: SeedingTaskStatus, resultNote?: string) {
    setUpdatingId(taskId);
    try {
      const res = await fetch(`/api/seeding/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, result_note: resultNote ?? null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể cập nhật task");
      const updated: SeedingTaskWithContext = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
    } catch (error) {
      console.error("Failed to update my seeding task status:", error);
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật task");
    } finally {
      setUpdatingId(null);
    }
  }

  function handleStatusClick(taskId: string, status: SeedingTaskStatus) {
    if (STATUSES_REQUIRING_REASON.has(status)) {
      setPendingChange({ taskId, status });
      setReasonInput("");
      return;
    }
    submitStatus(taskId, status);
  }

  async function handleCopyComment(taskId: string, commentText: string) {
    try {
      await navigator.clipboard.writeText(commentText);
      setCopiedCommentTaskId(taskId);
      setTimeout(() => setCopiedCommentTaskId((id) => (id === taskId ? null : id)), 2000);
    } catch (error) {
      console.error("Clipboard copy failed:", error);
      setActionError("Không thể copy — trình duyệt từ chối quyền truy cập clipboard.");
    }
  }

  /** See the file-level note above — the guaranteed manual fallback for
   * when the native Facebook app handoff doesn't land on the right post. */
  async function handleCopyLink(taskId: string, permalinkUrl: string) {
    try {
      await navigator.clipboard.writeText(permalinkUrl);
      setCopiedLinkTaskId(taskId);
      setTimeout(() => setCopiedLinkTaskId((id) => (id === taskId ? null : id)), 2000);
    } catch (error) {
      console.error("Clipboard copy failed:", error);
      setActionError("Không thể copy — trình duyệt từ chối quyền truy cập clipboard.");
    }
  }

  async function confirmPendingChange() {
    if (!pendingChange) return;
    await submitStatus(pendingChange.taskId, pendingChange.status, reasonInput || undefined);
    setPendingChange(null);
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <Card className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            Bạn chưa được cấp quyền <code>seeding.execute</code>. Liên hệ Admin để được cấp quyền trong Cài đặt →
            Phân quyền.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {/* Phase 2K-BY (P1 #7) — visible surface for actions that
         previously only console.error'd. Dismissible; the next
         loadTasks() call clears it. */}
      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} className="text-destructive/70 hover:text-destructive text-xs">
            Đóng
          </button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <ClipboardList className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Công việc của tôi</h1>
          <p className="text-sm text-muted-foreground">Task seeding được giao cho bạn — tự thao tác trên Facebook, cập nhật kết quả tại đây</p>
        </div>
      </div>

      {isLoading ? (
        // Phase 2I (I6) — keeps the page header/context visible instead of
        // an almost-blank screen; states what is loading.
        <div className="space-y-3">
          <div className="h-20 bg-muted rounded-lg animate-pulse" />
          <div className="h-20 bg-muted rounded-lg animate-pulse" />
          <p className="text-sm text-muted-foreground text-center">Đang tải công việc của bạn...</p>
        </div>
      ) : tasks.length === 0 ? (
        <Card className="text-sm text-muted-foreground text-center py-10">Bạn chưa được giao task nào.</Card>
      ) : (
        <div className="space-y-3">
          {(() => {
            const actionableCount = tasks.filter(isTaskActionable).length;
            const allCount = tasks.length;
            const visibleTasks = filterMode === "actionable" ? tasks.filter(isTaskActionable) : tasks;
            return (
              <>
                {/* Phase 2K-CF (Issue 1) — the sequential Run queue already
                   correctly excludes terminal-status/closed-campaign tasks
                   (unchanged); this filter/tab addresses the separate
                   problem of this LIST mixing every status together with
                   no way to focus on actionable work. Default view =
                   actionable only. */}
                <div className="flex items-center gap-2" role="tablist" aria-label="Lọc theo trạng thái">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterMode === "actionable"}
                    onClick={() => setFilterMode("actionable")}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium touch-manipulation transition-colors",
                      filterMode === "actionable"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    Cần xử lý ({actionableCount})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterMode === "all"}
                    onClick={() => setFilterMode("all")}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium touch-manipulation transition-colors",
                      filterMode === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    Tất cả ({allCount})
                  </button>
                </div>

                {actionableCount > 0 && (
                  <Link
                    href="/facebook-tools/semi-seeding/my-tasks/run"
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 touch-manipulation"
                  >
                    <PlayCircle className="w-4 h-4" /> Bắt đầu thực hiện tuần tự ({actionableCount} task)
                  </Link>
                )}

                {visibleTasks.length === 0 ? (
                  <Card className="text-sm text-muted-foreground text-center py-10">
                    {filterMode === "actionable"
                      ? "Không còn task nào cần xử lý — mọi việc đã xong."
                      : "Không có task nào."}
                  </Card>
                ) : (
                  visibleTasks.map((task) => {
            const campaignClosed = task.campaign_status === "Completed";
            const nextActions = campaignClosed ? [] : (SEEDING_TASK_ALLOWED_TRANSITIONS[task.status] ?? []);
            return (
              <Card key={task.id}>
                <div className="flex items-start gap-3">
                  {task.target_full_picture_url ? (
                    <img
                      src={task.target_full_picture_url}
                      alt=""
                      loading="lazy"
                      className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <ImageOff className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-xs text-muted-foreground">{task.campaign_name ?? "(campaign không xác định)"}</p>
                    <p className="text-sm text-foreground line-clamp-2">{task.target_message || "(không có nội dung)"}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="muted">
                        <span className="inline-flex items-center gap-1">
                          {actionIcon(task.action_type)} {seedingTaskActionTypeLabel(task.action_type)}
                        </span>
                      </Badge>
                      {taskStatusBadge(task.status)}
                    </div>
                    {/* Phase 2K-BY (P1 #1) — a Distribution-created Share
                       task's own account/destination assignment, never
                       shown before. Omitted entirely (not "—") for a
                       non-distribution task — that is the honest neutral
                       state, not a missing-data error. */}
                    {(task.execution_account_name || task.destination_label) && (
                      <p className="text-xs text-muted-foreground">
                        {task.execution_account_name && <>Đăng bằng account: {task.execution_account_name}</>}
                        {task.execution_account_name && task.destination_label && " · "}
                        {task.destination_label && <>Điểm đến: {task.destination_label}</>}
                      </p>
                    )}
                    {campaignClosed && campaignClosedNotice()}
                    {discoveryStatusWarning(task.target_discovery_status)}
                    {task.action_type === "Comment" && task.comment_text && (
                      <p className="text-sm text-foreground rounded-lg border border-border p-2 whitespace-pre-wrap">
                        {task.comment_text}
                      </p>
                    )}
                    {task.result_note && <p className="text-xs text-muted-foreground">Ghi chú: {task.result_note}</p>}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/facebook-tools/semi-seeding/my-tasks/run?taskId=${task.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors"
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> Mở task
                    </Link>
                    {task.action_type === "Comment" && task.comment_text && (
                      <Button size="sm" variant="secondary" onClick={() => handleCopyComment(task.id, task.comment_text!)}>
                        <Copy className="w-3.5 h-3.5" /> {copiedCommentTaskId === task.id ? "Đã copy!" : "Copy comment"}
                      </Button>
                    )}
                    {task.target_permalink_url && (
                      <Button size="sm" variant="secondary" onClick={() => handleCopyLink(task.id, task.target_permalink_url!)}>
                        <Link2 className="w-3.5 h-3.5" /> {copiedLinkTaskId === task.id ? "Đã copy link!" : "Copy link bài viết"}
                      </Button>
                    )}
                    {task.target_permalink_url ? (
                      <a
                        href={task.target_permalink_url}
                        target={isMobile ? undefined : "_blank"}
                        rel={isMobile ? undefined : "noopener noreferrer"}
                        onClick={(e) => handleFacebookLinkClick(e, task.target_permalink_url!)}
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="w-4 h-4" /> Mở Facebook
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">Không có permalink</span>
                    )}
                  </div>
                  {task.target_permalink_url && (
                    <p className="text-xs text-muted-foreground">
                      Không mở được đúng bài viết trong app? Hãy dùng &quot;Copy link bài viết&quot; và mở trực tiếp trong Facebook.
                    </p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {nextActions.map((next) => (
                      <Button
                        key={next}
                        size="sm"
                        variant={next === "Done" ? "primary" : "secondary"}
                        isLoading={updatingId === task.id}
                        onClick={() => handleStatusClick(task.id, next)}
                      >
                        {seedingTaskStatusLabel(next)}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
                    );
                  })
                )}
              </>
            );
          })()}
        </div>
      )}

      {pendingChange && (
        <Modal
          open={!!pendingChange}
          title={`${seedingTaskStatusLabel(pendingChange.status)} — nhập lý do`}
          onClose={() => setPendingChange(null)}
        >
          <div className="space-y-3">
            <Input
              label="Lý do / ghi chú"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="VD: Bài viết đã bị ẩn trước khi kịp thao tác"
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPendingChange(null)}>
                Hủy
              </Button>
              <Button onClick={confirmPendingChange} isLoading={updatingId === pendingChange.taskId}>
                Xác nhận {seedingTaskStatusLabel(pendingChange.status)}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
