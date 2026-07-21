"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";

// Shared table shell for the Reports BI Center's analysis sections
// (Product/Category/Customer/Staff) - every row is a Feature 8 drill-down
// link into Sales Ledger, same click-to-navigate pattern already used by
// SalesLedgerTable's own rows.

export interface AnalysisColumn<T> {
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

interface Props<T> {
  icon: ReactNode;
  title: string;
  columns: AnalysisColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref: (row: T) => string;
  emptyLabel: string;
  actions?: ReactNode;
  isLoading?: boolean;
}

export default function AnalysisTable<T,>({
  icon,
  title,
  columns,
  rows,
  rowKey,
  rowHref,
  emptyLabel,
  actions,
  isLoading = false,
}: Props<T>) {
  const router = useRouter();

  return (
    <Card>
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {actions}
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className={`font-semibold px-2 py-2 ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={() => router.push(rowHref(row))}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {columns.map((c, i) => (
                    <td
                      key={i}
                      className={`px-2 py-2.5 ${i === 0 ? "font-medium text-foreground" : "text-muted-foreground"} ${
                        c.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
