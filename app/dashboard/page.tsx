"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Gem, Package, TrendingUp, Calendar, Wallet } from "lucide-react";
import { getCustomerStats } from "@/lib/customer.service";
import {
  getDateRange,
  getProductReportData,
  getBatchStaticReportData,
  getPurchaseReportData,
  PurchaseReportData,
} from "@/lib/reports/reports.service";
import { getOrdersRevenueForRange } from "@/lib/orders/order.service";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import SalesSummary from "@/components/dashboard/SalesSummary";
import ReportsIntegration from "@/components/dashboard/ReportsIntegration";

export default function Dashboard() {
  const [customerStats, setCustomerStats] = useState({
    total: 0,
    vip: 0,
    normal: 0,
    recentlyContacted: 0,
  });
  const [productTotal, setProductTotal] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [purchaseData, setPurchaseData] = useState<PurchaseReportData | null>(null);
  const [ordersRevenue, setOrdersRevenue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  async function loadStats() {
    setIsLoading(true);
    try {
      const thisMonth = getDateRange("this_month");
      const [customers, products, batches, purchases, revenue] = await Promise.all([
        getCustomerStats(),
        getProductReportData(),
        getBatchStaticReportData(),
        getPurchaseReportData(thisMonth),
        getOrdersRevenueForRange(thisMonth.start, thisMonth.end),
      ]);
      setCustomerStats(customers);
      setProductTotal(products.total);
      setBatchTotal(batches.totalBatches);
      setPurchaseData(purchases);
      setOrdersRevenue(revenue);
    } catch (error) {
      console.error("Failed to load dashboard stats:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  // Always the real current month - never a stored/hardcoded value, so
  // this label and the revenue query above both roll over automatically.
  const now = new Date();
  const currentMonthLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
  const revenueLabel = `Doanh thu ${currentMonthLabel.toLowerCase()}`;

  const currency = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          📊 Dashboard CRM Cẩm Thạch Thu Bình
        </h1>
        <p className="text-muted-foreground mt-2">Chào mừng bạn quay lại!</p>
      </div>

      {/* Revenue - its own row so the formatted currency string always has room */}
      <div className="mb-4">
        <Link href="/reports">
          <StatCard
            title={revenueLabel}
            value={currency.format(ordersRevenue)}
            icon={<Wallet className="w-8 h-8 text-emerald-600" />}
            color="bg-emerald-100"
          />
        </Link>
      </div>

      {/* Overview - customer stats (existing) + product/batch totals (Reports) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Link href="/customers">
          <StatCard
            title="Tổng khách hàng"
            value={customerStats.total}
            icon={<Users className="w-6 h-6 text-primary" />}
            color="bg-primary/10"
          />
        </Link>
        <Link href="/customers?type=VIP">
          <StatCard
            title="Khách VIP"
            value={customerStats.vip}
            icon={<Gem className="w-6 h-6 text-yellow-600" />}
            color="bg-yellow-100"
          />
        </Link>
        <StatCard
          title="Khách thường"
          value={customerStats.normal}
          icon={<Users className="w-6 h-6 text-green-600" />}
          color="bg-green-100"
        />
        <StatCard
          title="Liên hệ 7 ngày"
          value={customerStats.recentlyContacted}
          icon={<Calendar className="w-6 h-6 text-purple-600" />}
          color="bg-purple-100"
        />
        <Link href="/reports">
          <StatCard
            title="Tổng sản phẩm"
            value={productTotal}
            icon={<Gem className="w-6 h-6 text-primary" />}
            color="bg-primary/10"
          />
        </Link>
        <Link href="/reports">
          <StatCard
            title="Tổng lô hàng"
            value={batchTotal}
            icon={<Package className="w-6 h-6 text-blue-600" />}
            color="bg-blue-100"
          />
        </Link>
      </div>

      {/* Sales Summary */}
      <div className="mb-6">
        <SalesSummary data={purchaseData} monthLabel={currentMonthLabel} revenue={ordersRevenue} />
      </div>

      {/* Dashboard integration with existing Reports */}
      <div className="mb-6">
        <ReportsIntegration />
      </div>

      {/* Quick Actions / System Info - unchanged from before this phase */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            🚀 Thao tác nhanh
          </h2>
          <ul className="space-y-3">
            <li>
              <Link
                href="/customers"
                className="text-primary hover:underline flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Quản lý khách hàng
              </Link>
            </li>
            <li>
              <Link
                href="/customers"
                className="text-primary hover:underline flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Xem khách VIP
              </Link>
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            ℹ️ Thông tin hệ thống
          </h2>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Phiên bản:</span>{" "}
              <span className="font-medium">1.0.0</span>
            </p>
            <p>
              <span className="text-muted-foreground">Cơ sở dữ liệu:</span>{" "}
              <span className="font-medium">Supabase</span>
            </p>
            <p>
              <span className="text-muted-foreground">Trạng thái:</span>{" "}
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              <span className="font-medium text-green-600">Hoạt động</span>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
