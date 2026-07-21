"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Key, Users, UsersRound, History } from "lucide-react";
import { PermissionDashboardKpis } from "@/lib/permission/permissionCenter.service";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import PermissionTabs from "@/components/permission/PermissionTabs";
import StatCard from "@/components/ui/StatCard";

/** Permission Dashboard (Decision 16, PERMISSION_UI.md §18) - the
 * section's default landing tab. Five KPIs, each a simple aggregate. */
export default function PermissionDashboardPage() {
  const [kpis, setKpis] = useState<PermissionDashboardKpis | null>(null);

  useEffect(() => {
    permissionApi.getDashboardKpis().then(setKpis);
  }, []);

  return (
    <div className="pb-8">
      <Link href="/settings" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Cài đặt
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2 mb-1.5">
        <ShieldCheck className="w-6 h-6 text-primary" />
        Phân quyền
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">Tổng quan hệ thống vai trò &amp; quyền</p>

      <PermissionTabs />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link href="/settings/permissions/roles">
          <StatCard title="Tổng số vai trò" value={kpis?.totalRoles ?? "—"} icon={<ShieldCheck className="w-5 h-5" />} placeholder={!kpis} />
        </Link>
        <Link href="/settings/permissions/matrix">
          <StatCard title="Tổng số quyền" value={kpis?.totalPermissions ?? "—"} icon={<Key className="w-5 h-5" />} placeholder={!kpis} />
        </Link>
        <Link href="/settings/staff">
          <StatCard
            title="Nhân viên đã gán vai trò"
            value={kpis ? `${kpis.assignedUsers} / ${kpis.totalStaff}` : "—"}
            icon={<Users className="w-5 h-5" />}
            placeholder={!kpis}
            hint="Đã di chuyển sang mô hình vai trò động"
          />
        </Link>
        <Link href="/settings/permissions/teams">
          <StatCard title="Tổng số nhóm" value={kpis?.totalTeams ?? "—"} icon={<UsersRound className="w-5 h-5" />} placeholder={!kpis} />
        </Link>
        <Link href="/settings/permissions/audit">
          <StatCard title="Thay đổi (30 ngày)" value={kpis?.permissionChanges30Days ?? "—"} icon={<History className="w-5 h-5" />} placeholder={!kpis} />
        </Link>
      </div>
    </div>
  );
}
