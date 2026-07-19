"use client";

import { Wallet, Tag, UserCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import { PurchaseReportData } from "@/lib/reports/reports.service";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  data: PurchaseReportData | null;
  monthLabel: string;
  /** Orders-sourced revenue (ORDERS_SPEC.md §5 Revenue Recognition),
   * overriding `data.totalRevenue` for the "Doanh thu tháng này" figure only
   * — keeps it consistent with the Dashboard's top revenue card, which
   * reads the same source. Leading Source/Salesperson still come from
   * `data` (Reports' existing customer_purchases-based source), untouched. */
  revenue?: number;
}

export default function SalesSummary({ data, monthLabel, revenue }: Props) {
  const topSource = data?.bySource[0];
  const topSalesperson = data?.bySalesperson[0];
  const displayRevenue = revenue ?? data?.totalRevenue;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Wallet className="w-5 h-5 text-primary" />
        Tóm tắt bán hàng — {monthLabel}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-emerald-100">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Doanh thu tháng này</p>
            <p className="font-bold text-foreground">{displayRevenue !== undefined ? currency.format(displayRevenue) : "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <Tag className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Nguồn hàng dẫn đầu</p>
            <p className="font-bold text-foreground">{topSource ? topSource.source : "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-purple-100">
            <UserCheck className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Nhân viên dẫn đầu</p>
            <p className="font-bold text-foreground">{topSalesperson ? topSalesperson.salesperson : "—"}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
