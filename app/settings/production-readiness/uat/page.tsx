"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ActivityLog } from "@/types/activityLog";
import { opsApi } from "@/lib/opsConsole/opsConsoleApi";
import { UAT_ROLES, uatItemsForRole } from "@/lib/opsConsole/opsConsole.constants";
import { formatRelativeTime } from "@/lib/utils";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";

/** UAT Progress (PRODUCTION_READINESS_UI.md §11 / Spec §14.1) - checklist
 * per role, reusing activity_logs (entity="uat", Decision 36). Read §9's own
 * caveat: this verifies the Permission Center's own access boundary and
 * that every role still has full application access elsewhere - it does
 * not mean role-based restriction exists app-wide. */
export default function UatProgressPage() {
  const [state, setState] = useState<Record<string, ActivityLog>>({});
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    setState(await opsApi.getUatState());
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggle(role: string, itemKey: string, verified: boolean) {
    await opsApi.markUatItem(role, itemKey, verified);
    await load();
  }

  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">UAT theo vai trò</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Xác minh ranh giới truy cập của Phân quyền — không xác nhận hạn chế theo vai trò ở các module khác (chưa triển khai)
      </p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : (
        <div className="space-y-4">
          {UAT_ROLES.map((role) => {
            const items = uatItemsForRole(role);
            return (
              <Card key={role}>
                <p className="font-semibold text-foreground mb-3">{role}</p>
                <div className="space-y-2">
                  {items.map((item) => {
                    const key = `${role}:${item.key}`;
                    const log = state[key];
                    const verified = !!log?.action.startsWith("verified");
                    return (
                      <label key={item.key} className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-4 h-4 accent-primary"
                          checked={verified}
                          onChange={(e) => handleToggle(role, item.key, e.target.checked)}
                        />
                        <div>
                          <span className="text-sm text-foreground">{item.label}</span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
