"use client";

import { TrendingUp, Wallet, Coins } from "lucide-react";
import Card from "@/components/ui/Card";
import { currency } from "@/lib/reports/format";
import { PurchaseReportData } from "@/lib/reports/reports.service";
import { METRIC_LABELS } from "@/lib/reports/overviewUi";

// Simple Profit Calculation Package, Part 3 - exactly three summary values,
// no percentages/charts/additional analysis. Reuses the existing
// /api/reports/purchases route (getPurchaseReportData), which now also
// returns totalCost/totalProfit - no new API, no new RPC.

interface Props {
  /** Phase 1.6B: the Reports page already fetches /api/reports/purchases for the active period - it is passed in, not refetched. */
  data: PurchaseReportData | null;
}

export default function ProfitSection({ data }: Props) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        {METRIC_LABELS.grossProfit}
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="w-4 h-4" />
            <p className="text-xs">{METRIC_LABELS.recognizedRevenue}</p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-2">
            {data ? currency.format(data.totalRevenue) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Coins className="w-4 h-4" />
            <p className="text-xs">{METRIC_LABELS.cost}</p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-2">
            {data ? currency.format(data.totalCost) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="w-4 h-4" />
            <p className="text-xs">{METRIC_LABELS.grossProfit}</p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-2">
            {data ? currency.format(data.totalProfit) : "—"}
          </p>
        </div>
      </div>
    </Card>
  );
}
