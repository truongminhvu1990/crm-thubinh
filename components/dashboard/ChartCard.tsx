"use client";

import type { ReactNode } from "react";
import { SkeletonBlock } from "@/components/reports/overview/Skeleton";

// Dashboard Wave B: the frame every new chart sits in - heading, a one-line basis note, and the four states a chart can be in. A region
// that is loading shows a placeholder (never the previous period's bars), a failed read shows an alert (never an empty chart), and a
// period with nothing shows the standard empty text.

interface Props {
  title: string;
  /** Short basis note under the title, e.g. "Theo ngày bán · Doanh thu đã ghi nhận". */
  basis?: string;
  testId: string;
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  /** Extra classes for the outer section (grid spans). */
  className?: string;
  children: ReactNode;
}

export default function ChartCard({ title, basis, testId, loading, error, empty, emptyText, className, children }: Props) {
  return (
    <section className={`rounded-xl border border-border bg-card p-4 shadow-sm ${className ?? ""}`} data-testid={testId} aria-label={title}>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {basis && <p className="mt-0.5 text-xs text-muted-foreground" data-testid={`${testId}-basis`}>{basis}</p>}
      {loading ? (
        <SkeletonBlock className="mt-3 h-56 w-full" />
      ) : error ? (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid={`${testId}-error`}>{error}</p>
      ) : empty ? (
        <p className="mt-3 py-10 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{emptyText}</p>
      ) : (
        children
      )}
    </section>
  );
}
