"use client";

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
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", enabled: true },
  { href: "/customers", icon: Users, label: "Khách hàng", enabled: true },
  { href: "/products", icon: Gem, label: "Sản phẩm", enabled: true },
  { href: "/batches", icon: Package, label: "Lô hàng", enabled: true },
  { href: "/inventory", icon: Boxes, label: "Tồn kho", enabled: true },
  { href: "/orders", icon: ReceiptText, label: "Đơn hàng", enabled: true },
  { href: "/reports", icon: Wallet, label: "Báo cáo", enabled: true },
  { href: "/market-intelligence", icon: TrendingUp, label: "Thị trường", enabled: true },
  { href: "/knowledge-vault", icon: BookOpen, label: "Kho kiến thức", enabled: true },
  { href: "/settings", icon: Settings, label: "Cài đặt", enabled: true },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname();

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
          {LINKS.map(({ href, icon: Icon, label, enabled }) => {
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

            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 touch-manipulation",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon size={18} strokeWidth={1.75} />
                {label}
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
