"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Wallet, Coins } from "lucide-react";
import Card from "@/components/ui/Card";
import { DateRange } from "@/lib/dateFilter";
import { currency } from "@/lib/reports/format";
import { rangeSearchParams } from "@/lib/reports/reportsApiClient";
import { PurchaseReportData } from "@/lib/reports/reports.service";

// Simple Profit Calculation Package, Part 3 - exactly three summary values,
// no percentages/charts/additional analysis. Reuses the existing
// /api/reports/purchases route (getPurchaseReportData), which now also
// returns totalCost/totalProfit - no new API, no new RPC.

interface Props {
  range: DateRange | null;
}

export default function ProfitSection({ range }: Props) {
  const [data, setData] = useState<PurchaseReportData | null>(null);

  useEffect(() => {
    fetch(`/api/reports/purchases?${rangeSearchParams(range)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: PurchaseReportData | null) => setData(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end]);

  return (
    <Card>
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        Lãi / Lỗ
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="w-4 h-4" />
            <p className="text-xs">Tổng doanh thu</p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-2">
            {data ? currency.format(data.totalRevenue) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Coins className="w-4 h-4" />
            <p className="text-xs">Tổng giá vốn</p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-2">
            {data ? currency.format(data.totalCost) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="w-4 h-4" />
            <p className="text-xs">Tổng lãi / lỗ</p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-2">
            {data ? currency.format(data.totalProfit) : "—"}
          </p>
        </div>
      </div>
    </Card>
  );
}
