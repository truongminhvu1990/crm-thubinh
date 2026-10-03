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
import EntityLink from "@/components/reports/entity/EntityLink";
import PermissionGate from "@/components/reports/overview/PermissionGate";
import { SkeletonCard, SkeletonTable } from "@/components/reports/overview/Skeleton";
import { useCanonicalFetch } from "@/components/reports/overview/useCanonicalFetch";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { usePermission } from "@/lib/hooks/useHasPermission";
import { currency } from "@/lib/reports/format";
import { formatDate } from "@/lib/utils";
import {
  EMPTY_VALUE,
  NO_ITEMS_ROW_LABEL,
  NO_SALES_DATA_TEXT,
  ORDER_LEVEL_DIFFERENCE_LABEL,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  recognitionLabel,
  unrecognizedReasonText,
} from "@/lib/reports/labels.vi";
import {
  METRIC_LABELS,
  SALES_METRIC_LABEL,
  SalesMetric,
  groupRecognizedByOrder,
  parseSalesMetric,
  parseSalesView,
  rangeParams,
  reconcile,
  salesDetailApiUrl,
  RecognizedOrderGroup,
} from "@/lib/reports/overviewUi";
import type { OverviewMetrics } from "@/lib/reports/overviewMetrics.service";
import type { OrderValueDetailRow, OrderProductDetailRow } from "@/lib/orders/orderValueSummary.service";
import type { RecognizedRevenueRow } from "@/lib/reports/reports.service";
import type { SoldOrderRow } from "@/lib/monthlySoldProducts/soldDataset";
import type { SoldItemlessOrder } from "@/lib/monthlySoldProducts/monthlySoldProducts.repository";
import type { MonthlySoldProductRow } from "@/types/monthlySoldProducts";

// Phase 1.4 / 1.5A - "Bán hàng": one screen for the three revenue groups + Đã bán.
// Cards = the canonical Overview (/api/dashboard/overview). Detail = the canonical drill-down endpoint of the clicked
// metric, same start/end, in either view (ĐƠN or SẢN PHẨM). The date range is the one shared Global Date Filter.
// Paid / remaining are ORDER-level figures: in the product view they repeat on every line of an order and are labelled
// "(cả đơn)" so nobody sums them.

interface OverviewResponse {
  overview: OverviewMetrics;
}
interface TotalDetail<R> {
  total: number;
  /** Product view of the two order-based metrics: the independent sum of the rows. */
  rowsTotal?: number;
  count: number;
  rows: R[];
}
interface SoldDetailResponse extends TotalDetail<unknown> {
  totals: { soldValue: number; recognizedRevenue: number; unrecognizedValue: number };
  itemlessOrders?: SoldItemlessOrder[];
}

const money = (v: number | null | undefined) => (v === null || v === undefined ? EMPTY_VALUE : currency.format(v));
const productText = (code: string | null, name: string | null) => [code, name].filter(Boolean).join(" · ") || EMPTY_VALUE;
const quantityText = (v: number | null | undefined) => (v === null || v === undefined ? EMPTY_VALUE : String(v));

const ORDER_COLUMNS: DrillColumn<OrderValueDetailRow>[] = [
  { header: "Số đơn", render: (r) => <EntityLink type="order" id={r.order_id}>{r.order_number}</EntityLink> },
  { header: "Ngày đơn", render: (r) => formatDate(r.order_date) },
  { header: "Khách hàng", render: (r) => <EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink> },
  { header: "Trạng thái đơn", render: (r) => orderStatusLabel(r.order_status) },
  { header: "Thanh toán", render: (r) => paymentStatusLabel(r.payment_status) },
  { header: "Giá trị đơn", render: (r) => money(r.order_total), align: "right" },
  { header: "Đã thu", render: (r) => money(r.paid_amount), align: "right" },
  { header: "Còn lại", render: (r) => money(r.remaining_amount), align: "right" },
];

const UNRECOGNIZED_COLUMNS: DrillColumn<OrderValueDetailRow>[] = [
  ...ORDER_COLUMNS,
  { header: "Lý do chưa ghi nhận", render: (r) => unrecognizedReasonText(r.unrecognized_reason) },
];

function productCell(r: OrderProductDetailRow) {
  if (r.kind === "no_items") return <span className="italic text-muted-foreground">{NO_ITEMS_ROW_LABEL}</span>;
  if (r.kind === "order_difference") return <span className="italic text-muted-foreground">{ORDER_LEVEL_DIFFERENCE_LABEL}</span>;
  return <EntityLink type="product" id={r.product_id}>{productText(r.product_code, r.product_name)}</EntityLink>;
}

const ORDER_PRODUCT_COLUMNS: DrillColumn<OrderProductDetailRow>[] = [
  { header: "Số đơn", render: (r) => <EntityLink type="order" id={r.order_id}>{r.order_number}</EntityLink> },
  { header: "Ngày đơn", render: (r) => formatDate(r.order_date) },
  { header: "Khách hàng", render: (r) => <EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink> },
  { header: "Sản phẩm", render: productCell },
  { header: "Danh mục", render: (r) => r.category ?? EMPTY_VALUE },
  { header: "Số lượng", render: (r) => quantityText(r.quantity), align: "right" },
  { header: "Đơn giá", render: (r) => money(r.unit_price), align: "right" },
  { header: "Giảm giá", render: (r) => money(r.discount), align: "right" },
  { header: "Giá trị dòng", render: (r) => money(r.amount), align: "right" },
  { header: "Trạng thái đơn", render: (r) => orderStatusLabel(r.order_status) },
  { header: "Thanh toán", render: (r) => paymentStatusLabel(r.payment_status) },
  { header: "Đã thu (cả đơn)", render: (r) => money(r.paid_amount), align: "right" },
  { header: "Còn lại (cả đơn)", render: (r) => money(r.remaining_amount), align: "right" },
];

const UNRECOGNIZED_PRODUCT_COLUMNS: DrillColumn<OrderProductDetailRow>[] = [
  ...ORDER_PRODUCT_COLUMNS,
  { header: "Lý do chưa ghi nhận", render: (r) => unrecognizedReasonText(r.unrecognized_reason) },
];

const RECOGNIZED_PRODUCT_COLUMNS: DrillColumn<RecognizedRevenueRow>[] = [
  { header: "Ngày ghi nhận", render: (r) => formatDate(r.recognition_date) },
  { header: "Số đơn", render: (r) => <EntityLink type="order" id={r.order_id}>{r.order_number ?? EMPTY_VALUE}</EntityLink> },
  { header: "Sản phẩm", render: (r) => <EntityLink type="product" id={r.product_id}>{productText(r.product_code, r.product_name)}</EntityLink> },
  { header: "Khách hàng", render: (r) => <EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink> },
  { header: "Quy tắc", render: (r) => r.rule_label },
  { header: "Doanh thu", render: (r) => money(r.amount), align: "right" },
];

const RECOGNIZED_ORDER_COLUMNS: DrillColumn<RecognizedOrderGroup>[] = [
  { header: "Ngày ghi nhận", render: (r) => formatDate(r.recognition_date) },
  { header: "Số đơn", render: (r) => <EntityLink type="order" id={r.order_id}>{r.order_number ?? "— (dữ liệu cũ, không gắn đơn)"}</EntityLink> },
  { header: "Khách hàng", render: (r) => <EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink> },
  { header: "Số dòng", render: (r) => r.lines, align: "right" },
  { header: "Quy tắc", render: (r) => r.rule_label },
  { header: "Doanh thu", render: (r) => money(r.amount), align: "right" },
];

const SOLD_ORDER_COLUMNS: DrillColumn<SoldOrderRow>[] = [
  { header: "Số đơn", render: (r) => <EntityLink type="order" id={r.order_id}>{r.order_number ?? "— (dữ liệu cũ)"}</EntityLink> },
  { header: "Ngày đơn", render: (r) => formatDate(r.order_date) },
  { header: "Khách hàng", render: (r) => <EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink> },
  { header: "Số sản phẩm", render: (r) => r.product_count, align: "right" },
  { header: "Trạng thái đơn", render: (r) => orderStatusLabel(r.order_status) },
  { header: "Thanh toán", render: (r) => paymentStatusLabel(r.payment_status) },
  { header: "Ghi nhận", render: (r) => recognitionLabel(r.recognition) },
  { header: "Giá trị đã bán", render: (r) => money(r.sold_value), align: "right" },
  { header: "Đã thu", render: (r) => money(r.amount_paid), align: "right" },
  { header: "Còn lại", render: (r) => money(r.remaining_balance), align: "right" },
  { header: "Hình thức thanh toán", render: (r) => paymentMethodLabel(r.payment_methods) },
];

const SOLD_PRODUCT_COLUMNS: DrillColumn<MonthlySoldProductRow>[] = [
  { header: "Ngày đơn", render: (r) => formatDate(r.sale_date) },
  { header: "Số đơn", render: (r) => <EntityLink type="order" id={r.order_id}>{r.order_number ?? "— (dữ liệu cũ)"}</EntityLink> },
  { header: "Khách hàng", render: (r) => <EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink> },
  { header: "Sản phẩm", render: (r) => <EntityLink type="product" id={r.product_id}>{productText(r.product_code, r.product_name)}</EntityLink> },
  { header: "Danh mục", render: (r) => r.product_category ?? EMPTY_VALUE },
  { header: "Số lượng", render: (r) => quantityText(r.quantity), align: "right" },
  { header: "Đơn giá", render: (r) => money(r.original_price), align: "right" },
  { header: "Giảm giá", render: (r) => money(r.discount), align: "right" },
  { header: "Giá bán", render: (r) => money(r.final_sale_price), align: "right" },
  { header: "Trạng thái đơn", render: (r) => orderStatusLabel(r.order_status) },
  { header: "Thanh toán", render: (r) => paymentStatusLabel(r.payment_status) },
  { header: "Ghi nhận", render: (r) => recognitionLabel(r.recognition) },
  { header: "Đã thu (cả đơn)", render: (r) => money(r.amount_paid), align: "right" },
  { header: "Còn lại (cả đơn)", render: (r) => money(r.remaining_balance), align: "right" },
  { header: "Hình thức thanh toán", render: (r) => paymentMethodLabel(r.payment_methods) },
];

const SOLD_ITEMLESS_COLUMNS: DrillColumn<SoldItemlessOrder>[] = [
  { header: "Số đơn", render: (r) => <EntityLink type="order" id={r.order_id}>{r.order_number}</EntityLink> },
  { header: "Ngày đơn", render: (r) => formatDate(r.order_date) },
  { header: "Khách hàng", render: (r) => <EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink> },
  { header: "Sản phẩm", render: () => <span className="italic text-muted-foreground">{NO_ITEMS_ROW_LABEL}</span> },
  { header: "Trạng thái đơn", render: (r) => orderStatusLabel(r.order_status) },
  { header: "Thanh toán", render: (r) => paymentStatusLabel(r.payment_status) },
  { header: "Giá trị đơn", render: (r) => money(r.total_amount), align: "right" },
  { header: "Đã thu", render: (r) => money(r.amount_paid), align: "right" },
  { header: "Còn lại", render: (r) => money(r.remaining_balance), align: "right" },
];

function SalesReport() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { range, label, ready } = useGlobalDateFilter();
  const access = usePermission("reports.view");
  const canView = access === "allowed";

  const metric = parseSalesMetric(search.get("metric"));
  const view = parseSalesView(search.get("view"));

  const select = useCallback(
    (next: { metric?: SalesMetric; view?: "orders" | "products" }) => {
      const p = new URLSearchParams(search.toString());
      p.set("metric", next.metric ?? metric);
      p.set("view", next.view ?? view);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [metric, pathname, router, search, view]
  );

  // No request until the stored period has been read AND access is known: no wasted default-period calls.
  const fetchable = canView && ready;
  const rangeKey = rangeParams(range).toString();
  const overviewUrl = fetchable ? `/api/dashboard/overview${rangeKey ? `?${rangeKey}` : ""}` : null;
  const detailUrl = fetchable ? salesDetailApiUrl(metric, range, view) : null;
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
  // In the product view of the order-based metrics the rows' own sum is what must equal the card.
  const detailTotal = detail ? (view === "products" && detail.rowsTotal !== undefined ? detail.rowsTotal : detail.total) : null;
  const status = reconcile(overviewTotal, detailTotal);
  const itemless = metric === "sold" && detail && "itemlessOrders" in detail ? detail.itemlessOrders ?? [] : [];

  const table = useMemo(() => {
    if (!detail) return null;
    const rows = detail.rows;
    const empty = NO_SALES_DATA_TEXT;
    switch (metric) {
      case "order-value":
        return view === "products" ? (
          <DrillDownTable columns={ORDER_PRODUCT_COLUMNS} rows={rows as OrderProductDetailRow[]} rowKey={(r) => r.row_key} emptyLabel={empty} testId="sales-detail-table" />
        ) : (
          <DrillDownTable columns={ORDER_COLUMNS} rows={rows as OrderValueDetailRow[]} rowKey={(r) => r.order_id} emptyLabel={empty} testId="sales-detail-table" />
        );
      case "unrecognized":
        return view === "products" ? (
          <DrillDownTable columns={UNRECOGNIZED_PRODUCT_COLUMNS} rows={rows as OrderProductDetailRow[]} rowKey={(r) => r.row_key} emptyLabel={empty} testId="sales-detail-table" />
        ) : (
          <DrillDownTable columns={UNRECOGNIZED_COLUMNS} rows={rows as OrderValueDetailRow[]} rowKey={(r) => r.order_id} emptyLabel={empty} testId="sales-detail-table" />
        );
      case "recognized-revenue":
        return view === "products" ? (
          <DrillDownTable columns={RECOGNIZED_PRODUCT_COLUMNS} rows={rows as RecognizedRevenueRow[]} rowKey={(r, i) => r.purchase_id ?? String(i)} emptyLabel={empty} testId="sales-detail-table" />
        ) : (
          <DrillDownTable columns={RECOGNIZED_ORDER_COLUMNS} rows={groupRecognizedByOrder(rows as RecognizedRevenueRow[])} rowKey={(r) => r.key} emptyLabel={empty} testId="sales-detail-table" />
        );
      case "sold":
        return view === "products" ? (
          <DrillDownTable columns={SOLD_PRODUCT_COLUMNS} rows={rows as MonthlySoldProductRow[]} rowKey={(r) => r.line_key} emptyLabel={empty} testId="sales-detail-table" />
        ) : (
          <DrillDownTable columns={SOLD_ORDER_COLUMNS} rows={rows as SoldOrderRow[]} rowKey={(r, i) => r.order_id ?? `legacy-${i}`} emptyLabel={empty} testId="sales-detail-table" />
        );
    }
  }, [detail, metric, view]);

  const overviewLoading = !m && !overviewState.error;
  const detailLoading = !detail && !detailState.error;

  return (
    <PermissionGate state={access} title="Bán hàng">
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
          {overviewLoading ? (
            <>
              <SkeletonCard title={METRIC_LABELS.totalOrderValue} />
              <SkeletonCard title={METRIC_LABELS.recognizedRevenue} />
              <SkeletonCard title={METRIC_LABELS.unrecognizedValue} />
            </>
          ) : (
            <>
              <OverviewMetricCard
                testId="sales-card-order-value"
                title={METRIC_LABELS.totalOrderValue}
                value={money(m?.totalOrderValue.value)}
                hint={m ? `${m.totalOrderValue.orderCount} đơn (không tính đơn Đã mất)` : undefined}
                icon={<ClipboardList className="h-6 w-6" />}
                active={metric === "order-value"}
                onSelect={() => select({ metric: "order-value" })}
              />
              <OverviewMetricCard
                testId="sales-card-recognized"
                title={METRIC_LABELS.recognizedRevenue}
                value={money(m?.recognizedRevenue.value)}
                hint={m ? `Đơn Hoàn thành + Đã thanh toán ${money(m.recognizedRevenue.linkedValue)} + dữ liệu cũ ${money(m.recognizedRevenue.legacyValue)}` : undefined}
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
            </>
          )}
        </section>

        <section aria-label="Đã bán">
          {overviewLoading ? (
            <SkeletonCard title={METRIC_LABELS.sold} />
          ) : (
            <OverviewMetricCard
              testId="sales-card-sold"
              title={METRIC_LABELS.sold}
              value={money(m?.sold?.value)}
              hint={m?.sold ? `${m.sold.orderCount} đơn · ${m.sold.lineCount} sản phẩm · đã ghi nhận ${money(m.sold.recognizedValue)} + chưa ghi nhận ${money(m.sold.unrecognizedValue)}` : undefined}
              icon={<PackageCheck className="h-6 w-6" />}
              active={metric === "sold"}
              onSelect={() => select({ metric: "sold" })}
            />
          )}
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
                { value: "products", label: "Xem theo SẢN PHẨM" },
              ]}
            />
          </div>

          {view === "products" && (metric === "order-value" || metric === "unrecognized") && (
            <p className="text-xs text-muted-foreground" data-testid="sales-product-view-note">
              Đã thu / Còn lại tính theo cả đơn và lặp lại ở mỗi dòng sản phẩm của đơn — không cộng các cột này. Đơn chưa có sản phẩm hiện một dòng “{NO_ITEMS_ROW_LABEL}” mang giá trị của đơn.
            </p>
          )}

          {detailState.error && <p className="text-sm text-destructive" role="alert">{detailState.error}</p>}
          {overviewState.error && <p className="text-sm text-destructive" role="alert">{overviewState.error}</p>}

          {detail && (
            <p className="flex items-center gap-2 text-sm" data-testid="sales-reconcile">
              {status === "match" ? (
                <>
                  <CircleCheck className="h-4 w-4 text-emerald-600" />
                  <span>
                    Tổng chi tiết {money(detailTotal)} ({detail.count} dòng) = tổng quan {money(overviewTotal)}
                  </span>
                </>
              ) : status === "mismatch" ? (
                <>
                  <TriangleAlert className="h-4 w-4 text-destructive" />
                  <span className="font-medium text-destructive">
                    Chi tiết {money(detailTotal)} KHÁC tổng quan {money(overviewTotal)} — cần báo cáo, không tự điều chỉnh
                  </span>
                </>
              ) : null}
            </p>
          )}

          {detailLoading ? <SkeletonTable columns={view === "products" ? 8 : 6} /> : table}

          {metric === "sold" && detail && itemless.length > 0 && (
            <div className="space-y-2" data-testid="sales-itemless">
              <h3 className="text-sm font-semibold text-foreground">
                Đơn đã bán nhưng chưa có sản phẩm ({itemless.length} đơn)
              </h3>
              <p className="text-xs text-muted-foreground">
                Các đơn này thuộc phạm vi “Đã bán” nhưng không có dòng sản phẩm nên không được cộng vào tổng “Đã bán” ở trên.
              </p>
              <DrillDownTable columns={SOLD_ITEMLESS_COLUMNS} rows={itemless} rowKey={(r) => r.order_id} testId="sales-itemless-table" />
            </div>
          )}

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
    </PermissionGate>
  );
}

export default function SalesReportPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={4} columns={4} />}>
      <SalesReport />
    </Suspense>
  );
}
