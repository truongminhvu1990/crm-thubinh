"use client";

import { Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Wallet, PiggyBank, PackageCheck, TriangleAlert, CircleCheck } from "lucide-react";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import OverviewMetricCard from "@/components/reports/overview/OverviewMetricCard";
import ViewToggle from "@/components/reports/overview/ViewToggle";
import DrillDownTable, { DrillColumn } from "@/components/reports/overview/DrillDownTable";
import { useCanonicalFetch } from "@/components/reports/overview/useCanonicalFetch";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { useHasPermission } from "@/lib/hooks/useHasPermission";
import { currency } from "@/lib/reports/format";
import { formatDate } from "@/lib/utils";
import {
  METRIC_LABELS,
  SALES_METRIC_LABEL,
  SalesMetric,
  groupRecognizedByOrder,
  parseSalesMetric,
  parseSalesView,
  productViewDisabledNote,
  rangeParams,
  reconcile,
  salesDetailApiUrl,
  supportsProductView,
  RecognizedOrderGroup,
} from "@/lib/reports/overviewUi";
import type { OverviewMetrics } from "@/lib/reports/overviewMetrics.service";
import type { OrderValueDetailRow } from "@/lib/orders/orderValueSummary.service";
import type { RecognizedRevenueRow } from "@/lib/reports/reports.service";
import type { SoldOrderRow } from "@/lib/monthlySoldProducts/soldDataset";
import type { MonthlySoldProductRow } from "@/types/monthlySoldProducts";

// Phase 1.4 - "Bán hàng": one screen for the three revenue groups + Đã bán.
// Cards = the canonical Overview (/api/dashboard/overview). Detail = the
// canonical drill-down endpoint of the clicked metric, same start/end. The
// date range is the one shared Global Date Filter - no per-card date logic.

interface OverviewResponse {
  overview: OverviewMetrics;
}
interface TotalDetail<R> {
  total: number;
  count: number;
  rows: R[];
}
interface SoldDetailResponse {
  totals: { soldValue: number; recognizedRevenue: number; unrecognizedValue: number };
  total: number;
  count: number;
  rows: unknown[];
}

const ORDER_COLUMNS: DrillColumn<OrderValueDetailRow>[] = [
  { header: "Số đơn", render: (r) => r.order_number },
  { header: "Ngày đơn", render: (r) => formatDate(r.order_date) },
  { header: "Khách hàng", render: (r) => r.customer_name },
  { header: "Trạng thái đơn", render: (r) => r.order_status },
  { header: "Thanh toán", render: (r) => r.payment_status },
  { header: "Giá trị đơn", render: (r) => currency.format(r.order_total), align: "right" },
  { header: "Đã thu", render: (r) => currency.format(r.paid_amount), align: "right" },
  { header: "Còn lại", render: (r) => currency.format(r.remaining_amount), align: "right" },
];

const UNRECOGNIZED_COLUMNS: DrillColumn<OrderValueDetailRow>[] = [
  ...ORDER_COLUMNS,
  { header: "Lý do chưa ghi nhận", render: (r) => (r.unrecognized_reason ? String(r.unrecognized_reason) : "—") },
];

const RECOGNIZED_PRODUCT_COLUMNS: DrillColumn<RecognizedRevenueRow>[] = [
  { header: "Ngày ghi nhận", render: (r) => formatDate(r.recognition_date) },
  { header: "Số đơn", render: (r) => r.order_number ?? "—" },
  { header: "Sản phẩm", render: (r) => [r.product_code, r.product_name].filter(Boolean).join(" · ") || "—" },
  { header: "Khách hàng", render: (r) => r.customer_name },
  { header: "Quy tắc", render: (r) => r.rule_label },
  { header: "Doanh thu", render: (r) => currency.format(r.amount), align: "right" },
];

const RECOGNIZED_ORDER_COLUMNS: DrillColumn<RecognizedOrderGroup>[] = [
  { header: "Ngày ghi nhận", render: (r) => formatDate(r.recognition_date) },
  { header: "Số đơn", render: (r) => r.order_number ?? "— (dữ liệu cũ, không gắn đơn)" },
  { header: "Khách hàng", render: (r) => r.customer_name },
  { header: "Số dòng", render: (r) => r.lines, align: "right" },
  { header: "Quy tắc", render: (r) => r.rule_label },
  { header: "Doanh thu", render: (r) => currency.format(r.amount), align: "right" },
];

const SOLD_ORDER_COLUMNS: DrillColumn<SoldOrderRow>[] = [
  { header: "Số đơn", render: (r) => r.order_number ?? "— (dữ liệu cũ)" },
  { header: "Ngày", render: (r) => formatDate(r.order_date) },
  { header: "Khách hàng", render: (r) => r.customer_name },
  { header: "Số sản phẩm", render: (r) => r.product_count, align: "right" },
  { header: "Ghi nhận", render: (r) => (r.recognition === "recognized" ? "Đã ghi nhận" : "Chưa ghi nhận") },
  { header: "Giá trị đã bán", render: (r) => currency.format(r.sold_value), align: "right" },
];

const SOLD_PRODUCT_COLUMNS: DrillColumn<MonthlySoldProductRow>[] = [
  { header: "Ngày", render: (r) => formatDate(r.sale_date) },
  { header: "Số đơn", render: (r) => r.order_number ?? "— (dữ liệu cũ)" },
  { header: "Sản phẩm", render: (r) => [r.product_code, r.product_name].filter(Boolean).join(" · ") || "—" },
  { header: "Ghi nhận", render: (r) => (r.recognition === "recognized" ? "Đã ghi nhận" : "Chưa ghi nhận") },
  { header: "Giá bán", render: (r) => currency.format(r.final_sale_price), align: "right" },
];

function SalesReport() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { range, label } = useGlobalDateFilter();
  const canView = useHasPermission("reports.view");

  const metric = parseSalesMetric(search.get("metric"));
  const requestedView = parseSalesView(search.get("view"));
  // A metric with no product lines in its canonical detail always shows by order.
  const view = supportsProductView(metric) ? requestedView : "orders";

  const select = useCallback(
    (next: { metric?: SalesMetric; view?: "orders" | "products" }) => {
      const p = new URLSearchParams(search.toString());
      const m = next.metric ?? metric;
      p.set("metric", m);
      p.set("view", supportsProductView(m) ? next.view ?? requestedView : "orders");
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [metric, pathname, requestedView, router, search]
  );

  const rangeKey = rangeParams(range).toString();
  const overviewUrl = canView ? `/api/dashboard/overview${rangeKey ? `?${rangeKey}` : ""}` : null;
  const detailUrl = canView ? salesDetailApiUrl(metric, range, view) : null;
  const overviewState = useCanonicalFetch<OverviewResponse>(overviewUrl);
  const detailState = useCanonicalFetch<TotalDetail<unknown> | SoldDetailResponse>(detailUrl);

  const m = overviewState.data?.overview ?? null;
  const overviewTotal = m
    ? {
        "order-value": m.totalOrderValue.value,
        "recognized-revenue": m.recognizedRevenue.value,
        unrecognized: m.unrecognizedValue.value,
        sold: m.sold?.value ?? null,
      }[metric]
    : null;
  const detail = detailState.data;
  const status = reconcile(overviewTotal, detail ? detail.total : null);

  const table = useMemo(() => {
    if (!detail) return null;
    const rows = detail.rows;
    switch (metric) {
      case "order-value":
        return <DrillDownTable columns={ORDER_COLUMNS} rows={rows as OrderValueDetailRow[]} rowKey={(r) => r.order_id} testId="sales-detail-table" />;
      case "unrecognized":
        return <DrillDownTable columns={UNRECOGNIZED_COLUMNS} rows={rows as OrderValueDetailRow[]} rowKey={(r) => r.order_id} testId="sales-detail-table" />;
      case "recognized-revenue":
        return view === "products" ? (
          <DrillDownTable columns={RECOGNIZED_PRODUCT_COLUMNS} rows={rows as RecognizedRevenueRow[]} rowKey={(r, i) => r.purchase_id ?? String(i)} testId="sales-detail-table" />
        ) : (
          <DrillDownTable columns={RECOGNIZED_ORDER_COLUMNS} rows={groupRecognizedByOrder(rows as RecognizedRevenueRow[])} rowKey={(r) => r.key} testId="sales-detail-table" />
        );
      case "sold":
        return view === "products" ? (
          <DrillDownTable columns={SOLD_PRODUCT_COLUMNS} rows={rows as MonthlySoldProductRow[]} rowKey={(r) => r.line_key} testId="sales-detail-table" />
        ) : (
          <DrillDownTable columns={SOLD_ORDER_COLUMNS} rows={rows as SoldOrderRow[]} rowKey={(r, i) => r.order_id ?? `legacy-${i}`} testId="sales-detail-table" />
        );
    }
  }, [detail, metric, view]);

  if (!canView) {
    return (
      <div className="pb-8">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Bán hàng</h1>
        <p className="mt-4 text-muted-foreground">Bạn không có quyền xem báo cáo</p>
      </div>
    );
  }

  const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : currency.format(v));

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Bán hàng</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Kỳ: {label}. Ngày đơn hàng là cơ sở tính; bấm vào một chỉ số để xem chi tiết.
          </p>
          <div className="mt-1.5">
            <PageViewingLabel />
          </div>
        </div>
        <GlobalDateFilter />
      </div>

      <section aria-label="Ba nhóm giá trị" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <OverviewMetricCard
          testId="sales-card-order-value"
          title={METRIC_LABELS.totalOrderValue}
          value={money(m?.totalOrderValue.value)}
          hint={m ? `${m.totalOrderValue.orderCount} đơn (không tính Lost)` : undefined}
          icon={<ClipboardList className="h-6 w-6" />}
          active={metric === "order-value"}
          onSelect={() => select({ metric: "order-value" })}
        />
        <OverviewMetricCard
          testId="sales-card-recognized"
          title={METRIC_LABELS.recognizedRevenue}
          value={money(m?.recognizedRevenue.value)}
          hint={m ? `Đơn Completed + Paid ${money(m.recognizedRevenue.linkedValue)} + dữ liệu cũ ${money(m.recognizedRevenue.legacyValue)}` : undefined}
          icon={<Wallet className="h-6 w-6" />}
          active={metric === "recognized-revenue"}
          onSelect={() => select({ metric: "recognized-revenue" })}
        />
        <OverviewMetricCard
          testId="sales-card-unrecognized"
          title={METRIC_LABELS.unrecognizedValue}
          value={money(m?.unrecognizedValue.value)}
          hint={m ? `${m.unrecognizedValue.orderCount} đơn · tính riêng từ đơn hàng, không phải hiệu của hai chỉ số bên cạnh` : undefined}
          icon={<PiggyBank className="h-6 w-6" />}
          active={metric === "unrecognized"}
          onSelect={() => select({ metric: "unrecognized" })}
        />
      </section>

      <section aria-label="Đã bán">
        <OverviewMetricCard
          testId="sales-card-sold"
          title={METRIC_LABELS.sold}
          value={money(m?.sold?.value)}
          hint={m?.sold ? `${m.sold.orderCount} đơn · ${m.sold.lineCount} sản phẩm · đã ghi nhận ${money(m.sold.recognizedValue)} + chưa ghi nhận ${money(m.sold.unrecognizedValue)}` : undefined}
          icon={<PackageCheck className="h-6 w-6" />}
          active={metric === "sold"}
          onSelect={() => select({ metric: "sold" })}
        />
      </section>

      <section className="space-y-3" aria-label="Chi tiết">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground" data-testid="sales-detail-title">
            Chi tiết: {SALES_METRIC_LABEL[metric]}
          </h2>
          <ViewToggle
            testId="sales-view-toggle"
            value={view}
            onChange={(v) => select({ view: v })}
            options={[
              { value: "orders", label: "Xem theo ĐƠN" },
              {
                value: "products",
                label: "Xem theo SẢN PHẨM",
                disabled: !supportsProductView(metric),
                title: productViewDisabledNote(metric) ?? undefined,
                disabledReason: productViewDisabledNote(metric) ?? undefined,
              },
            ]}
          />
        </div>

        {detailState.error && <p className="text-sm text-destructive">{detailState.error}</p>}
        {overviewState.error && <p className="text-sm text-destructive">{overviewState.error}</p>}

        {detail && (
          <p className="flex items-center gap-2 text-sm" data-testid="sales-reconcile">
            {status === "match" ? (
              <>
                <CircleCheck className="h-4 w-4 text-emerald-600" />
                <span>
                  Tổng chi tiết {money(detail.total)} ({detail.count} dòng) = tổng quan {money(overviewTotal)}
                </span>
              </>
            ) : status === "mismatch" ? (
              <>
                <TriangleAlert className="h-4 w-4 text-destructive" />
                <span className="font-medium text-destructive">
                  Chi tiết {money(detail.total)} KHÁC tổng quan {money(overviewTotal)} — cần báo cáo, không tự điều chỉnh
                </span>
              </>
            ) : null}
          </p>
        )}

        {detailState.loading && !detail ? <p className="text-sm text-muted-foreground">Đang tải…</p> : table}

        {metric === "sold" && (
          <p className="text-xs text-muted-foreground">
            Cần lọc theo nhân viên/danh mục hoặc quản lý cột?{" "}
            <Link href="/reports/monthly-sold-products" className="text-primary hover:underline">
              Mở báo cáo Sản phẩm đã bán theo tháng
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}

export default function SalesReportPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-muted-foreground">Đang tải…</div>}>
      <SalesReport />
    </Suspense>
  );
}
