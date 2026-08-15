"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Gem,
  Wallet,
  Package,
  Tag,
  UserCheck,
  Trophy,
  CalendarDays,
  CircleDot,
  Layers,
  Globe,
  Coins,
  PackageCheck,
  PackageOpen,
  AlertTriangle,
  LayoutDashboard,
  RefreshCw,
  ArrowRight,
  ShoppingCart,
  Boxes,
  ScrollText,
  Receipt,
  GitCompareArrows,
  Hourglass,
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import ReportsTable, { ReportsTableRow } from "@/components/reports/ReportsTable";
import ReportGroupSection from "@/components/reports/ReportGroupSection";
import RevenueDashboardCards from "@/components/reports/RevenueDashboardCards";
import KpiDashboard from "@/components/reports/KpiDashboard";
import CategoryAnalysisSection from "@/components/reports/CategoryAnalysisSection";
import CustomerAnalysisSection from "@/components/reports/CustomerAnalysisSection";
import StaffAnalysisSection from "@/components/reports/StaffAnalysisSection";
import RevenueTrendChart from "@/components/reports/RevenueTrendChart";
import ProfitSection from "@/components/reports/ProfitSection";
import ScopeIndicator from "@/components/shared/ScopeIndicator";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { useIsOwner } from "@/lib/hooks/useIsOwner";
import { useHasPermission } from "@/lib/hooks/useHasPermission";
import {
  BatchStaticReportData,
  BatchRevenueRow,
  CustomerReportData,
  ProductReportData,
  PurchaseReportData,
} from "@/lib/reports/reports.service";
import { DateRange } from "@/lib/dateFilter";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function formatMonth(month: string): string {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return month;
  return `Tháng ${Number(match[2])}/${match[1]}`;
}

function breakdownRows(rows: { label: string; count: number }[]): ReportsTableRow[] {
  return rows.map((r) => ({ key: r.label, searchLabel: r.label, cells: [r.label, r.count] }));
}

function rangeQuery(range: DateRange | null): string {
  return range ? `?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}` : "";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as T) : null;
}

export default function ReportsPage() {
  const { option, range } = useGlobalDateFilter();
  const isOwner = useIsOwner();
  const canView = useHasPermission("reports.view");

  // Decision 21 (Refresh) - bumping this key remounts the whole BI Center
  // subtree below, so every section's own mount effect (and its existing
  // loading-spinner state) reruns and refetches, with no dedicated
  // refresh-callback plumbing threaded through each section.
  const [refreshToken, setRefreshToken] = useState(0);

  const [customerData, setCustomerData] = useState<CustomerReportData | null>(null);
  const [productData, setProductData] = useState<ProductReportData | null>(null);
  const [batchStatic, setBatchStatic] = useState<BatchStaticReportData | null>(null);

  const [purchaseData, setPurchaseData] = useState<PurchaseReportData | null>(null);
  const [revenueByBatch, setRevenueByBatch] = useState<BatchRevenueRow[] | null>(null);

  // Initial load - everything not gated behind a Date Filter loads once.
  // Guarded on canView (Reporting API Permission Enforcement, Product Owner
  // Implementation Directive, 2026-08-15) so an unauthorized user's browser
  // never even attempts these now-403'd calls - the server-side check is
  // the real boundary regardless, this just avoids the wasted requests.
  useEffect(() => {
    if (!canView) return;
    fetchJson<CustomerReportData>("/api/reports/customers").then(setCustomerData);
    fetchJson<ProductReportData>("/api/reports/products").then(setProductData);
    fetchJson<BatchStaticReportData>("/api/reports/batches").then(setBatchStatic);
  }, [canView]);

  // Doanh thu section - the Global Date Filter governs all 4 of its reports
  // at once (REPORTS_SPEC.md §4, Sprint v1.0.2).
  useEffect(() => {
    if (!canView) return;
    fetchJson<PurchaseReportData>(`/api/reports/purchases${rangeQuery(range)}`).then(setPurchaseData);
  }, [canView, range]);

  // Revenue by Batch - the only Lô hàng report the Date Filter governs, same
  // shared range as the Doanh thu section above.
  useEffect(() => {
    if (!canView) return;
    fetchJson<BatchRevenueRow[]>(`/api/reports/batches/revenue${rangeQuery(range)}`).then(setRevenueByBatch);
  }, [canView, range]);

  const initialLoading = customerData === null || productData === null || batchStatic === null;

  const bySourceRows = useMemo(
    () => (purchaseData ? purchaseData.bySource.map((r) => ({ key: r.source, searchLabel: r.source, cells: [r.source, r.count, currency.format(r.revenue)] })) : []),
    [purchaseData]
  );
  const bySalespersonRows = useMemo(
    () =>
      purchaseData
        ? purchaseData.bySalesperson.map((r) => ({
            key: r.salesperson,
            searchLabel: r.salesperson,
            cells: [r.salesperson, r.count, currency.format(r.revenue)],
          }))
        : [],
    [purchaseData]
  );
  const topCustomerRows = useMemo(
    () =>
      purchaseData
        ? purchaseData.topCustomers.map((r) => ({
            key: r.customerId,
            searchLabel: r.name,
            cells: [
              <Link key={r.customerId} href={`/customers/${r.customerId}`} className="hover:text-primary hover:underline">
                {r.name}
              </Link>,
              r.count,
              currency.format(r.revenue),
            ],
          }))
        : [],
    [purchaseData]
  );
  const byPeriodRows = useMemo(
    () =>
      purchaseData
        ? purchaseData.byPeriod.map((r) => ({ key: r.month, searchLabel: formatMonth(r.month), cells: [formatMonth(r.month), currency.format(r.revenue)] }))
        : [],
    [purchaseData]
  );

  const revenueByBatchRows: ReportsTableRow[] = useMemo(
    () => (revenueByBatch || []).map((r) => ({ key: r.batchId, searchLabel: r.batchCode, cells: [r.batchCode, currency.format(r.revenue)] })),
    [revenueByBatch]
  );
  const productCountRows: ReportsTableRow[] = useMemo(
    () => (batchStatic?.productCountByBatch || []).map((r) => ({ key: r.batchId, searchLabel: r.batchCode, cells: [r.batchCode, r.count] })),
    [batchStatic]
  );
  const soldCountRows: ReportsTableRow[] = useMemo(
    () => (batchStatic?.soldCountByBatch || []).map((r) => ({ key: r.batchId, searchLabel: r.batchCode, cells: [r.batchCode, r.count] })),
    [batchStatic]
  );
  const remainingCountRows: ReportsTableRow[] = useMemo(
    () => (batchStatic?.remainingCountByBatch || []).map((r) => ({ key: r.batchId, searchLabel: r.batchCode, cells: [r.batchCode, r.count] })),
    [batchStatic]
  );
  const overdueRows: ReportsTableRow[] = useMemo(
    () =>
      (batchStatic?.overdueBatches || []).map((r) => ({
        key: r.batchId,
        searchLabel: r.batchCode,
        cells: [r.batchCode, formatDate(r.dueDate), r.daysOverdue, r.remaining],
      })),
    [batchStatic]
  );

  // Reporting API Permission Enforcement (docs/REPORTING_MASTER_SPEC.md
  // §12, LOCKED Rev 3) — Product Owner Implementation Directive,
  // 2026-08-15. The real security boundary is the server-side
  // requirePermission("reports.view") check now on every fetch this page
  // makes (§ above) — without this gate, an unauthorized user would just
  // see an infinite loading spinner forever (fetchJson resolves to null on
  // a 403), never a clear reason why. Same early-return pattern already
  // established by app/reports/reconciliation/page.tsx's own Owner-only
  // gate, using the existing useHasPermission hook rather than a new one.
  if (!canView) {
    return (
      <div className="pb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Báo cáo</h1>
        <p className="text-muted-foreground mt-4">Bạn không có quyền xem báo cáo</p>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  return (
    <div className="pb-8 space-y-8">
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Báo cáo</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Báo cáo chi tiết theo khách hàng, sản phẩm, doanh thu và lô hàng.
          </p>
          <div className="mt-1.5">
            <PageViewingLabel />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalDateFilter />
          <Button
            data-testid="report-reload-button"
            variant="secondary"
            size="md"
            onClick={() => setRefreshToken((t) => t + 1)}
            title="Tải lại toàn bộ dữ liệu BI"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="muted">Chưa áp dụng phạm vi dữ liệu</Badge>
      </div>

      {/* ============================================================
          Reporting Categories (Task: Group Reports) - the five groups
          below are exactly five of the six Reporting Categories LOCKED by
          docs/07_REPORTING_SPEC.md §4 (Revenue, Sales, Inventory, Customer,
          Operational). Commission is the sixth category but has no report
          built in this page today (§8/Part B: no unified Commission report
          exists in reportsBI.service.ts yet) - omitted rather than shown
          empty, so no speculative/empty category is introduced. Every
          report that existed on this page before grouping still exists
          below, unmoved in content, only organized into its own category's
          collapsible section. Groups default open so nothing is hidden by
          this change - only decluttered.
          ============================================================ */}

      <div key={refreshToken} className="space-y-6">
        {/* Revenue Reporting (07_REPORTING_SPEC.md §5) */}
        <ReportGroupSection title="Doanh thu" description="Tổng quan, KPI, xu hướng và lợi nhuận doanh thu" icon={Wallet}>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              Doanh thu tổng quan
            </h2>
            <RevenueDashboardCards />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-primary" />
              Bảng chỉ số KPI
            </h2>
            <KpiDashboard option={option} range={range} />
          </section>

          <section className="space-y-4">
            <RevenueTrendChart range={range} />
          </section>

          <section className="space-y-4">
            <ProfitSection range={range} />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              Doanh thu theo nguồn, nhân viên và kỳ
              <ScopeIndicator resource="revenue" />
            </h2>
            <StatCard
              title="Tổng doanh thu"
              value={purchaseData !== null ? currency.format(purchaseData.totalRevenue) : "—"}
              icon={<Wallet className="w-5 h-5 text-primary" />}
              placeholder={purchaseData === null}
            />
            {purchaseData === null ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin text-2xl">⟳</div>
              </div>
            ) : (
              <>
                <ReportsTable
                  icon={<Tag className="w-5 h-5 text-primary" />}
                  title="Doanh thu theo nguồn hàng"
                  headers={["Nguồn hàng", "Số lượng đã bán", "Doanh thu"]}
                  rows={bySourceRows}
                  emptyLabel="Không có dữ liệu trong khoảng thời gian đã chọn"
                  searchPlaceholder="Tìm theo nguồn hàng..."
                />
                <ReportsTable
                  icon={<UserCheck className="w-5 h-5 text-primary" />}
                  title="Doanh thu theo nhân viên"
                  headers={["Nhân viên", "Số lượng đã bán", "Doanh thu"]}
                  rows={bySalespersonRows}
                  emptyLabel="Không có dữ liệu trong khoảng thời gian đã chọn"
                  searchPlaceholder="Tìm theo nhân viên..."
                />
                <ReportsTable
                  icon={<Trophy className="w-5 h-5 text-primary" />}
                  title="Khách hàng hàng đầu"
                  headers={["Khách hàng", "Số lần mua", "Doanh thu"]}
                  rows={topCustomerRows}
                  emptyLabel="Không có dữ liệu trong khoảng thời gian đã chọn"
                  searchPlaceholder="Tìm theo tên khách hàng..."
                />
                <ReportsTable
                  icon={<CalendarDays className="w-5 h-5 text-primary" />}
                  title="Doanh thu theo kỳ (tháng)"
                  headers={["Kỳ", "Doanh thu"]}
                  rows={byPeriodRows}
                  emptyLabel="Không có dữ liệu trong khoảng thời gian đã chọn"
                  searchPlaceholder="Tìm theo tháng..."
                />
              </>
            )}
          </section>
        </ReportGroupSection>

        {/* Sales Reporting (07_REPORTING_SPEC.md §6) */}
        <ReportGroupSection title="Bán hàng" description="Phân tích theo danh mục sản phẩm và hiệu suất nhân viên kinh doanh" icon={ShoppingCart}>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Phân tích danh mục
            </h2>
            <CategoryAnalysisSection range={range} />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              Phân tích nhân viên kinh doanh
            </h2>
            <StaffAnalysisSection range={range} />
          </section>
        </ReportGroupSection>

        {/* Inventory Reporting (07_REPORTING_SPEC.md §7) */}
        <ReportGroupSection title="Tồn kho" description="Sản phẩm và lô hàng theo trạng thái, danh mục, xuất xứ" icon={Boxes}>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Gem className="w-5 h-5 text-primary" />
              Sản phẩm
            </h2>
            <StatCard title="Tổng sản phẩm" value={productData!.total} icon={<Gem className="w-5 h-5 text-primary" />} />
            <ReportsTable
              icon={<CircleDot className="w-5 h-5 text-primary" />}
              title="Theo trạng thái"
              headers={["Trạng thái", "Số lượng"]}
              rows={breakdownRows(productData!.byStatus)}
              emptyLabel="Chưa có dữ liệu"
              searchPlaceholder="Tìm theo trạng thái..."
            />
            <ReportsTable
              icon={<Layers className="w-5 h-5 text-primary" />}
              title="Theo danh mục"
              headers={["Danh mục", "Số lượng"]}
              rows={breakdownRows(productData!.byCategory)}
              emptyLabel="Chưa có dữ liệu"
              searchPlaceholder="Tìm theo danh mục..."
            />
            <ReportsTable
              icon={<Globe className="w-5 h-5 text-primary" />}
              title="Theo xuất xứ"
              headers={["Xuất xứ", "Số lượng"]}
              rows={breakdownRows(productData!.byOrigin)}
              emptyLabel="Chưa có dữ liệu"
              searchPlaceholder="Tìm theo xuất xứ..."
            />
            <ReportsTable
              icon={<UserCheck className="w-5 h-5 text-primary" />}
              title="Theo nhân viên"
              headers={["Nhân viên", "Số lượng"]}
              rows={breakdownRows(productData!.bySalesOwner)}
              emptyLabel="Chưa có dữ liệu"
              searchPlaceholder="Tìm theo nhân viên..."
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Lô hàng
            </h2>
            <StatCard title="Tổng lô hàng" value={batchStatic!.totalBatches} icon={<Package className="w-5 h-5 text-primary" />} />

            <ReportsTable
              icon={<Coins className="w-5 h-5 text-primary" />}
              title="Doanh thu theo lô hàng"
              headers={["Lô hàng", "Doanh thu"]}
              rows={revenueByBatchRows}
              emptyLabel="Không có dữ liệu trong khoảng thời gian đã chọn"
              searchPlaceholder="Tìm theo lô hàng..."
            />

            <ReportsTable
              icon={<Package className="w-5 h-5 text-primary" />}
              title="Số sản phẩm theo lô hàng"
              headers={["Lô hàng", "Số sản phẩm"]}
              rows={productCountRows}
              emptyLabel="Chưa có sản phẩm nào theo lô"
              searchPlaceholder="Tìm theo lô hàng..."
            />
            <ReportsTable
              icon={<PackageCheck className="w-5 h-5 text-primary" />}
              title="Đã bán theo lô hàng"
              headers={["Lô hàng", "Đã bán"]}
              rows={soldCountRows}
              emptyLabel="Chưa có sản phẩm đã bán theo lô"
              searchPlaceholder="Tìm theo lô hàng..."
            />
            <ReportsTable
              icon={<PackageOpen className="w-5 h-5 text-primary" />}
              title="Còn lại theo lô hàng"
              headers={["Lô hàng", "Còn lại"]}
              rows={remainingCountRows}
              emptyLabel="Không có sản phẩm tồn theo lô"
              searchPlaceholder="Tìm theo lô hàng..."
            />
            <ReportsTable
              icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
              title="Lô hàng quá hạn"
              headers={["Lô hàng", "Hạn trả", "Số ngày quá hạn", "Còn lại"]}
              rows={overdueRows}
              emptyLabel="Không có lô hàng quá hạn"
              searchPlaceholder="Tìm theo lô hàng..."
            />
          </section>
        </ReportGroupSection>

        {/* Customer Reporting (07_REPORTING_SPEC.md §9) */}
        <ReportGroupSection title="Khách hàng" description="Phân khúc khách hàng và khách hàng hàng đầu" icon={Users}>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Khách hàng (chi tiết)
            </h2>
            <StatCard title="Tổng khách hàng" value={customerData!.total} icon={<Users className="w-5 h-5 text-primary" />} />
            <ReportsTable
              icon={<Tag className="w-5 h-5 text-primary" />}
              title="Theo nguồn khách hàng"
              headers={["Nguồn khách hàng", "Số lượng"]}
              rows={breakdownRows(customerData!.bySource)}
              emptyLabel="Chưa có dữ liệu"
              searchPlaceholder="Tìm theo nguồn..."
            />
            <ReportsTable
              icon={<Trophy className="w-5 h-5 text-primary" />}
              title="Theo hạng"
              headers={["Hạng", "Số lượng"]}
              rows={breakdownRows(customerData!.byVipTier)}
              emptyLabel="Chưa có dữ liệu"
              searchPlaceholder="Tìm theo hạng..."
            />
            <ReportsTable
              icon={<UserCheck className="w-5 h-5 text-primary" />}
              title="Theo nhân viên phụ trách"
              headers={["Nhân viên phụ trách", "Số lượng"]}
              rows={breakdownRows(customerData!.bySalesperson)}
              emptyLabel="Chưa có dữ liệu"
              searchPlaceholder="Tìm theo nhân viên..."
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Phân tích khách hàng
            </h2>
            <CustomerAnalysisSection range={range} />
          </section>
        </ReportGroupSection>

        {/* Operational Reporting (07_REPORTING_SPEC.md §10) - Sales Ledger
            and Monthly Sold Products are both standalone operational report
            pages, not embedded in this BI Center (same Product Owner
            Decision, 2026-07-28, that already applied to Monthly Sold
            Products). This group only links out to them so both are
            discoverable from the Reporting entry point, same treatment. */}
        <ReportGroupSection title="Vận hành" description="Sổ bán hàng và sản phẩm đã bán theo kỳ - phục vụ kiểm tra vận hành" icon={ScrollText}>
          <Link
            href="/reports/sales-ledger"
            className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl shadow-sm p-4 hover:border-primary/40 transition-colors"
          >
            <span className="flex items-center gap-3">
              <Receipt className="w-5 h-5 text-primary" />
              <span>
                <span className="block text-sm font-semibold text-foreground">Sổ bán hàng</span>
                <span className="block text-xs text-muted-foreground">
                  Từng giao dịch bán hàng - hoa hồng, trạng thái, xác minh dữ liệu
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Link>

          <Link
            href="/reports/monthly-sold-products"
            className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl shadow-sm p-4 hover:border-primary/40 transition-colors"
          >
            <span className="flex items-center gap-3">
              <Gem className="w-5 h-5 text-primary" />
              <span>
                <span className="block text-sm font-semibold text-foreground">Sản phẩm đã bán theo tháng</span>
                <span className="block text-xs text-muted-foreground">
                  Danh sách từng sản phẩm đã bán theo kỳ - báo cáo vận hành riêng
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Link>

          <Link
            href="/reports/payment-method"
            className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl shadow-sm p-4 hover:border-primary/40 transition-colors"
          >
            <span className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-primary" />
              <span>
                <span className="block text-sm font-semibold text-foreground">Phương thức thanh toán</span>
                <span className="block text-xs text-muted-foreground">
                  Đơn hàng, lượt thanh toán và tổng số tiền theo từng phương thức
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Link>

          {/* E-3 - Unified Revenue Reconciliation View (docs/
              REPORTING_MASTER_SPEC.md §10, Decision Q-2, Revision 3) -
              Owner-only per its own spec (§10 field 14), so the link itself
              is hidden from every other role rather than shown then
              rejected server-side (the API route enforces this regardless
              - see app/api/reports/reconciliation/route.ts). */}
          {isOwner && (
            <Link
              href="/reports/reconciliation"
              className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl shadow-sm p-4 hover:border-primary/40 transition-colors"
            >
              <span className="flex items-center gap-3">
                <GitCompareArrows className="w-5 h-5 text-primary" />
                <span>
                  <span className="block text-sm font-semibold text-foreground">Đối soát doanh thu</span>
                  <span className="block text-xs text-muted-foreground">
                    So sánh doanh thu và khách hàng hàng đầu giữa Reports và Business Intelligence
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          )}

          {/* ST-3 / ST-4 - Commission Reporting (docs/07_REPORTING_SPEC.md
              §8, restating docs/06_COMMISSION_SPEC.md §16) - a Reporting-
              owned Projection over sales_commissions, never Commission's
              own service (Decision 2). */}
          <Link
            href="/reports/commission-by-salesperson"
            className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl shadow-sm p-4 hover:border-primary/40 transition-colors"
          >
            <span className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-primary" />
              <span>
                <span className="block text-sm font-semibold text-foreground">Hoa hồng theo nhân viên</span>
                <span className="block text-xs text-muted-foreground">Doanh số và hoa hồng đã tính cho từng nhân viên</span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Link>

          <Link
            href="/reports/commission-aging"
            className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl shadow-sm p-4 hover:border-primary/40 transition-colors"
          >
            <span className="flex items-center gap-3">
              <Hourglass className="w-5 h-5 text-primary" />
              <span>
                <span className="block text-sm font-semibold text-foreground">Hoa hồng chờ duyệt</span>
                <span className="block text-xs text-muted-foreground">Hoa hồng đang chờ duyệt, sắp xếp theo thời gian chờ</span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Link>

          {/* I-4 / OP-3 - Shrinkage / Adjustment Reason Breakdown Report
              intentionally omitted from this release: it reads
              inventory_audit, a table introduced only by an uncommitted
              Inventory Adjustments migration not part of the Production
              baseline (Reporting Release Isolation, Conflict A, Product
              Owner Decision 2026-08-15). Re-add once that migration ships
              separately. */}
        </ReportGroupSection>
      </div>
    </div>
  );
}
