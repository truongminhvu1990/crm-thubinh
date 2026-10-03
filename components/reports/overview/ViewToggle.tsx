"use client";

import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
  /** Visible text explaining why the option is disabled (not hover-only). */
  disabledReason?: string;
}

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  testId?: string;
}

/** Segmented toggle: [Xem theo ĐƠN] [Xem theo SẢN PHẨM], [Hàng đang giữ] [Hàng còn lại]. */
export default function ViewToggle<T extends string>({ value, options, onChange, testId }: Props<T>) {
  const reason = options.find((o) => o.disabled && o.disabledReason)?.disabledReason;
  const reasonId = testId ? `${testId}-reason` : undefined;
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
    <div role="group" data-testid={testId} className="inline-flex rounded-lg border border-border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          title={o.title}
          aria-describedby={o.disabled && o.disabledReason ? reasonId : undefined}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            o.disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
    {reason && (
      <p id={reasonId} data-testid={reasonId} className="max-w-xs text-xs text-muted-foreground sm:text-right">
        {reason}
      </p>
    )}
    </div>
  );
}
