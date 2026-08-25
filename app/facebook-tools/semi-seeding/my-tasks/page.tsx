"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ImageOff, ExternalLink, ThumbsUp, MessageCircle, Share2, ClipboardList } from "lucide-react";
import { SeedingTaskWithContext, SeedingTaskStatus, SEEDING_TASK_ALLOWED_TRANSITIONS } from "@/types/seeding";
import { seedingTaskStatusLabel, seedingTaskActionTypeLabel } from "@/lib/seeding/seeding.constants";
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
 * writes back to the CRM via the existing PATCH /api/seeding/tasks/[id]. */

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

function actionIcon(actionType: string) {
  if (actionType === "Like") return <ThumbsUp className="w-4 h-4" />;
  if (actionType === "Share") return <Share2 className="w-4 h-4" />;
  return <MessageCircle className="w-4 h-4" />;
}

export default function MySeedingTasksPage() {
  const [tasks, setTasks] = useState<SeedingTaskWithContext[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [pendingChange, setPendingChange] = useState<{ taskId: string; status: SeedingTaskStatus } | null>(null);
  const [reasonInput, setReasonInput] = useState("");

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setForbidden(false);
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
      if (!res.ok) throw new Error(await res.text());
      const updated: SeedingTaskWithContext = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
    } catch (error) {
      console.error("Failed to update my seeding task status:", error);
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
      <div className="flex items-center gap-3">
        <ClipboardList className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Công việc của tôi</h1>
          <p className="text-sm text-muted-foreground">Task seeding được giao cho bạn — tự thao tác trên Facebook, cập nhật kết quả tại đây</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : tasks.length === 0 ? (
        <Card className="text-sm text-muted-foreground text-center py-10">Bạn chưa được giao task nào.</Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const nextActions = SEEDING_TASK_ALLOWED_TRANSITIONS[task.status] ?? [];
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
                    {discoveryStatusWarning(task.target_discovery_status)}
                    {task.action_type === "Comment" && task.comment_text && (
                      <p className="text-sm text-foreground rounded-lg border border-border p-2 whitespace-pre-wrap">
                        {task.comment_text}
                      </p>
                    )}
                    {task.result_note && <p className="text-xs text-muted-foreground">Ghi chú: {task.result_note}</p>}
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t border-border">
                  {task.target_permalink_url ? (
                    <a
                      href={task.target_permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" /> Mở Facebook
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Không có permalink</span>
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
          })}
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
