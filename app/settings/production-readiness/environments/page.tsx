"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Server } from "lucide-react";
import { ENVIRONMENTS } from "@/lib/opsConsole/opsConsole.constants";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

type HealthState = "checking" | "up" | "down";

/** Environment Status (PRODUCTION_READINESS_UI.md §2) + System Health
 * (§7) folded in, per the locked UI doc's own tab grouping. Only
 * Development/Production project identity is real (static config);
 * Staging is shown "Chưa khởi tạo" since it doesn't exist
 * (PRODUCTION_READINESS_DATABASE.md §2). Health ping wraps the existing,
 * already-unauthenticated /api/health endpoint - no new capability. */
export default function EnvironmentStatusPage() {
  const [health, setHealth] = useState<HealthState>("checking");

  // Which environment is actually running this page right now - client-
  // side /api/health can only ever reach the server currently serving it,
  // never a different environment's deployment (no cross-project ping is
  // possible without that environment's own credentials).
  const currentEnvKey = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes("oupgqelswtlvipdhvvmj")
    ? "development"
    : (process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes("ktvrgnhpdarsachxlguy")
      ? "production"
      : null;

  useEffect(() => {
    fetch("/api/health")
      .then((res) => setHealth(res.ok ? "up" : "down"))
      .catch(() => setHealth("down"));
  }, []);

  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Môi trường</h1>
      <p className="text-muted-foreground mb-6 text-sm">Trạng thái từng môi trường &amp; kiểm tra sức khỏe hệ thống</p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ENVIRONMENTS.map((env) => {
          const provisioned = env.projectRef !== null;
          return (
            <Card key={env.key} className={!provisioned ? "opacity-60" : undefined}>
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-primary" />
                <p className="font-semibold text-foreground">{env.label}</p>
              </div>
              {provisioned ? (
                <>
                  <p className="text-xs text-muted-foreground">Project: {env.projectName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{env.projectRef}</p>
                  <div className="mt-3">
                    {env.key === currentEnvKey ? (
                      <>
                        <Badge variant={health === "checking" ? "muted" : health === "up" ? "success" : "destructive"}>
                          {health === "checking" ? "Đang kiểm tra..." : health === "up" ? "Hoạt động" : "Không phản hồi"}
                        </Badge>
                        <p className="text-[11px] text-muted-foreground mt-1">Nguồn: /api/health (đây là môi trường đang chạy trang này)</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Không kiểm tra được từ trang này — cần truy cập ứng dụng đang chạy trên môi trường này trực tiếp.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa khởi tạo (Not provisioned)</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-3">
                Trạng thái migration:{" "}
                <Link href="/settings/production-readiness/deployments" className="text-primary hover:underline">
                  Xem Lịch sử triển khai &amp; Migration
                </Link>
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
