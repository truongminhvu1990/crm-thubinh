"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { ActivityLog } from "@/types/activityLog";
import { opsApi } from "@/lib/opsConsole/opsConsoleApi";
import { RELEASE_CHECKLIST, CHECKLIST_TIER_LABEL, ChecklistTier, GO_LIVE_STAGES } from "@/lib/opsConsole/opsConsole.constants";
import { formatRelativeTime, cn } from "@/lib/utils";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const TIER_ORDER: ChecklistTier[] = ["critical", "high", "low"];
const TIER_BADGE: Record<ChecklistTier, "destructive" | "warning" | "muted"> = {
  critical: "destructive",
  high: "warning",
  low: "muted",
};

/** Release Checklist (§12, Decision 23) + Go Live Checklist (§13, Decision
 * 34 Product Owner Approval) - the single source of truth the Production
 * Dashboard's tiles/score (§1.1) read from. */
export default function ReleaseGoLiveChecklistPage() {
  const [checklistState, setChecklistState] = useState<Record<string, ActivityLog>>({});
  const [goLiveState, setGoLiveState] = useState<Record<string, ActivityLog>>({});
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    const [c, g] = await Promise.all([opsApi.getChecklistState(), opsApi.getGoLiveState()]);
    setChecklistState(c);
    setGoLiveState(g);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleItem(key: string, checked: boolean) {
    await opsApi.toggleChecklistItem(key, checked);
    await load();
  }

  async function handleSetApproval(approved: boolean) {
    await opsApi.setGoLiveApproval(approved);
    await load();
  }

  const approved = !!goLiveState["production_approval"]?.action.startsWith("approved");

  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Sẵn sàng phát hành</h1>
      <p className="text-muted-foreground mb-6 text-sm">Release Checklist &amp; Go Live Checklist</p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : (
        <>
          <h2 className="font-semibold text-foreground mb-3">Release Checklist</h2>
          <div className="space-y-4 mb-8">
            {TIER_ORDER.map((tier) => (
              <Card key={tier}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={TIER_BADGE[tier]}>{CHECKLIST_TIER_LABEL[tier]}</Badge>
                </div>
                <div className="space-y-2">
                  {RELEASE_CHECKLIST.filter((i) => i.tier === tier).map((item) => {
                    const log = checklistState[item.key];
                    const checked = log?.action === "checked";
                    return (
                      <label key={item.key} className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-4 h-4 accent-primary"
                          checked={checked}
                          onChange={(e) => handleToggleItem(item.key, e.target.checked)}
                        />
                        <div>
                          <span className="text-sm text-foreground">
                            <span className="font-mono text-xs text-muted-foreground mr-1.5">[{item.dimension}]</span>
                            {item.label}
                          </span>
                          {log && (
                            <p className="text-xs text-muted-foreground">
                              {log.staff?.full_name || "—"} · {formatRelativeTime(log.created_at)}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>

          <h2 className="font-semibold text-foreground mb-3">Go Live Checklist</h2>
          <Card className="mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0">
              {GO_LIVE_STAGES.map((stage, idx) => (
                <div key={stage.key} className="flex items-center flex-1">
                  <div
                    className={cn(
                      "flex-1 text-center py-2 px-2 rounded-lg text-xs sm:text-sm font-medium",
                      !stage.available
                        ? "bg-muted text-muted-foreground/50"
                        : stage.key === "full_rollout" && !approved
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-primary/10 text-primary"
                    )}
                    aria-disabled={!stage.available}
                  >
                    {stage.label}
                    {!stage.available && <span className="block text-[10px] mt-0.5">Chưa khả dụng</span>}
                    {stage.key === "full_rollout" && stage.available && (
                      <span className="block text-[10px] mt-0.5">{approved ? "Đã duyệt" : "Chờ duyệt"}</span>
                    )}
                  </div>
                  {idx < GO_LIVE_STAGES.length - 1 && <span className="hidden sm:block text-muted-foreground px-1">→</span>}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="font-semibold text-foreground mb-2">Product Owner Approval</p>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={approved ? "success" : "warning"}>{approved ? "Approved" : "Pending"}</Badge>
              {goLiveState["production_approval"] && (
                <span className="text-xs text-muted-foreground">
                  {goLiveState["production_approval"].staff?.full_name || "—"} ·{" "}
                  {formatRelativeTime(goLiveState["production_approval"].created_at)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 mb-3">
              Go Live chưa được xem là hoàn tất khi trạng thái này còn Pending, bất kể các hạng mục khác đã hoàn thành hay
              chưa.
            </p>
            {!approved ? (
              <Button variant="primary" size="sm" onClick={() => handleSetApproval(true)}>
                <Check className="w-4 h-4" />
                Product Owner phê duyệt
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => handleSetApproval(false)}>
                Thu hồi phê duyệt
              </Button>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
