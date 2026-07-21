"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { MarketingAutomationRun } from "@/types/marketingAutomation";
import AutomationRunStatusBadge from "./AutomationRunStatusBadge";
import { formatRelativeTime } from "@/lib/utils";
import ExecutionLogModal from "./ExecutionLogModal";

interface Props {
  runs: MarketingAutomationRun[];
  isLoading?: boolean;
  /** Shown as an extra column when displaying runs across multiple
   * automations (Broadcast page's Execution History, §3.6). */
  showAutomationColumn?: boolean;
  onRetried?: () => void;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Run History table (§3.5) - reused as-is inside Automation Detail and the
 * Broadcast page's Execution History. Row click opens the Execution Log
 * Modal only once the run has finished. */
export default function RunHistoryTable({ runs, isLoading = false, showAutomationColumn = false, onRetried }: Props) {
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="bg-card rounded-xl p-8 text-center border border-border">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
          <History className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có lần chạy nào</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-border">
              {showAutomationColumn && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Automation</th>}
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bắt đầu</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kết thúc</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Thời gian</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lỗi</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kích hoạt bởi</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const finished = run.status !== "Pending" && run.status !== "Running";
              return (
                <tr
                  key={run.id}
                  className={`border-b border-border last:border-0 ${finished ? "hover:bg-muted/30 cursor-pointer" : ""}`}
                  onClick={() => finished && setOpenRunId(run.id!)}
                >
                  {showAutomationColumn && <td className="px-4 py-3 text-sm text-foreground">{run.automation?.name || "—"}</td>}
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatRelativeTime(run.started_at!)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{run.finished_at ? formatRelativeTime(run.finished_at) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDuration(run.duration_ms)}</td>
                  <td className="px-4 py-3"><AutomationRunStatusBadge status={run.status} /></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate" title={run.error_message || ""}>
                    {run.error_message || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{run.triggered_by}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openRunId && (
        <ExecutionLogModal
          runId={openRunId}
          onClose={() => setOpenRunId(null)}
          onRetried={() => {
            setOpenRunId(null);
            onRetried?.();
          }}
        />
      )}
    </>
  );
}
