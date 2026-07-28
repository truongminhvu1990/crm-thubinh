"use client";

import { currency, formatPercent } from "@/lib/reports/format";
import Card from "@/components/ui/Card";

interface Props {
  /** Total Revenue - reused as-is from the main report summary, never
   * recomputed here. */
  revenue: number;
  /** Cost of Goods Sold - reused as-is from the main report summary
   * (MonthlySoldProductsSummary.cogs). `null` when the viewer can't see
   * cost-derived figures (Staff) - shown as "—", never as 0. */
  cogs: number | null;
  /** Reused as-is from ExpenseManagementSection's own already-fetched
   * expense total - never a second sum. */
  operatingExpenses: number;
  /** Same Owner/Manager-only gate as `cogs` - both are cost-derived. */
  profitLoss: number | null;
  profitMargin: number | null;
}

function Row({
  label,
  value,
  muted = false,
  valueClassName,
}: {
  label: string;
  value: string;
  muted?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={muted ? "text-sm text-muted-foreground" : "text-sm text-foreground"}>{label}</span>
      <span className={valueClassName ?? (muted ? "text-sm text-foreground" : "text-base font-semibold text-foreground")}>
        {value}
      </span>
    </div>
  );
}

/** Financial Summary panel (Product Owner Decision, 2026-07-28) - a single
 * itemized P&L-style breakdown replacing the former 3-StatCard row (Total
 * Operating Expenses / Profit-Loss / Profit Margin), now with Revenue and
 * COGS added as line items so the Net Profit/Loss figure below the divider
 * is legible on its own, without cross-referencing the report's other
 * cards. Every value here is reused from an existing calculation
 * (Revenue/COGS from the report summary, Operating Expenses from this
 * section's own already-fetched total) - nothing is recomputed. */
export default function FinancialSummaryPanel({ revenue, cogs, operatingExpenses, profitLoss, profitMargin }: Props) {
  const cogsKnown = cogs !== null;
  const profitLossKnown = profitLoss !== null;
  const marginKnown = profitMargin !== null;
  const isLoss = profitLossKnown && (profitLoss as number) < 0;

  return (
    <Card testId="financial-summary-panel">
      <h3 className="text-base font-semibold text-foreground mb-1">Tóm tắt tài chính</h3>
      <div className="divide-y divide-border">
        <Row label="Doanh thu" value={currency.format(revenue)} muted />
        <Row label="Giá vốn hàng bán (COGS)" value={cogsKnown ? currency.format(cogs as number) : "—"} muted />
        <Row label="Chi phí vận hành" value={currency.format(operatingExpenses)} muted />
      </div>
      <div className="border-t-2 border-border mt-1">
        <Row
          label="Lãi / Lỗ ròng"
          value={profitLossKnown ? currency.format(profitLoss as number) : "—"}
          valueClassName={`text-base font-semibold ${isLoss ? "text-destructive" : "text-primary"}`}
        />
        <Row
          label="Biên lợi nhuận (%)"
          value={marginKnown ? formatPercent(profitMargin as number) : "—"}
          valueClassName={`text-base font-semibold ${isLoss ? "text-destructive" : "text-primary"}`}
        />
      </div>
    </Card>
  );
}
