"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ImageOff, ExternalLink, Copy, CheckCircle2, ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { SeedingTaskWithContext, SeedingTaskStatus, SEEDING_TASK_ALLOWED_TRANSITIONS } from "@/types/seeding";
import { seedingTaskStatusLabel, seedingTaskActionTypeLabel } from "@/lib/seeding/seeding.constants";
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

export default function SeedingTaskRunnerPage() {
  const [tasks, setTasks] = useState<SeedingTaskWithContext[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pendingChange, setPendingChange] = useState<{ taskId: string; status: SeedingTaskStatus } | null>(null);
  const [reasonInput, setReasonInput] = useState("");

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
        // Fixed, stable order for this session — only the eligible
        // (actionable) tasks, so "Task X / Total" stays meaningful and
        // never counts already-resolved or closed-campaign tasks.
        setTasks(all.filter(isEligible));
        setCurrentIndex(0);
      } catch (error) {
        console.error("Failed to load task runner queue:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const currentTask = tasks[currentIndex];

  async function submitStatus(taskId: string, status: SeedingTaskStatus, resultNote?: string) {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/seeding/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, result_note: resultNote ?? null }),
      });
      if (!res.ok) throw new Error(await res.text());
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
    }
  }

  async function handleCopyAndOpen() {
    await handleCopyComment();
    if (currentTask?.target_permalink_url) window.open(currentTask.target_permalink_url, "_blank", "noopener,noreferrer");
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
    return (
      <div className="p-6 max-w-xl mx-auto space-y-3">
        <Card className="text-center py-10 space-y-3">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
          <p className="text-sm text-foreground">Không có task nào cần thực hiện lúc này.</p>
          <Link href="/facebook-tools/semi-seeding/my-tasks" className="text-sm text-primary hover:underline">
            Quay lại Công việc của tôi
          </Link>
        </Card>
      </div>
    );
  }

  const allResolved = tasks.every((t) => !isEligible(t));
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

        <div className="grid grid-cols-2 gap-2 mb-4">
          {task.action_type === "Comment" && task.comment_text && (
            <Button variant="secondary" onClick={handleCopyComment}>
              <Copy className="w-4 h-4" /> {copyFeedback ? "Đã copy!" : "Copy comment"}
            </Button>
          )}
          {task.target_permalink_url ? (
            <Button
              variant="secondary"
              onClick={() => (task.action_type === "Comment" ? handleCopyAndOpen() : window.open(task.target_permalink_url!, "_blank", "noopener,noreferrer"))}
            >
              <ExternalLink className="w-4 h-4" /> {task.action_type === "Comment" ? "Copy & Mở Facebook" : "Mở Facebook"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground self-center">Không có permalink</span>
          )}
        </div>

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
