"use client";

import { Wallet, Users, ShoppingCart, TrendingUp, TrendingDown } from "lucide-react";
import { MonthlySoldProductsSummary as Summary } from "@/types/monthlySoldProducts";
import { currency } from "@/lib/reports/format";
import StatCard from "@/components/ui/StatCard";

interface Props {
  summary: Summary;
}

// Summary Cards (Product Owner Decision, 2026-07-28) - exactly these 4, in
// this display order, replacing the former 5-card set (Average Selling
// Price/Average Order Value removed).
export default function MonthlySoldProductsSummary({ summary }: Props) {
  const profitLossKnown = summary.profitLoss !== null;
  const isLoss = profitLossKnown && (summary.profitLoss as number) < 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        title="Tổng doanh thu"
        value={currency.format(summary.totalRevenue)}
        icon={<Wallet className="w-6 h-6 text-emerald-600" />}
        color="bg-emerald-100"
      />
      <StatCard
        title="Tổng khách hàng"
        value={summary.totalCustomers}
        icon={<Users className="w-6 h-6 text-blue-600" />}
        color="bg-blue-100"
      />
      <StatCard
        title="Tổng đơn hàng"
        value={summary.totalOrders}
        icon={<ShoppingCart className="w-6 h-6 text-violet-600" />}
        color="bg-violet-100"
      />
      <StatCard
        title="Lãi / Lỗ"
        value={profitLossKnown ? currency.format(summary.profitLoss as number) : "—"}
        placeholder={!profitLossKnown}
        icon={
          isLoss ? (
            <TrendingDown className="w-6 h-6 text-destructive" />
          ) : (
            <TrendingUp className="w-6 h-6 text-primary" />
          )
        }
        color={isLoss ? "bg-destructive/10" : "bg-primary/10"}
      />
    </div>
  );
}
