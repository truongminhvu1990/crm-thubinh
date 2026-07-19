import { ReactNode } from "react";
import Card from "@/components/ui/Card";
import { RankingRow } from "@/lib/marketIntelligence/marketIntelligence.service";

interface Props {
  icon: ReactNode;
  title: string;
  labelHeader: string;
  valueHeader: string;
  rows: RankingRow[];
  emptyLabel: string;
  formatValue?: (value: number) => string;
}

/**
 * All Time only, no search, no export, no date filter - Category/Color/Size
 * Rankings carry no time dimension or write affordance at all
 * (MARKET_INTELLIGENCE_UI.md §1.4-1.6, Decision 2).
 */
export default function RankingTable({ icon, title, labelHeader, valueHeader, rows, emptyLabel, formatValue }: Props) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
        {icon}
        {title}
      </h3>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="font-semibold px-2 py-2 text-left">{labelHeader}</th>
                <th className="font-semibold px-2 py-2 text-right">{valueHeader}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <td className="px-2 py-2.5 font-medium text-foreground">{row.label}</td>
                  <td className="px-2 py-2.5 text-right text-muted-foreground">
                    {formatValue ? formatValue(row.value) : row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
