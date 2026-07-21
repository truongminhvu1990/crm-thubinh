"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ActivityLog } from "@/types/activityLog";
import { Role } from "@/types/permissionCenter";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import { formatRelativeTime } from "@/lib/utils";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_OPTIONS } from "@/lib/permission/permissionCenter.constants";
import PermissionTabs from "@/components/permission/PermissionTabs";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import SearchInput from "@/components/ui/SearchInput";

/** Audit History (PERMISSION_UI.md §9) - generalizes Staff Detail's
 * activity-feed pattern to all 4 Permission Center entity types at once,
 * read-only. Defaults to the last 30 days, matching §17's performance note. */
export default function PermissionAuditPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [entityFilter, setEntityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      const [rolesList, auditLogs] = await Promise.all([
        permissionApi.getRoles(),
        permissionApi.getAuditLogs({ entity: entityFilter || undefined, from: fromDate, to: toDate }),
      ]);
      setRoles(rolesList);
      setLogs(auditLogs);
    } catch (e) {
      console.error("Error fetching audit history:", e);
      setLogs([]);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityFilter, fromDate, toDate]);

  const roleNameById = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

  function entityLabel(log: ActivityLog): string {
    if (log.entity === "role" && log.entity_id) return roleNameById.get(log.entity_id) || log.entity_id;
    return log.entity_id || "—";
  }

  const filtered = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (log.staff?.full_name || "").toLowerCase().includes(q) || entityLabel(log).toLowerCase().includes(q);
  });

  return (
    <div className="pb-8">
      <Link href="/settings/permissions" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Lịch sử thay đổi</h1>
      <p className="text-muted-foreground mb-6 text-sm">Nhật ký thay đổi Vai trò, Quyền và Phạm vi dữ liệu</p>

      <PermissionTabs />

      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="max-w-xs flex-1 min-w-[200px]">
          <SearchInput placeholder="Tìm theo người thực hiện..." value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} />
        </div>
        <Select
          placeholder="Tất cả loại"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          options={AUDIT_ENTITY_OPTIONS}
          className="max-w-[180px]"
        />
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-input bg-card px-2 py-2 text-sm" />
          <span className="text-muted-foreground">đến</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-input bg-card px-2 py-2 text-sm" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-muted-foreground text-sm">{search.trim() ? "Không tìm thấy kết quả phù hợp" : "Chưa có lịch sử thay đổi"}</p>
        </Card>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-sm divide-y divide-border">
          {filtered.map((log) => (
            <div key={log.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">
                  <span className="font-medium">{log.staff?.full_name || "—"}</span>{" "}
                  {AUDIT_ACTION_LABELS[log.action] || log.action}{" "}
                  <span className="font-mono text-xs text-muted-foreground">{entityLabel(log)}</span>
                </p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelativeTime(log.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
