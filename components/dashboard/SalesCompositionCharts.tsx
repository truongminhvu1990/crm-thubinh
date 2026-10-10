"use client";

import { DateRange } from "@/lib/dateFilter";
import { useCanonicalFetch } from "@/components/reports/overview/useCanonicalFetch";
import { currency, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import type { SalesCompositionResponse } from "@/lib/reports/analytics/composition.service";
import { categoryLedgerHref, priceBandLedgerHref, productLedgerHref } from "@/lib/reports/analytics/compositionHref";
import ChartCard from "./ChartCard";
import HorizontalBarChart, { BarDatum } from "./HorizontalBarChart";
import { formatShare } from "./chartFormat";

// Dashboard biểu đồ - Wave B (F4 Top sản phẩm, F5 Top loại sản phẩm, F8 Nhóm giá). ONE request to /api/reports/analytics/composition feeds all
// three cards, so they always describe the same recognized rows (BR-001 / BR-002, by sale_date) as the KPI "Doanh thu đã ghi nhận".
// useCanonicalFetch returns data only for the CURRENT url, so a previous period's bars are never drawn under a new period.

const VALUE_LABEL = "Doanh thu đã ghi nhận";
const BASIS = "Theo ngày bán · Doanh thu đã ghi nhận";

interface Props {
  range: DateRange | null;
  ready: boolean;
}

const lines = (count: number, share: number) => [`Số giao dịch: ${count}`, `Tỷ trọng: ${formatShare(share)}`];

export default function SalesCompositionCharts({ range, ready }: Props) {
  const params = new URLSearchParams();
  if (range) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  const query = params.toString();
  const { data, loading, error } = useCanonicalFetch<SalesCompositionResponse>(ready ? `/api/reports/analytics/composition${query ? `?${query}` : ""}` : null);
  const isLoading = loading || !ready;
  const empty = !!data && data.count === 0;

  const productBars: BarDatum[] = data
    ? [
        ...data.topProducts.rows.map((r) => ({ key: r.key, label: r.label, value: r.value, lines: lines(r.count, r.share), href: productLedgerHref(r.productId, range) })),
        ...(data.topProducts.others.productCount > 0
          ? [{ key: "others", label: `Khác (${data.topProducts.others.productCount} sản phẩm)`, value: data.topProducts.others.value, lines: lines(data.topProducts.others.count, data.topProducts.others.share), href: null }]
          : []),
      ]
    : [];
  const categoryBars: BarDatum[] = data
    ? data.categories.map((c) => ({ key: c.category ?? "uncategorized", label: c.label, value: c.value, lines: lines(c.count, c.share), href: categoryLedgerHref(c.category, range) }))
    : [];
  const bandBars: BarDatum[] = data
    ? data.priceBands.map((b) => ({ key: b.key, label: b.label, value: b.value, lines: lines(b.count, b.share), href: priceBandLedgerHref(b, range) }))
    : [];
  const noPrice = data?.priceBands.find((b) => b.key === "noPrice");

  const total = data ? currency.format(data.total) : "";

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="dashboard-sales-composition">
      <ChartCard
        className="lg:col-span-2"
        testId="dashboard-top-products"
        title="Top sản phẩm"
        basis={`${BASIS} · xếp hạng theo giá trị`}
        loading={isLoading}
        error={error}
        empty={empty}
        emptyText={NO_SALES_DATA_MESSAGE}
      >
        <HorizontalBarChart data={productBars} valueLabel={VALUE_LABEL} ariaLabel={`Biểu đồ cột ngang: ${productBars.length} nhóm sản phẩm theo ${VALUE_LABEL.toLowerCase()}, tổng ${total}`} testId="top-products-chart" />
        <p className="mt-2 text-xs text-muted-foreground" data-testid="top-products-total">
          Tổng trong kỳ: <span className="font-semibold text-foreground">{total}</span> (khớp thẻ Doanh thu đã ghi nhận) · {data?.topProducts.distinctProducts ?? 0} sản phẩm
        </p>
      </ChartCard>

      <ChartCard testId="dashboard-top-categories" title="Top loại sản phẩm" basis={`${BASIS} · theo danh mục`} loading={isLoading} error={error} empty={empty} emptyText={NO_SALES_DATA_MESSAGE}>
        <HorizontalBarChart data={categoryBars} valueLabel={VALUE_LABEL} ariaLabel={`Biểu đồ cột ngang: ${categoryBars.length} loại sản phẩm theo ${VALUE_LABEL.toLowerCase()}, tổng ${total}`} testId="top-categories-chart" />
        <p className="mt-2 text-xs text-muted-foreground" data-testid="top-categories-total">
          Tổng trong kỳ: <span className="font-semibold text-foreground">{total}</span>
        </p>
      </ChartCard>

      <ChartCard testId="dashboard-price-bands" title="Nhóm giá" basis={`${BASIS} · theo giá bán thực tế của từng dòng`} loading={isLoading} error={error} empty={empty} emptyText={NO_SALES_DATA_MESSAGE}>
        <HorizontalBarChart data={bandBars} valueLabel={VALUE_LABEL} ariaLabel={`Biểu đồ cột ngang: doanh thu đã ghi nhận theo ${bandBars.length} nhóm giá, tổng ${total}`} testId="price-bands-chart" />
        {noPrice && (
          <p className="mt-2 text-xs text-amber-700" data-testid="price-bands-no-price">
            {noPrice.count} dòng không có giá hợp lệ ({currency.format(noPrice.value)}) vẫn được tính vào tổng, nhưng không thuộc nhóm giá nào.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground" data-testid="price-bands-total">
          Tổng trong kỳ: <span className="font-semibold text-foreground">{total}</span>
        </p>
      </ChartCard>
    </div>
  );
}
