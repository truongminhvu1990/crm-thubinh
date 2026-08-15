"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import Button from "@/components/ui/Button";

export interface ColumnPickerOption<K extends string> {
  key: K;
  label: string;
}

interface Props<K extends string> {
  testId: string;
  /** Only currently-available columns (already filtered by the caller's own
   * getAvailable*Columns) - the picker never offers a column the viewer
   * isn't otherwise permitted to see, so toggling can't bypass an existing
   * permission or mode gate. */
  columns: ColumnPickerOption<K>[];
  visibleKeys: Set<K>;
  onChange: (visible: Set<K>) => void;
}

/** Generic "Cột hiển thị" (Customize Columns) dropdown - pure presentation,
 * no report-specific business meaning. Shared UI infrastructure reused by
 * every report's own column picker (Sales Ledger, Monthly Sold Products);
 * each report keeps its own column *definitions* and visibility state
 * entirely separate (Task 5: reuse generic UI, never merge report
 * schemas) - this component only ever sees whatever key/label list and
 * Set its caller passes in. Toggling a column here never touches a query,
 * filter, sort, or calculation - only which columns the caller's own
 * table/export currently include. */
export default function ColumnPicker<K extends string>({ testId, columns, visibleKeys, onChange }: Props<K>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(key: K) {
    const next = new Set(visibleKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        data-testid={testId}
        variant="secondary"
        size="md"
        onClick={() => setOpen((v) => !v)}
        title="Tùy chỉnh cột hiển thị"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Cột hiển thị
      </Button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 max-h-80 overflow-auto rounded-lg border border-input bg-card shadow-lg p-2">
          {columns.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted cursor-pointer"
            >
              <input type="checkbox" checked={visibleKeys.has(c.key)} onChange={() => toggle(c.key)} className="accent-primary" />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
