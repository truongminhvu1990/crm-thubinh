"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Gem, Package, TrendingUp, Calendar, Wallet, Coins, ClipboardList, PiggyBank } from "lucide-react";
import { FollowUpSummaryCounts } from "@/lib/customer.service";
import { ProductReportData, BatchStaticReportData, PurchaseReportData } from "@/lib/reports/reports.service";
import { OrderValueSummary } from "@/lib/orders/orderValueSummary.service";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { useIsOwnerOrManager } from "@/lib/hooks/useIsOwnerOrManager";
import { TopSalesStaffEntry } from "@/lib/staff.service";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import SalesSummary from "@/components/dashboard/SalesSummary";
import ReportsIntegration from "@/components/dashboard/ReportsIntegration";
import FollowUpSummaryCard from "@/components/dashboard/FollowUpSummaryCard";
import CommissionSummaryCard from "@/components/dashboard/CommissionSummaryCard";
import TopSalesStaffCard from "@/components/dashboard/TopSalesStaffCard";
import UnrecognizedOrderValueBreakdown from "@/components/dashboard/UnrecognizedOrderValueBreakdown";
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
  const [orderValue, setOrderValue] = useState<OrderValueSummary | null>(null);
  const [unrecognizedOrderValue, setUnrecognizedOrderValue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [followUpCounts, setFollowUpCounts] = useState<FollowUpSummaryCounts>({
    overdue: 0,
    today: 0,
    next7Days: 0,
  });
  const [commissionStats, setCommissionStats] = useState({ thisMonth: 0, outstanding: 0 });
  const [topSalesStaff, setTopSalesStaff] = useState<TopSalesStaffEntry[]>([]);

  // Simple Profit Calculation Package, Final Revision: Dashboard stays
  // exactly as it always has for every role - no separate Sales layout.
  // Owner/Manager additionally see two more cards (Giá vốn/Lãi / Lỗ), using
  // totalCost/totalProfit already present on `purchaseData` since Part 3's
  // change to getPurchaseReportData - no new fetch needed.
  const canViewCostAndProfit = useIsOwnerOrManager();

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const overviewParams = range ? `?start=${range.start}&end=${range.end}` : "";
    fetch(`/api/dashboard/overview${overviewParams}`)
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{
              customers: { total: number; vip: number; normal: number; recentlyContacted: number };
              products: ProductReportData;
              batches: BatchStaticReportData;
              purchases: PurchaseReportData;
              orderValue: OrderValueSummary;
              unrecognizedOrderValue: number;
            }>)
          : null
      )
      .then((overview) => {
        if (cancelled || !overview) return;
        setCustomerStats(overview.customers);
        setProductTotal(overview.products.total);
        setBatchTotal(overview.batches.totalBatches);
        setPurchaseData(overview.purchases);
        setOrderValue(overview.orderValue);
        setUnrecognizedOrderValue(overview.unrecognizedOrderValue);
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
    fetch("/api/dashboard/follow-up")
      .then((res) => (res.ok ? (res.json() as Promise<FollowUpSummaryCounts>) : null))
      .then((counts) => {
        if (!cancelled && counts) setFollowUpCounts(counts);
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
    fetch("/api/dashboard/commission-stats")
      .then((res) => (res.ok ? (res.json() as Promise<{ thisMonth: number; outstanding: number }>) : null))
      .then((stats) => {
        if (!cancelled && stats) setCommissionStats(stats);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Top Sales Staff widget (Sprint v2.0.0, Feature 9) - revenue ranking
  // reads customer_purchases (see getTopSalesStaff), so it must respect the
  // Global Date Filter the same as the other revenue-based widgets above.
  useEffect(() => {
    let cancelled = false;
    const topSalesStaffParams = range ? `?start=${range.start}&end=${range.end}` : "";
    fetch(`/api/dashboard/top-sales-staff${topSalesStaffParams}`)
      .then((res) => (res.ok ? (res.json() as Promise<TopSalesStaffEntry[]>) : []))
      .then((entries) => {
        if (!cancelled) setTopSalesStaff(entries);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Revenue label now follows the Global Date Filter (Sprint v1.0.2)
  // instead of always saying "this month".
  const revenueLabel = `Doanh thu đã ghi nhận (${label})`;
  // Single source of truth: customer_purchases (via getPurchaseReportData) -
  // no Orders dependency for Dashboard revenue. Revenue Management
  // Visibility (2026-08-29) - relabeled from the ambiguous "Doanh thu" to
  // "Doanh thu đã ghi nhận" now that Total Order Value / Unrecognized
  // Order Value sit next to it - the underlying BR-001 formula (Completed
  // + Paid) is unchanged.
  const monthRevenue = purchaseData?.totalRevenue ?? 0;
  const totalOrderValue = orderValue?.totalOrderValue ?? 0;

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

      {/* Revenue Management Visibility (2026-08-29) - three distinct
          management metrics, deliberately never merged into one "Doanh
          thu" figure (Production read-only audit, 2026-08-29, confirmed
          management was comparing Orders' total order value against
          Recognized Revenue as if they were the same number).
          Order Revenue Visibility Semantic Gap fix (2026-08-29 follow-up):
          Giá trị đơn chưa ghi nhận is NOT "Tổng giá trị đơn hàng minus
          Doanh thu đã ghi nhận" - Doanh thu đã ghi nhận (B2) can include
          BR-002 legacy customer_purchases revenue with no linked Order at
          all (confirmed present on Dev), outside the Orders population
          Tổng giá trị đơn hàng/Giá trị đơn chưa ghi nhận describe. Giá trị
          đơn chưa ghi nhận is computed entirely from Orders instead
          (getOrderValueSummary's own Completed+Paid complement) - each
          card's hint below says so explicitly so the two numbers are never
          read as directly subtractable. */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          testId="dashboard-total-order-value-card"
          title="Tổng giá trị đơn hàng"
          value={currency.format(totalOrderValue)}
          hint="Tổng giá trị các đơn phát sinh trong kỳ (Đơn hàng)"
          icon={<ClipboardList className="w-8 h-8 text-blue-600" />}
          color="bg-blue-100"
          badge={<ScopeIndicator resource="orders" />}
        />
        <Link href="/reports">
          <StatCard
            testId="dashboard-revenue-card"
            title={revenueLabel}
            value={currency.format(monthRevenue)}
            hint="Completed + Paid — có thể gồm doanh thu ghi nhận ngoài Đơn hàng"
            icon={<Wallet className="w-8 h-8 text-emerald-600" />}
            color="bg-emerald-100"
            badge={<ScopeIndicator resource="revenue" />}
          />
        </Link>
        <StatCard
          testId="dashboard-unrecognized-order-value-card"
          title="Giá trị đơn chưa ghi nhận"
          value={currency.format(unrecognizedOrderValue)}
          hint="Tính riêng từ Đơn hàng — không phải hiệu số của hai chỉ số trên"
          icon={<PiggyBank className="w-8 h-8 text-amber-600" />}
          color="bg-amber-100"
        />
      </div>

      {/* Simple Profit Calculation Package, Final Revision: Owner/Manager
          additionally see Giá vốn/Lãi / Lỗ - nothing is hidden or replaced
          for Sales, unchanged by this task. */}
      {canViewCostAndProfit && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            testId="dashboard-cost-card"
            title="Giá vốn"
            value={currency.format(purchaseData?.totalCost ?? 0)}
            icon={<Coins className="w-8 h-8 text-amber-600" />}
            color="bg-amber-100"
          />
          <StatCard
            testId="dashboard-profit-card"
            title="Lãi / Lỗ"
            value={currency.format(purchaseData?.totalProfit ?? 0)}
            icon={<TrendingUp className="w-8 h-8 text-primary" />}
            color="bg-primary/10"
          />
        </div>
      )}

      {/* Giá trị đơn chưa ghi nhận - drill-down (Revenue Management
          Visibility, 2026-08-29). Same visibility as the cards above (no
          new permission - data-scoped by "orders", same as /orders). */}
      <div className="mb-6">
        <UnrecognizedOrderValueBreakdown rows={orderValue?.breakdown ?? []} />
      </div>

      {/* Overview - customer stats (existing) + product/batch totals (Reports) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Link href="/customers">
          <StatCard
            testId="dashboard-customer-total-card"
            title="Tổng khách hàng"
            value={customerStats.total}
            icon={<Users className="w-6 h-6 text-primary" />}
            color="bg-primary/10"
            badge={<ScopeIndicator resource="customers" />}
          />
        </Link>
        <Link href="/customers?type=VIP">
          <StatCard
            testId="dashboard-customer-vip-card"
            title="Khách VIP"
            value={customerStats.vip}
            icon={<Gem className="w-6 h-6 text-yellow-600" />}
            color="bg-yellow-100"
          />
        </Link>
        <StatCard
          testId="dashboard-customer-normal-card"
          title="Khách thường"
          value={customerStats.normal}
          icon={<Users className="w-6 h-6 text-green-600" />}
          color="bg-green-100"
        />
        <StatCard
          testId="dashboard-recently-contacted-card"
          title="Liên hệ 7 ngày"
          value={customerStats.recentlyContacted}
          icon={<Calendar className="w-6 h-6 text-purple-600" />}
          color="bg-purple-100"
        />
        <Link href="/reports">
          <StatCard
            testId="dashboard-product-total-card"
            title="Tổng sản phẩm"
            value={productTotal}
            icon={<Gem className="w-6 h-6 text-primary" />}
            color="bg-primary/10"
          />
        </Link>
        <Link href="/reports">
          <StatCard
            testId="dashboard-batch-total-card"
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
