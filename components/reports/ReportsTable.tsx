"use client";

import { ReactNode, useMemo, useState } from "react";
import { Download } from "lucide-react";
import Card from "@/components/ui/Card";
import SearchInput from "@/components/ui/SearchInput";

export interface ReportsTableRow {
  key: string;
  searchLabel: string;
  cells: (string | number | ReactNode)[];
}

interface Props {
  icon: ReactNode;
  title: string;
  headers: string[];
  rows: ReportsTableRow[];
  emptyLabel: string;
  searchPlaceholder: string;
  dateFilter?: ReactNode;
}

/**
 * Shared table shell for every report in this module: search (client-side
 * row filter, REPORTS_UI.md §1.3) + optional Date Filter slot (only passed
 * for the 5 reports REPORTS_SPEC.md §4 names) + a disabled "Coming Soon"
 * Export button (REPORTS_UI.md Decision 4) - identical on all 13 reports.
 */
export default function ReportsTable({ icon, title, headers, rows, emptyLabel, searchPlaceholder, dateFilter }: Props) {
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.searchLabel.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <Card>
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-56">
            <SearchInput
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch("")}
            />
          </div>
          {dateFilter}
          <button
            type="button"
            disabled
            title="Coming Soon"
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Coming Soon
          </button>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                {headers.map((h, i) => (
                  <th key={h} className={`font-semibold px-2 py-2 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  {row.cells.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`px-2 py-2.5 ${
                        cellIndex === 0 ? "font-medium text-foreground" : "text-right text-muted-foreground"
                      }`}
                    >
                      {cell}
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
