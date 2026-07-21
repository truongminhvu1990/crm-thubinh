"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Gauge } from "lucide-react";
import { opsApi } from "@/lib/opsConsole/opsConsoleApi";
import { computeDimensionStatuses, computeReadinessScore, DimensionStatus, ReadinessScore } from "@/lib/opsConsole/opsConsole.service";
import { ActivityLog } from "@/types/activityLog";
import { formatRelativeTime } from "@/lib/utils";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

const STATUS_BADGE: Record<DimensionStatus["status"], { label: string; variant: "destructive" | "warning" | "success" | "muted" }> = {
  red: { label: "Red", variant: "destructive" },
  amber: { label: "Amber", variant: "warning" },
  green: { label: "Green", variant: "success" },
  unknown: { label: "Unknown", variant: "muted" },
};

const DIMENSION_LABEL_VI: Record<string, string> = {
  Functional: "Chức năng",
  Security: "Bảo mật",
  Backup: "Sao lưu",
  Recovery: "Khôi phục",
  Monitoring: "Giám sát",
  Performance: "Hiệu năng",
  Deployment: "Triển khai",
  UAT: "UAT",
};

/** Production Dashboard (PRODUCTION_READINESS_UI.md §1) - landing page.
 * Every tile/score below reads the Release Checklist (§12) - no
 * independently-invented health judgment anywhere on this page. */
export default function ProductionReadinessDashboardPage() {
  const [dimensions, setDimensions] = useState<DimensionStatus[]>([]);
  const [score, setScore] = useState<ReadinessScore | null>(null);
  const [approved, setApproved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([opsApi.getChecklistState(), opsApi.getGoLiveState()]).then(([checklistRaw, goLiveRaw]) => {
      const checklistState = new Map(Object.entries(checklistRaw)) as Map<string, ActivityLog>;
      setDimensions(computeDimensionStatuses(checklistState));
      setScore(computeReadinessScore(checklistState));
      setApproved(!!goLiveRaw["production_approval"]?.action.startsWith("approved"));
      setIsLoading(false);
    });
  }, []);

  return (
    <div className="pb-8">
      <Link href="/settings" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Cài đặt
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2 mb-1.5">
        <Gauge className="w-6 h-6 text-primary" />
        Sẵn sàng vận hành
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">Ops Console — Production Readiness (Sprint v4.0.1)</p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Production Readiness Score</p>
                <p className="text-4xl font-bold text-foreground mt-1">{score?.percent ?? 0}%</p>
                {score && (
                  <p className="text-xs text-muted-foreground mt-1">Last calculated: {formatRelativeTime(score.calculatedAt)}</p>
                )}
              </div>
              <Badge variant={score?.qualifier === "ready" ? "success" : score?.qualifier === "not_ready" ? "destructive" : "warning"}>
                {score?.qualifierLabel}
              </Badge>
            </div>
            {!approved && (
              <p className="text-xs text-muted-foreground mt-3">
                Go Live chưa hoàn tất — cần Product Owner Approval (xem tab &quot;Sẵn sàng phát hành&quot;).
              </p>
            )}
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {dimensions.map((d) => {
              const badge = STATUS_BADGE[d.status];
              return (
                <Link key={d.dimension} href="/settings/production-readiness/release">
                  <Card>
                    <p className="text-sm text-muted-foreground">{DIMENSION_LABEL_VI[d.dimension] || d.dimension}</p>
                    <div className="mt-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
