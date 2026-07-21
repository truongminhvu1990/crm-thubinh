"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/production-readiness", label: "Tổng quan", exact: true },
  { href: "/settings/production-readiness/environments", label: "Môi trường" },
  { href: "/settings/production-readiness/deployments", label: "Triển khai" },
  { href: "/settings/production-readiness/backups", label: "Sao lưu & Khôi phục" },
  { href: "/settings/production-readiness/monitoring", label: "Sức khỏe & Giám sát" },
  { href: "/settings/production-readiness/audit", label: "Nhật ký" },
  { href: "/settings/production-readiness/release", label: "Sẵn sàng phát hành" },
  { href: "/settings/production-readiness/incidents", label: "Sự cố", disabled: true },
  { href: "/settings/production-readiness/access", label: "Quyền truy cập" },
  { href: "/settings/production-readiness/mobile-readiness", label: "Di động" },
];

/** PRODUCTION_READINESS_UI.md §17 - tab strip grouping the Ops Console's
 * screens, same horizontally-scrollable pill pattern as Permission
 * Center's PermissionTabs. Incident Overview (Decision 33) renders
 * disabled with a "Sắp có" chip - the same convention `Sidebar.tsx` already
 * uses for not-yet-built nav entries, not a new pattern. */
export default function OpsConsoleTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-6 -mx-1 overflow-x-auto">
      <nav className="flex gap-1 px-1 min-w-max">
        {TABS.map((tab) => {
          if (tab.disabled) {
            return (
              <span
                key={tab.href}
                className="px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap text-muted-foreground/40 cursor-not-allowed flex items-center gap-1.5"
                title="Sắp ra mắt"
              >
                {tab.label}
                <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">Sắp có</span>
              </span>
            );
          }

          const active = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
