"use client";

import { Suspense, useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ImageOff, ExternalLink, Copy, Link2, CheckCircle2, ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { SeedingTaskWithContext, SeedingTaskStatus, SEEDING_TASK_ALLOWED_TRANSITIONS } from "@/types/seeding";
import { seedingTaskStatusLabel, seedingTaskActionTypeLabel } from "@/lib/seeding/seeding.constants";
import { cn, isMobileUserAgent } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";

/** Phase 2I (I4) — Employee Sequential Task Runner. Reuses the exact same
 * data source (GET /api/seeding/tasks?assignedToMe=true, already isolated
 * server-side to the calling staff member — no new access path, no way to
 * execute another employee's tasks) and the exact same write path (PATCH
 * /api/seeding/tasks/[id], the same SEEDING_TASK_ALLOWED_TRANSITIONS state
 * machine as My Tasks) — this page only changes the presentation/flow, not
 * the task lifecycle. Never marks a task complete automatically; opening
 * Facebook or copying the comment is never itself a status change. */

const STATUSES_REQUIRING_REASON = new Set<SeedingTaskStatus>(["Failed", "Skipped"]);

function isEligible(task: SeedingTaskWithContext): boolean {
  return task.campaign_status !== "Completed" && (task.status === "Pending" || task.status === "In Progress");
}

/** Phase 2K-AP — useSearchParams() requires a Suspense boundary in the App
 * Router (Next.js build fails otherwise); the fallback matches this page's
 * own existing loading skeleton so there's no visible flash/regression for
 * the plain (no ?taskId) entry point. */
export default function SeedingTaskRunnerPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 max-w-xl mx-auto space-y-3">
          <div className="h-32 bg-muted rounded-lg animate-pulse" />
        </div>
      }
    >
      <SeedingTaskRunnerInner />
    </Suspense>
  );
}

function SeedingTaskRunnerInner() {
  const searchParams = useSearchParams();
  // Phase 2K-AP — optional direct-open entry point: My Tasks can deep-link
  // straight into one specific task's full execution card via ?taskId=,
  // independent of queue position/eligibility. Omitted, behavior is
  // byte-for-byte unchanged from before this phase.
  const requestedTaskId = searchParams.get("taskId");
  const [tasks, setTasks] = useState<SeedingTaskWithContext[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyLinkFeedback, setCopyLinkFeedback] = useState(false);
  const [pendingChange, setPendingChange] = useState<{ taskId: string; status: SeedingTaskStatus } | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  // Phase 2K-BY (P1 #7) — visible surface for actions that previously
  // only console.error'd.
  const [actionError, setActionError] = useState<string | null>(null);
  // Mobile-open fix rev.2 (real iPhone UAT, 2026-08-27) — computed client-
  // side only, after mount, never during the render itself: reading
  // navigator.userAgent during render would differ between the server's
  // HTML (no navigator, defaults false here) and the client's hydration
  // pass, causing a hydration mismatch. Starts false to match the server;
  // the effect below corrects it before a human could plausibly tap.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    (async () => {
      setIsMobile(isMobileUserAgent());
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/seeding/tasks?assignedToMe=true");
        if (res.status === 403 || res.status === 401) {
          setForbidden(true);
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const all: SeedingTaskWithContext[] = await res.json();
        if (requestedTaskId) {
          // Phase 2K-AP — direct open: show every one of the caller's own
          // tasks (never eligibility-filtered here) so an already-
          // resolved task can still be reviewed, and jump straight to the
          // requested one. Falls back to index 0 if the id isn't found
          // (e.g. a stale link) rather than crashing.
          setTasks(all);
          const idx = all.findIndex((t) => t.id === requestedTaskId);
          setCurrentIndex(idx >= 0 ? idx : 0);
        } else {
          // Fixed, stable order for this session — only the eligible
          // (actionable) tasks, so "Task X / Total" stays meaningful and
          // never counts already-resolved or closed-campaign tasks.
          setTasks(all.filter(isEligible));
          setCurrentIndex(0);
        }
      } catch (error) {
        console.error("Failed to load task runner queue:", error);
        setActionError("Không thể tải danh sách task — vui lòng tải lại trang.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [requestedTaskId]);

  const currentTask = tasks[currentIndex];

  async function submitStatus(taskId: string, status: SeedingTaskStatus, resultNote?: string) {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/seeding/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, result_note: resultNote ?? null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể cập nhật task");
      const updated: SeedingTaskWithContext = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
      // Advance to the next still-eligible task, not just index + 1 — a
      // task just resolved here is no longer eligible, so skip straight
      // past it rather than showing a dead-end "resolved" screen.
      setCurrentIndex((prevIndex) => {
        for (let i = prevIndex + 1; i < tasks.length; i++) {
          if (tasks[i].id !== taskId) return i;
        }
        return prevIndex;
      });
    } catch (error) {
      console.error("Failed to update task from runner:", error);
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật task");
    } finally {
      setIsUpdating(false);
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

  async function confirmPendingChange() {
    if (!pendingChange) return;
    await submitStatus(pendingChange.taskId, pendingChange.status, reasonInput || undefined);
    setPendingChange(null);
  }

  async function handleCopyComment() {
    if (!currentTask?.comment_text) return;
    try {
      await navigator.clipboard.writeText(currentTask.comment_text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (error) {
      console.error("Clipboard copy failed:", error);
      setActionError("Không thể copy — trình duyệt từ chối quyền truy cập clipboard.");
    }
  }

  /** Mobile-open fix rev.2 (real iPhone UAT, 2026-08-27) — a real device
   * proved that a same-tab window.location.assign() call still failed to
   * open a Page Post correctly; only the browser's own genuine,
   * unmodified anchor default navigation worked. So the Facebook-opening
   * control below is a real <a href> and this handler must never call
   * preventDefault() or navigate via JS on mobile — see
   * lib/utils.ts handleFacebookLinkClick.
   *
   * For a Comment task this control is also the "copy comment" shortcut.
   * On desktop the copy is awaited before opening (unchanged from
   * before). On mobile, awaiting anything here is not an option — it
   * would delay the click handler's return, and the native navigation
   * must be left to proceed with zero JS interference. The copy is fired
   * without waiting for it instead: a genuine best-effort, not
   * guaranteed to complete before the tab navigates away. "Copy comment"
   * remains its own separate, always-reliable button for when that
   * matters more than the combined convenience. */
  function handleOpenFacebookClick(event: MouseEvent<HTMLAnchorElement>) {
    const url = currentTask?.target_permalink_url;
    if (!url) return;

    if (isMobile) {
      if (currentTask?.action_type === "Comment") void handleCopyComment();
      return; // no preventDefault — the anchor's own default navigation runs untouched
    }

    event.preventDefault();
    if (currentTask?.action_type === "Comment") {
      handleCopyComment().then(() => window.open(url, "_blank", "noopener,noreferrer"));
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  /** Mobile-first fallback (real iPhone UAT, 2026-08-26) — iOS's Universal
   * Link handoff from Safari into the native Facebook app is entirely
   * OS-controlled; the CRM cannot force or verify it succeeds, and no
   * documented facebook:// deep-link scheme exists for an arbitrary Page
   * post/video permalink. The one guaranteed-reliable manual path is
   * copying the exact, untransformed canonical URL so the employee can
   * open it themselves (paste into the Facebook app's own search/address
   * bar, or into a browser) if the automatic handoff doesn't land on the
   * right content. No shortening, no tracking wrapper — the raw stored
   * permalink, verbatim. */
  async function handleCopyLink() {
    if (!currentTask?.target_permalink_url) return;
    try {
      await navigator.clipboard.writeText(currentTask.target_permalink_url);
      setCopyLinkFeedback(true);
      setTimeout(() => setCopyLinkFeedback(false), 2000);
    } catch (error) {
      console.error("Clipboard copy failed:", error);
      setActionError("Không thể copy — trình duyệt từ chối quyền truy cập clipboard.");
    }
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <Card className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            Bạn chưa được cấp quyền <code>seeding.execute</code>.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-xl mx-auto space-y-3">
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <p className="text-sm text-muted-foreground text-center">Đang tải danh sách task...</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    // Phase 2K-BY (P1 #7) — a load failure previously left `tasks` at its
    // initial empty array, so the user saw this same "nothing to do"
    // success-looking screen instead of any error. Distinguish the two.
    return (
      <div className="p-6 max-w-xl mx-auto space-y-3">
        <Card className="text-center py-10 space-y-3">
          {actionError ? (
            <>
              <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
              <p className="text-sm text-destructive">{actionError}</p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
              <p className="text-sm text-foreground">Không có task nào cần thực hiện lúc này.</p>
            </>
          )}
          <Link href="/facebook-tools/semi-seeding/my-tasks" className="text-sm text-primary hover:underline">
            Quay lại Công việc của tôi
          </Link>
        </Card>
      </div>
    );
  }

  // A directly-requested task must always be shown, even if it (or every
  // other task) is already resolved — the "all done" screen only applies
  // to the plain sequential-queue entry point.
  const allResolved = !requestedTaskId && tasks.every((t) => !isEligible(t));
  if (allResolved) {
    return (
      <div className="p-6 max-w-xl mx-auto space-y-3">
        <Card className="text-center py-10 space-y-3">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
          <p className="text-sm text-foreground">Đã hoàn tất tất cả {tasks.length} task trong danh sách này.</p>
          <Link href="/facebook-tools/semi-seeding/my-tasks" className="text-sm text-primary hover:underline">
            Quay lại Công việc của tôi
          </Link>
        </Card>
      </div>
    );
  }

  const task = currentTask;
  const taskStillEligible = isEligible(task);
  const nextActions = taskStillEligible ? (SEEDING_TASK_ALLOWED_TRANSITIONS[task.status] ?? []) : [];

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} className="text-destructive/70 hover:text-destructive text-xs">
            Đóng
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <Link href="/facebook-tools/semi-seeding/my-tasks" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Công việc của tôi
        </Link>
        <span className="text-sm font-medium text-foreground">
          Task {currentIndex + 1} / {tasks.length}
        </span>
      </div>

      <Card>
        <p className="text-xs text-muted-foreground mb-1">{task.campaign_name ?? "(campaign không xác định)"}</p>
        <div className="flex items-start gap-3 mb-3">
          {task.target_full_picture_url ? (
            <img
              src={task.target_full_picture_url}
              alt=""
              loading="lazy"
              className="w-20 h-20 rounded-lg object-cover bg-muted shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <ImageOff className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm text-foreground line-clamp-3">{task.target_message || "(không có nội dung)"}</p>
            <Badge variant="muted">{seedingTaskActionTypeLabel(task.action_type)}</Badge>
            {/* Phase 2K-BY (P1 #1) — same account/destination context as
               My Tasks' list view, shown here too since Run is the actual
               execution screen. Omitted entirely for a non-distribution
               task (the honest neutral state). */}
            {(task.execution_account_name || task.destination_label) && (
              <p className="text-xs text-muted-foreground">
                {task.execution_account_name && <>Đăng bằng account: {task.execution_account_name}</>}
                {task.execution_account_name && task.destination_label && " · "}
                {task.destination_label && <>Điểm đến: {task.destination_label}</>}
              </p>
            )}
          </div>
        </div>

        {!taskStillEligible && (
          <p className="text-xs text-foreground bg-muted border border-border rounded-lg px-2 py-1.5 flex items-center gap-1.5 mb-3">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            {task.campaign_status === "Completed"
              ? "Campaign này đã đóng — không cần tiếp tục thao tác cho task này."
              : `Task này đã ở trạng thái ${seedingTaskStatusLabel(task.status)}.`}
          </p>
        )}

        {task.action_type === "Comment" && task.comment_text && (
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Nội dung comment:</p>
            <p className="text-sm text-foreground rounded-lg border border-border p-3 whitespace-pre-wrap">{task.comment_text}</p>
          </div>
        )}

        {task.result_note && <p className="text-xs text-muted-foreground mb-3">Ghi chú: {task.result_note}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          {task.action_type === "Comment" && task.comment_text && (
            <Button variant="secondary" onClick={handleCopyComment}>
              <Copy className="w-4 h-4" /> {copyFeedback ? "Đã copy!" : "Copy comment"}
            </Button>
          )}
          {task.target_permalink_url && (
            <Button variant="secondary" onClick={handleCopyLink}>
              <Link2 className="w-4 h-4" /> {copyLinkFeedback ? "Đã copy link!" : "Copy link bài viết"}
            </Button>
          )}
          {task.target_permalink_url ? (
            <a
              href={task.target_permalink_url}
              target={isMobile ? undefined : "_blank"}
              rel={isMobile ? undefined : "noopener noreferrer"}
              onClick={handleOpenFacebookClick}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150",
                "bg-muted text-foreground hover:bg-muted/70 border border-border px-4 py-2 text-sm"
              )}
            >
              <ExternalLink className="w-4 h-4" /> {task.action_type === "Comment" ? "Copy & Mở Facebook" : "Mở Facebook"}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground self-center">Không có permalink</span>
          )}
        </div>

        {task.target_permalink_url && (
          <p className="text-xs text-muted-foreground mb-2">
            Không mở được đúng bài viết trong app? Hãy dùng &quot;Copy link bài viết&quot; và mở trực tiếp trong Facebook.
          </p>
        )}

        <p className="text-xs text-muted-foreground mb-3">
          Bạn tự thực hiện hành động này trên Facebook, sau đó cập nhật kết quả bên dưới — CRM không tự động đánh dấu hoàn thành.
        </p>

        {taskStillEligible && (
          <div className="flex gap-2 flex-wrap mb-4">
            {nextActions.map((next) => (
              <Button
                key={next}
                variant={next === "Done" ? "primary" : "secondary"}
                isLoading={isUpdating}
                onClick={() => handleStatusClick(task.id, next)}
              >
                {next === "Done" ? `${seedingTaskStatusLabel(next)} & Tiếp theo` : seedingTaskStatusLabel(next)}
              </Button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          >
            <ArrowLeft className="w-4 h-4" /> Trước
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentIndex >= tasks.length - 1}
            onClick={() => setCurrentIndex((i) => Math.min(tasks.length - 1, i + 1))}
          >
            Tiếp theo <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </Card>

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
              <Button onClick={confirmPendingChange} isLoading={isUpdating}>
                Xác nhận {seedingTaskStatusLabel(pendingChange.status)}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
