"use client";

import { Wallet, Users, ShoppingCart, TrendingUp, TrendingDown, Package, CheckCircle2, Clock } from "lucide-react";
import { MonthlySoldProductsSummary as Summary } from "@/types/monthlySoldProducts";
import { currency, formatPercent } from "@/lib/reports/format";
import StatCard from "@/components/ui/StatCard";

interface Props {
  summary: Summary;
}

// Revenue & Sales Reporting Unification (Product Owner decision): the
// revenue cards read as TOTAL = RECOGNIZED + UNRECOGNIZED, the same
// structure the Dashboard uses (definitions live in
// lib/reports/revenueDefinition.ts). "Total" here is the value of the SOLD
// products (Completed orders, and Reserved orders with a deposit) - a
// narrower population than the Dashboard's every-non-Lost-Order total, so
// the two "Tổng" figures are related but intentionally not the same.
// Profit/Loss is still computed on recognized revenue only.
export default function MonthlySoldProductsSummary({ summary }: Props) {
  const profitLossKnown = summary.profitLoss !== null;
  const isLoss = profitLossKnown && (summary.profitLoss as number) < 0;

  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          testId="monthly-sold-products-sold-value-card"
          title="Tổng giá trị sản phẩm bán"
          value={currency.format(summary.soldValue)}
          hint="Đơn Completed, và đơn Reserved đã có cọc"
          icon={<Wallet className="w-6 h-6 text-blue-600" />}
          color="bg-blue-100"
        />
        <StatCard
          testId="monthly-sold-products-recognized-card"
          title="Doanh thu đã ghi nhận"
          value={currency.format(summary.recognizedRevenue)}
          hint="Completed + Paid"
          icon={<CheckCircle2 className="w-6 h-6 text-emerald-600" />}
          color="bg-emerald-100"
        />
        <StatCard
          testId="monthly-sold-products-unrecognized-card"
          title="Doanh thu chưa ghi nhận"
          value={currency.format(summary.unrecognizedValue)}
          hint="Đang cọc / chưa Paid đầy đủ"
          icon={<Clock className="w-6 h-6 text-amber-600" />}
          color="bg-amber-100"
        />
      </div>
      <p className="text-xs text-muted-foreground" data-testid="monthly-sold-products-reconciliation-line">
        Đã ghi nhận {currency.format(summary.recognizedRevenue)} + Chưa ghi nhận {currency.format(summary.unrecognizedValue)} ={" "}
        {currency.format(summary.soldValue)} · Tỷ lệ đã ghi nhận {formatPercent(summary.recognizedRatio * 100)}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          testId="monthly-sold-products-lines-card"
          title="Số sản phẩm"
          value={summary.soldLines}
          icon={<Package className="w-6 h-6 text-indigo-600" />}
          color="bg-indigo-100"
        />
        <StatCard
          testId="monthly-sold-products-orders-card"
          title="Số đơn hàng"
          value={summary.totalOrders}
          hint={`${summary.recognizedOrders} đã ghi nhận · ${summary.unrecognizedOrders} chưa ghi nhận`}
          icon={<ShoppingCart className="w-6 h-6 text-violet-600" />}
          color="bg-violet-100"
        />
        <StatCard
          title="Số khách hàng"
          value={summary.totalCustomers}
          icon={<Users className="w-6 h-6 text-blue-600" />}
          color="bg-blue-100"
        />
        <StatCard
          title="Lãi / Lỗ"
          value={profitLossKnown ? currency.format(summary.profitLoss as number) : "—"}
          hint="Tính trên doanh thu đã ghi nhận"
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
    </div>
  );
}
