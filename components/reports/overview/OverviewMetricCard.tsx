"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  /** The card whose detail is currently open. */
  active?: boolean;
  onSelect?: () => void;
  testId?: string;
}

/** One Overview metric. Clicking it opens that metric's drill-down; the card
 * shows the Overview number, the detail then must show the same total. */
export default function OverviewMetricCard({ title, value, hint, icon, active = false, onSelect, testId }: Props) {
  const body = (
    <div className="flex items-start justify-between gap-3 text-left">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-bold text-foreground break-words">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0 rounded-lg bg-primary/10 p-3 text-primary">{icon}</div>
    </div>
  );
  const cls = cn(
    "w-full rounded-xl border bg-card p-5 shadow-sm transition-colors",
    active ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
  );
  if (!onSelect) {
    return (
      <div className={cls} data-testid={testId}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={cls} onClick={onSelect} aria-pressed={active} data-testid={testId}>
      {body}
    </button>
  );
}
