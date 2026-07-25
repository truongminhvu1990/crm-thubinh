"use client";

import Link from "next/link";
import { Settings as SettingsIcon, UserCog, ShieldCheck, Gauge, Database, ChevronRight } from "lucide-react";

const TILES = [
  {
    href: "/settings/master-data",
    icon: Database,
    title: "Dữ liệu dùng chung",
    description: "Phương thức thanh toán, nguồn khách hàng, vận chuyển, ngân hàng, tags và các danh mục dùng chung khác",
  },
  {
    href: "/settings/staff",
    icon: UserCog,
    title: "Nhân viên",
    description: "Quản lý nhân viên, vai trò và phân công khách hàng",
  },
  {
    href: "/settings/permissions",
    icon: ShieldCheck,
    title: "Phân quyền",
    description: "Vai trò, quyền, phạm vi dữ liệu và trường nhạy cảm",
  },
  {
    href: "/settings/production-readiness",
    icon: Gauge,
    title: "Sẵn sàng vận hành",
    description: "Ops Console — triển khai, sao lưu, giám sát và checklist phát hành",
  },
];

export default function SettingsPage() {
  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-primary" />
          Cài đặt
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">Quản lý cấu hình và dữ liệu dùng chung của hệ thống</p>
      </div>

      <div className="space-y-3">
        {TILES.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 sm:p-5 hover:border-primary/40 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
