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
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import ReportsTable, { ReportsTableRow } from "@/components/reports/ReportsTable";
import { formatDate } from "@/lib/utils";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import {
  BatchStaticReportData,
  BatchRevenueRow,
  CustomerReportData,
  ProductReportData,
  PurchaseReportData,
  getBatchStaticReportData,
  getCustomerReportData,
  getProductReportData,
  getPurchaseReportData,
  getRevenueByBatch,
} from "@/lib/reports/reports.service";

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

export default function ReportsPage() {
  const { range } = useGlobalDateFilter();

  const [customerData, setCustomerData] = useState<CustomerReportData | null>(null);
  const [productData, setProductData] = useState<ProductReportData | null>(null);
  const [batchStatic, setBatchStatic] = useState<BatchStaticReportData | null>(null);

  const [purchaseData, setPurchaseData] = useState<PurchaseReportData | null>(null);
  const [revenueByBatch, setRevenueByBatch] = useState<BatchRevenueRow[] | null>(null);

  // Initial load - everything not gated behind a Date Filter loads once.
  useEffect(() => {
    getCustomerReportData().then(setCustomerData);
    getProductReportData().then(setProductData);
    getBatchStaticReportData().then(setBatchStatic);
  }, []);

  // Doanh thu section - the Global Date Filter governs all 4 of its reports
  // at once (REPORTS_SPEC.md §4, Sprint v1.0.2).
  useEffect(() => {
    getPurchaseReportData(range).then(setPurchaseData);
  }, [range]);

  // Revenue by Batch - the only Lô hàng report the Date Filter governs, same
  // shared range as the Doanh thu section above.
  useEffect(() => {
    getRevenueByBatch(range).then(setRevenueByBatch);
  }, [range]);

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
        <GlobalDateFilter />
      </div>

      {/* Khách hàng */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Khách hàng
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

      {/* Sản phẩm */}
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

      {/* Doanh thu */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          Doanh thu
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

      {/* Lô hàng */}
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
    </div>
  );
}
