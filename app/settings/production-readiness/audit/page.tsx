"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ActivityLog } from "@/types/activityLog";
import { formatRelativeTime } from "@/lib/utils";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";

/** Audit Overview (PRODUCTION_READINESS_UI.md §10) - real data, reading
 * every entity in activity_logs (not just Permission Center's 4 entity
 * types, which stay on Permission Center's own narrower Audit History
 * page, PERMISSION_UI.md §9). Customers/Products/Batches/Settings/Product
 * Images still write directly client→Supabase with no chokepoint, so this
 * total necessarily undercounts real system activity - stated on the
 * page, not hidden. */
export default function AuditOverviewPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("activity_logs")
      .select("*, staff:staff(full_name, staff_code)")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (error) console.error("Error fetching activity_logs:", error);
        setLogs((data as ActivityLog[]) || []);
        setIsLoading(false);
      });
  }, []);

  const byEntity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs) counts.set(log.entity, (counts.get(log.entity) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Nhật ký hoạt động</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Tổng hợp toàn bộ <code className="font-mono text-xs">activity_logs</code> — rộng hơn Lịch sử thay đổi của riêng
        Phân quyền
      </p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="Tổng số sự kiện (300 gần nhất)" value={logs.length} icon={<span>📋</span>} />
            {byEntity.slice(0, 3).map(([entity, count]) => (
              <StatCard key={entity} title={entity} value={count} icon={<span>🔹</span>} />
            ))}
          </div>

          <Card className="mb-6">
            <p className="text-xs text-muted-foreground">
              Customers, Products, Batches, Settings và Product Images vẫn ghi trực tiếp từ trình duyệt vào Supabase, không
              qua điểm chặn phía máy chủ — nên tổng số này <strong>chưa</strong> phản ánh đầy đủ toàn bộ hoạt động hệ thống
              (PRODUCTION_READINESS_SPEC.md §17).
            </p>
          </Card>

          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Hoạt động gần đây</h2>
            <Link href="/settings/permissions/audit" className="text-sm text-primary hover:underline">
              Xem Lịch sử Phân quyền →
            </Link>
          </div>
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {logs.slice(0, 50).map((log) => (
              <div key={log.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{log.staff?.full_name || "—"}</span> — {log.action}{" "}
                  <span className="font-mono text-xs text-muted-foreground">[{log.entity}]</span>
                </p>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelativeTime(log.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
