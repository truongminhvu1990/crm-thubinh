"use client";

import { cn } from "@/lib/utils";

// Phase 1.5A - placeholders for a region that is loading. Every placeholder carries `data-skeleton`, which is how tests
// (and the browser UAT) tell "this region is still loading" apart from "this region has data". A region whose data
// belongs to a NEW period always shows a placeholder - never the previous period's numbers.

export function SkeletonBlock({ className }: { className?: string }) {
  return <div data-skeleton aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Same footprint as OverviewMetricCard so the page does not jump when the numbers arrive. */
export function SkeletonCard({ title }: { title?: string }) {
  return (
    <div data-skeleton role="status" aria-label={title ? `Đang tải: ${title}` : "Đang tải"} className="rounded-xl border border-border bg-card p-5 shadow-sm">
      {title ? <p className="text-sm text-muted-foreground">{title}</p> : <SkeletonBlock className="h-4 w-32" />}
      <SkeletonBlock className="mt-3 h-8 w-40" />
      <SkeletonBlock className="mt-3 h-3 w-48" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div data-skeleton role="status" aria-label="Đang tải bảng dữ liệu" className="rounded-xl border border-border bg-card p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="mb-3 flex gap-3 last:mb-0">
          {Array.from({ length: columns }).map((__, c) => (
            <SkeletonBlock key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
