"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SearchToolbarProps {
  /** The SearchInput (or other search control) for this toolbar. */
  search: ReactNode;
  /** Filter selects/inputs/buttons rendered next to the search box. */
  children?: ReactNode;
  /** Breakpoint at which search and filters sit side-by-side instead of stacking. */
  breakpoint?: "sm" | "lg";
  className?: string;
}

/**
 * Single source of truth for the search+filters toolbar row. The search box
 * must never be allowed to shrink to 0 when filters overflow - previously
 * every page re-implemented `flex-1 min-w-[Npx]` by hand, and pages that
 * used bare `min-w-0` (or omitted a floor entirely) collapsed the search
 * box to icon-width once enough filters were added.
 */
export default function SearchToolbar({
  search,
  children,
  breakpoint = "lg",
  className,
}: SearchToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        breakpoint === "sm" ? "sm:flex-row" : "lg:flex-row",
        className
      )}
    >
      <div className="flex-1 min-w-[240px]">{search}</div>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}
