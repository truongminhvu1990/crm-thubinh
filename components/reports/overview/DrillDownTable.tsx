"use client";

import { ReactNode } from "react";

export interface DrillColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
}

interface Props<T> {
  columns: DrillColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyLabel?: string;
  testId?: string;
}

/** Plain read-only detail table. Rows are rendered exactly as the canonical
 * API returned them; nothing is recomputed here. */
export default function DrillDownTable<T>({ columns, rows, rowKey, emptyLabel = "Không có dữ liệu", testId }: Props<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card" data-testid={testId}>
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-t border-border">
                {columns.map((c) => (
                  <td key={c.header} className={`px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
