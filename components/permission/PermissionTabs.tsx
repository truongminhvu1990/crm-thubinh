"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/permissions", label: "Tổng quan", exact: true },
  { href: "/settings/permissions/roles", label: "Vai trò" },
  { href: "/settings/permissions/matrix", label: "Ma trận quyền" },
  { href: "/settings/permissions/data-scope-matrix", label: "Ma trận phạm vi" },
  { href: "/settings/permissions/sensitive-fields", label: "Trường nhạy cảm" },
  { href: "/settings/permissions/teams", label: "Nhóm" },
  { href: "/settings/permissions/audit", label: "Lịch sử" },
];

/** PERMISSION_UI.md §1 - in-page tab strip, "Dashboard first" convention
 * matching Marketing's nav group. Horizontally-scrollable pill row on
 * mobile (§14). */
export default function PermissionTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-6 -mx-1 overflow-x-auto">
      <nav className="flex gap-1 px-1 min-w-max">
        {TABS.map((tab) => {
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
