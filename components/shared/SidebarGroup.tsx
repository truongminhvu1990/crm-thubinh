"use client";

import Link from "next/link";
import { ChevronDown, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarLeaf {
  href: string;
  icon: LucideIcon;
  label: string;
  enabled: boolean;
}

interface Props {
  label: string;
  icon: LucideIcon;
  items: SidebarLeaf[];
  expanded: boolean;
  onToggle: () => void;
  activeHref: string | null;
  onNavigate: () => void;
}

/** Reusable expandable/nested Sidebar group primitive - first built for
 * Marketing (docs/MARKETING_UI.md §1, Product Owner Decision: "must be
 * reusable for Inventory, AI CRM"), so it takes generic label/icon/children
 * props rather than anything Marketing-specific. This codebase had no
 * accordion/collapsible pattern before this (confirmed: no
 * @radix-ui/react-accordion in package.json) - expand/collapse is a plain
 * local boolean, styled with the same Tailwind tokens every other Sidebar
 * row already uses. */
export default function SidebarGroup({ label, icon: Icon, items, expanded, onToggle, activeHref, onNavigate }: Props) {
  const hasActiveChild = items.some((c) => activeHref?.startsWith(c.href));

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 touch-manipulation",
          hasActiveChild
            ? "text-sidebar-foreground"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <span className="flex items-center gap-3">
          <Icon size={18} strokeWidth={1.75} />
          {label}
        </span>
        <ChevronDown size={16} className={cn("transition-transform duration-150", expanded ? "rotate-180" : "")} />
      </button>

      {expanded && (
        <div className="mt-0.5 space-y-0.5 pl-4 border-l border-white/10 ml-4">
          {items.map(({ href, icon: ChildIcon, label: childLabel, enabled }) => {
            const active = activeHref?.startsWith(href);

            if (!enabled) {
              return (
                <div
                  key={href}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/35 cursor-not-allowed text-sm"
                  title="Sắp ra mắt"
                >
                  <span className="flex items-center gap-3">
                    <ChildIcon size={16} strokeWidth={1.75} />
                    {childLabel}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide bg-white/5 px-1.5 py-0.5 rounded">Sắp có</span>
                </div>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 touch-manipulation",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <ChildIcon size={16} strokeWidth={1.75} />
                {childLabel}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
