"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Gem,
  Package,
  Boxes,
  ReceiptText,
  Wallet,
  TrendingUp,
  BookOpen,
  Settings,
  CalendarClock,
  Percent,
  ScrollText,
  ShieldCheck,
  Megaphone,
  Filter,
  Cake,
  Zap,
  Radio,
  Gift,
  Ticket,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFollowUpSummaryCounts } from "@/lib/customer.service";
import SidebarGroup, { SidebarLeaf } from "@/components/shared/SidebarGroup";

interface NavLeaf extends SidebarLeaf {
  children?: undefined;
}

interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  children: SidebarLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry && Array.isArray(entry.children);
}

const LINKS: NavEntry[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", enabled: true },
  { href: "/customers", icon: Users, label: "Khách hàng", enabled: true },
  { href: "/follow-up", icon: CalendarClock, label: "Follow-up Center", enabled: true },
  { href: "/products", icon: Gem, label: "Sản phẩm", enabled: true },
  { href: "/batches", icon: Package, label: "Lô hàng", enabled: true },
  { href: "/inventory", icon: Boxes, label: "Tồn kho", enabled: true },
  { href: "/orders", icon: ReceiptText, label: "Đơn hàng", enabled: true },
  { href: "/reports", icon: Wallet, label: "Báo cáo", enabled: true },
  { href: "/reports/sales-ledger", icon: ScrollText, label: "Sổ bán hàng", enabled: true },
  { href: "/data-verification", icon: ShieldCheck, label: "Xác minh dữ liệu", enabled: true },
  { href: "/commissions", icon: Percent, label: "Hoa hồng", enabled: true },
  { href: "/market-intelligence", icon: TrendingUp, label: "Thị trường", enabled: true },
  {
    label: "Marketing",
    icon: Megaphone,
    children: [
      { href: "/marketing", icon: LayoutDashboard, label: "Dashboard", enabled: true },
      { href: "/marketing/segments", icon: Filter, label: "Customer Segments", enabled: true },
      { href: "/marketing/campaigns", icon: Megaphone, label: "Campaigns", enabled: true },
      { href: "/marketing/birthdays", icon: Cake, label: "Birthday Center", enabled: true },
      { href: "/marketing/automation", icon: Zap, label: "Automation", enabled: true },
      { href: "/marketing/broadcast", icon: Radio, label: "Broadcast", enabled: true },
      { href: "/marketing/loyalty", icon: Gift, label: "Loyalty", enabled: true },
      { href: "/marketing/voucher", icon: Ticket, label: "Voucher", enabled: true },
    ],
  },
  { href: "/knowledge-vault", icon: BookOpen, label: "Kho kiến thức", enabled: true },
  { href: "/settings", icon: Settings, label: "Cài đặt", enabled: true },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname();
  const [overdueCount, setOverdueCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Auto-expand a group on first render if the current route is one of
    // its children (e.g. landing directly on /marketing/campaigns).
    const initial = new Set<string>();
    for (const entry of LINKS) {
      if (isGroup(entry) && entry.children.some((c) => pathname?.startsWith(c.href))) {
        initial.add(entry.label);
      }
    }
    return initial;
  });

  function toggleGroup(label: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // Refetch whenever the route changes so the badge stays reasonably fresh
  // after completing/rescheduling follow-ups on /follow-up or a customer's
  // detail page (this component persists across navigation in AppShell).
  useEffect(() => {
    let cancelled = false;
    getFollowUpSummaryCounts().then((counts) => {
      if (!cancelled) setOverdueCount(counts.overdue);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden touch-manipulation"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground",
          "flex flex-col p-5 transition-transform duration-200 ease-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between mb-8 px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Gem className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <p className="font-semibold text-sidebar-foreground">Cẩm Thạch</p>
              <p className="text-xs text-sidebar-foreground/60">Thu Bình CRM</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground p-1 touch-manipulation"
            aria-label="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="space-y-0.5 flex-1 overflow-y-auto">
          {LINKS.map((entry) => {
            if (isGroup(entry)) {
              return (
                <SidebarGroup
                  key={entry.label}
                  label={entry.label}
                  icon={entry.icon}
                  items={entry.children}
                  expanded={expandedGroups.has(entry.label)}
                  onToggle={() => toggleGroup(entry.label)}
                  activeHref={pathname}
                  onNavigate={onClose}
                />
              );
            }

            const { href, icon: Icon, label, enabled } = entry;
            const active = pathname?.startsWith(href);

            if (!enabled) {
              return (
                <div
                  key={href}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/35 cursor-not-allowed text-sm"
                  title="Sắp ra mắt"
                >
                  <span className="flex items-center gap-3">
                    <Icon size={18} strokeWidth={1.75} />
                    {label}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide bg-white/5 px-1.5 py-0.5 rounded">
                    Sắp có
                  </span>
                </div>
              );
            }

            const showOverdueBadge = href === "/follow-up" && overdueCount > 0;

            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 touch-manipulation",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} strokeWidth={1.75} />
                  {label}
                </span>
                {showOverdueBadge && (
                  <span
                    className={cn(
                      "text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                      active ? "bg-white/20 text-primary-foreground" : "bg-destructive/90 text-white"
                    )}
                  >
                    {overdueCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="pt-4 mt-4 border-t border-white/10 px-1">
          <p className="text-[11px] text-sidebar-foreground/40">CRM Cẩm Thạch Thu Bình © 2026</p>
        </div>
      </aside>
    </>
  );
}
