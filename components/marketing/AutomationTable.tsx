"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { MarketingAutomation, AutomationStatus } from "@/types/marketingAutomation";
import AutomationStatusBadge from "./AutomationStatusBadge";
import AutomationTypeBadge from "./AutomationTypeBadge";
import AutomationRunStatusBadge from "./AutomationRunStatusBadge";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { getValidNextStatuses, estimateNextRun } from "@/lib/marketing/automation.service";
import { AUTOMATION_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import { formatRelativeTime } from "@/lib/utils";

type Row = MarketingAutomation & { lastRun?: import("@/types/marketingAutomation").MarketingAutomationRun | null };

interface Props {
  automations: Row[];
  isLoading?: boolean;
  onStatusChange: (automation: Row, next: AutomationStatus) => void;
  onBulkStatusChange: (automations: Row[], next: AutomationStatus) => void;
}

/** Row-selection + bulk-action toolbar - genuinely new pattern in this
 * codebase (MARKETING_AUTOMATION_UI.md §3.2/§4/§8), designed narrowly:
 * bulk actions strictly reuse the same single-row lifecycle rule, not a
 * general-purpose primitive. */
export default function AutomationTable({ automations, isLoading = false, onStatusChange, onBulkStatusChange }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleAll() {
    if (selected.size === automations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(automations.map((a) => a.id!)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedAutomations = automations.filter((a) => selected.has(a.id!));

  function applyBulk(next: AutomationStatus) {
    onBulkStatusChange(selectedAutomations, next);
    setSelected(new Set());
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (automations.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Zap className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có automation nào</p>
      </div>
    );
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20 flex-wrap">
          <span className="text-sm text-foreground font-medium">{selected.size} đã chọn</span>
          <Button size="sm" variant="secondary" onClick={() => applyBulk("Active")}>Kích hoạt</Button>
          <Button size="sm" variant="secondary" onClick={() => applyBulk("Paused")}>Tạm dừng</Button>
          <Button size="sm" variant="secondary" onClick={() => applyBulk("Cancelled")}>Hủy</Button>
          <button className="text-xs text-muted-foreground hover:text-foreground ml-auto" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3.5 w-10">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả trên trang này"
                  checked={selected.size === automations.length && automations.length > 0}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tên</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mẫu</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tần suất</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lần chạy gần nhất</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lần chạy dự kiến</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phiên bản</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"></th>
            </tr>
          </thead>
          <tbody>
            {automations.map((automation) => {
              const nextOptions = getValidNextStatuses(automation.status);
              const nextRun = estimateNextRun(automation, automation.lastRun);
              return (
                <tr key={automation.id} className="border-b border-border last:border-0 hover:bg-muted/30 group">
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${automation.name}`}
                      checked={selected.has(automation.id!)}
                      onChange={() => toggleOne(automation.id!)}
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <Link href={`/marketing/automation/${automation.id}`} className="font-medium text-foreground hover:text-primary">
                      {automation.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5"><AutomationTypeBadge type={automation.automation_type} /></td>
                  <td className="px-5 py-3.5"><AutomationStatusBadge status={automation.status} /></td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{automation.frequency}</td>
                  <td className="px-5 py-3.5 text-sm">
                    {automation.lastRun ? (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{formatRelativeTime(automation.lastRun.started_at!)}</span>
                        <AutomationRunStatusBadge status={automation.lastRun.status} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Chưa chạy</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">
                    {nextRun ? `Dự kiến ${formatRelativeTime(nextRun)}` : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">v{automation.version}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/marketing/automation/${automation.id}/edit`}
                        className="text-xs text-muted-foreground hover:text-primary"
                        aria-disabled={automation.status === "Completed" || automation.status === "Cancelled"}
                      >
                        Sửa
                      </Link>
                      {nextOptions.length > 0 && (
                        <Select
                          options={AUTOMATION_STATUS_OPTIONS.filter((o) => nextOptions.includes(o.value))}
                          placeholder="Đổi trạng thái"
                          className="text-xs py-1"
                          onChange={(e) => e.target.value && onStatusChange(automation, e.target.value as AutomationStatus)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
