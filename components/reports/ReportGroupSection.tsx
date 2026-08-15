"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
  /** Product Owner Decision (2026-08-12): every group starts CLOSED - the
   * user opens only the category they need. Each ReportGroupSection owns
   * its own independent `expanded` state (below), so opening one never
   * affects any other - no "only one open at a time" accordion behavior,
   * since nothing like that exists elsewhere in this app's design system
   * (components/shared/SidebarGroup.tsx's groups are independent too). */
  defaultExpanded?: boolean;
}

/** Collapsible report-group container for the Reporting page. Same
 * plain-local-boolean expand/collapse convention already established by
 * components/shared/SidebarGroup.tsx (this codebase has no accordion
 * library) - reused here for the main content area instead of the sidebar. */
export default function ReportGroupSection({ title, description, icon: Icon, children, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className="bg-card border border-border rounded-xl shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon className="w-5 h-5 text-primary shrink-0" />
          <span className="min-w-0">
            <span className="block text-base font-semibold text-foreground">{title}</span>
            {description && <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>}
          </span>
        </span>
        <ChevronDown
          className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-150", expanded ? "rotate-180" : "")}
        />
      </button>

      {expanded && <div className="px-4 sm:px-5 pb-5 space-y-8">{children}</div>}
    </section>
  );
}
