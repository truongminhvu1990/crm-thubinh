"use client";

import { Receipt, Wallet, Percent, TrendingUp } from "lucide-react";
import { SalesLedgerSummary as Summary } from "@/types/salesLedger";
import StatCard from "@/components/ui/StatCard";

interface Props {
  summary: Summary;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function SalesLedgerSummary({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        title="Tổng giao dịch"
        value={summary.totalTransactions}
        icon={<Receipt className="w-6 h-6 text-primary" />}
        color="bg-primary/10"
      />
      <StatCard
        title="Tổng doanh thu"
        value={currency.format(summary.totalRevenue)}
        icon={<Wallet className="w-6 h-6 text-emerald-600" />}
        color="bg-emerald-100"
      />
      <StatCard
        title="Tổng hoa hồng"
        value={currency.format(summary.totalCommission)}
        icon={<Percent className="w-6 h-6 text-amber-600" />}
        color="bg-amber-100"
      />
      <StatCard
        title="Giá trị TB / giao dịch"
        value={currency.format(summary.averageSale)}
        icon={<TrendingUp className="w-6 h-6 text-blue-600" />}
        color="bg-blue-100"
      />
    </div>
  );
}
