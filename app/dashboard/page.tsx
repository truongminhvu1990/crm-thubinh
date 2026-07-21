"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Gem, Package, TrendingUp, Calendar, Wallet } from "lucide-react";
import { getCustomerStats, getFollowUpSummaryCounts, FollowUpSummaryCounts } from "@/lib/customer.service";
import {
  getProductReportData,
  getBatchStaticReportData,
  getPurchaseReportData,
  PurchaseReportData,
} from "@/lib/reports/reports.service";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { getDashboardCommissionStats } from "@/lib/commission/commission.service";
import { getTopSalesStaff, TopSalesStaffEntry } from "@/lib/staff.service";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import SalesSummary from "@/components/dashboard/SalesSummary";
import ReportsIntegration from "@/components/dashboard/ReportsIntegration";
import FollowUpSummaryCard from "@/components/dashboard/FollowUpSummaryCard";
import CommissionSummaryCard from "@/components/dashboard/CommissionSummaryCard";
import TopSalesStaffCard from "@/components/dashboard/TopSalesStaffCard";
import ScopeIndicator from "@/components/shared/ScopeIndicator";

export default function Dashboard() {
  const { range, label } = useGlobalDateFilter();

  const [customerStats, setCustomerStats] = useState({
    total: 0,
    vip: 0,
    normal: 0,
    recentlyContacted: 0,
  });
  const [productTotal, setProductTotal] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [purchaseData, setPurchaseData] = useState<PurchaseReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [followUpCounts, setFollowUpCounts] = useState<FollowUpSummaryCounts>({
    overdue: 0,
    today: 0,
    next7Days: 0,
  });
  const [commissionStats, setCommissionStats] = useState({ thisMonth: 0, outstanding: 0 });
  const [topSalesStaff, setTopSalesStaff] = useState<TopSalesStaffEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([getCustomerStats(), getProductReportData(), getBatchStaticReportData(), getPurchaseReportData(range)])
      .then(([customers, products, batches, purchases]) => {
        if (cancelled) return;
        setCustomerStats(customers);
        setProductTotal(products.total);
        setBatchTotal(batches.totalBatches);
        setPurchaseData(purchases);
      })
      .catch((error) => console.error("Failed to load dashboard stats:", error))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Follow-up Summary widget (Sprint v1.1.1) - kept in its own effect, not
  // part of the range-dependent Promise.all above, since follow-up counts
  // aren't date-filtered and shouldn't refetch every time the global date
  // range changes.
  useEffect(() => {
    let cancelled = false;
    getFollowUpSummaryCounts().then((counts) => {
      if (!cancelled) setFollowUpCounts(counts);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Commission Summary widget (Sprint v1.2.0) - its own effect for the same
  // reason as Follow-up Summary above: not date-range-dependent, and reads
  // sales_commissions exclusively (never customer_purchases), per spec.
  useEffect(() => {
    let cancelled = false;
    getDashboardCommissionStats().then((stats) => {
      if (!cancelled) setCommissionStats(stats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Top Sales Staff widget (Sprint v2.0.0, Feature 9) - its own effect for
  // the same reason as Follow-up/Commission Summary above: not date-range-
  // dependent.
  useEffect(() => {
    let cancelled = false;
    getTopSalesStaff().then((entries) => {
      if (!cancelled) setTopSalesStaff(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Revenue label now follows the Global Date Filter (Sprint v1.0.2)
  // instead of always saying "this month".
  const revenueLabel = `Doanh thu (${label})`;
  // Single source of truth: customer_purchases (via getPurchaseReportData) -
  // no Orders dependency for Dashboard revenue.
  const monthRevenue = purchaseData?.totalRevenue ?? 0;

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
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            📊 Dashboard CRM Cẩm Thạch Thu Bình
          </h1>
          <p className="text-muted-foreground mt-2">Chào mừng bạn quay lại!</p>
          <div className="mt-1">
            <PageViewingLabel />
          </div>
        </div>
        <GlobalDateFilter />
      </div>

      {/* Revenue - its own row so the formatted currency string always has room */}
      <div className="mb-4">
        <Link href="/reports">
          <StatCard
            title={revenueLabel}
            value={currency.format(monthRevenue)}
            icon={<Wallet className="w-8 h-8 text-emerald-600" />}
            color="bg-emerald-100"
            badge={<ScopeIndicator resource="revenue" />}
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
            badge={<ScopeIndicator resource="customers" />}
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

      {/* Follow-up Summary (Sprint v1.1.1) + Commission Summary (Sprint v1.2.0) widgets */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <FollowUpSummaryCard counts={followUpCounts} />
        <CommissionSummaryCard thisMonth={commissionStats.thisMonth} outstanding={commissionStats.outstanding} />
      </div>

      {/* Sales Summary */}
      <div className="mb-6">
        <SalesSummary data={purchaseData} monthLabel={label} />
      </div>

      {/* Top Sales Staff (Sprint v2.0.0, Feature 9) */}
      <div className="mb-6 max-w-2xl">
        <TopSalesStaffCard entries={topSalesStaff} />
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
