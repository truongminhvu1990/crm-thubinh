"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Hourglass, PackageOpen, Info } from "lucide-react";
import ReconcileLine from "@/components/reports/overview/ReconcileLine";
import OverviewMetricCard from "@/components/reports/overview/OverviewMetricCard";
import ViewToggle from "@/components/reports/overview/ViewToggle";
import DrillDownTable, { DrillColumn } from "@/components/reports/overview/DrillDownTable";
import { useCanonicalFetch } from "@/components/reports/overview/useCanonicalFetch";
import { useHasPermission } from "@/lib/hooks/useHasPermission";
import { currency } from "@/lib/reports/format";
import { formatDate } from "@/lib/utils";
import { INVENTORY_CURRENT_STATE_LABEL, METRIC_LABELS, InventoryView, parseInventoryView, reconcileView } from "@/lib/reports/overviewUi";
import type { OverviewMetrics } from "@/lib/reports/overviewMetrics.service";
import type { HeldInventoryRow, InventoryProductDetailRow } from "@/lib/reports/inventoryValue.service";

// Phase 1.4 - "Hàng hóa": one screen, [Hàng đang giữ] [Hàng còn lại].
// Both are CURRENT inventory state (Held = products.status Reserved,
// Remaining = Available, valued at products.sale_price). There is no
// historical inventory snapshot, so no date filter is applied here and none
// is shown. A product without sale_price is counted but never valued.

interface InventoryDetailResponse<R> {
  total: number;
  count: number;
  summary: { count: number; value: number; missingPriceCount: number };
  rows: R[];
}

const unpriced = <span className="font-medium text-amber-600">Chưa định giá</span>;
const price = (v: number | null) => (v === null ? unpriced : currency.format(v));

const PRODUCT_COLUMNS: DrillColumn<InventoryProductDetailRow>[] = [
  { header: "Mã sản phẩm", render: (r) => r.product_code ?? "—" },
  { header: "Tên", render: (r) => r.product_name ?? "—" },
  { header: "Danh mục", render: (r) => r.category ?? "—" },
  { header: "Nhân viên", render: (r) => r.salesperson ?? "—" },
  { header: "Giá bán", render: (r) => price(r.sale_price), align: "right" },
];

const HELD_COLUMNS: DrillColumn<HeldInventoryRow>[] = [
  ...(PRODUCT_COLUMNS as DrillColumn<HeldInventoryRow>[]),
  { header: "Đơn đang giữ", render: (r) => (r.holding_order ? r.holding_order.order_number : <span className="text-amber-600">Không có đơn mở</span>) },
  { header: "Khách hàng", render: (r) => r.holding_order?.customer_name ?? "—" },
  { header: "Ngày đơn", render: (r) => (r.holding_order ? formatDate(r.holding_order.order_date) : "—") },
];

function InventoryReport() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const canView = useHasPermission("reports.view");
  const view = parseInventoryView(search.get("view"));

  const setView = useCallback(
    (next: InventoryView) => router.replace(`${pathname}?view=${next}`, { scroll: false }),
    [pathname, router]
  );

  const overviewState = useCanonicalFetch<{ overview: OverviewMetrics }>(canView ? "/api/dashboard/overview" : null);
  const detailState = useCanonicalFetch<InventoryDetailResponse<InventoryProductDetailRow | HeldInventoryRow>>(
    canView ? `/api/reports/overview/${view === "held" ? "held-inventory" : "remaining-inventory"}` : null
  );

  if (!canView) {
    return (
      <div className="pb-8">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Hàng hóa</h1>
        <p className="mt-4 text-muted-foreground">Bạn không có quyền xem báo cáo</p>
      </div>
    );
  }

  const o = overviewState.data?.overview ?? null;
  const bucket = o ? (view === "held" ? o.held : o.remaining) : null;
  const detail = detailState.data;
  // Only "mismatch" when BOTH numbers are really available and really differ; a not-yet-loaded (or failed) overview is
  // never a discrepancy.
  const status = reconcileView(bucket ? bucket.value : null, detail ? detail.total : null, overviewState.error !== null || (o !== null && bucket === null));
  const heldUnlinked = view === "held" && detail ? (detail.rows as HeldInventoryRow[]).filter((r) => !r.holding_order).length : 0;
  const hint = (b: { count: number; missingPriceCount: number } | null | undefined) =>
    b ? `${b.count} sản phẩm${b.missingPriceCount ? ` · ${b.missingPriceCount} chưa định giá (không tính vào giá trị)` : ""}` : undefined;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Hàng hóa</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Tồn kho hiện tại, định giá theo giá bán của sản phẩm.</p>
        <p className="mt-1.5 text-sm font-medium text-foreground" data-testid="inventory-current-label">
          {INVENTORY_CURRENT_STATE_LABEL}
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground" data-testid="inventory-current-note">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Đây là trạng thái tồn kho hiện tại, không phụ thuộc bộ lọc ngày (hệ thống chưa lưu ảnh chụp tồn kho theo thời điểm).
      </p>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OverviewMetricCard
          testId="inventory-card-held"
          title={METRIC_LABELS.held}
          value={o?.held ? currency.format(o.held.value) : "—"}
          hint={hint(o?.held)}
          icon={<Hourglass className="h-6 w-6" />}
          active={view === "held"}
          onSelect={() => setView("held")}
        />
        <OverviewMetricCard
          testId="inventory-card-remaining"
          title={METRIC_LABELS.remaining}
          value={o?.remaining ? currency.format(o.remaining.value) : "—"}
          hint={hint(o?.remaining)}
          icon={<PackageOpen className="h-6 w-6" />}
          active={view === "remaining"}
          onSelect={() => setView("remaining")}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground" data-testid="inventory-detail-title">
            Chi tiết: {view === "held" ? METRIC_LABELS.held : METRIC_LABELS.remaining}
          </h2>
          <ViewToggle
            testId="inventory-view-toggle"
            value={view}
            onChange={setView}
            options={[
              { value: "held", label: METRIC_LABELS.held },
              { value: "remaining", label: METRIC_LABELS.remaining },
            ]}
          />
        </div>

        {detailState.error && <p className="text-sm text-destructive">{detailState.error}</p>}

        {detail && (
          <div className="space-y-1 text-sm" data-testid="inventory-reconcile">
            <ReconcileLine view={status} detailTotal={detail.total} overviewTotal={bucket ? bucket.value : null} countLabel={`${detail.count} sản phẩm`} />
            {detail.summary.missingPriceCount > 0 && (
              <p className="text-amber-700" data-testid="inventory-missing-price">
                {detail.summary.missingPriceCount} sản phẩm chưa có giá bán: vẫn được đếm, nhưng không được tính vào giá trị.
              </p>
            )}
            {heldUnlinked > 0 && (
              <p className="text-amber-700">{heldUnlinked} sản phẩm đang giữ nhưng không có đơn mở tương ứng (vẫn tính là Hàng đang giữ theo trạng thái sản phẩm).</p>
            )}
          </div>
        )}

        {detailState.loading && !detail ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : detail ? (
          view === "held" ? (
            <DrillDownTable columns={HELD_COLUMNS} rows={detail.rows as HeldInventoryRow[]} rowKey={(r) => r.product_id} testId="inventory-detail-table" />
          ) : (
            <DrillDownTable columns={PRODUCT_COLUMNS} rows={detail.rows as InventoryProductDetailRow[]} rowKey={(r) => r.product_id} testId="inventory-detail-table" />
          )
        ) : null}
      </section>
    </div>
  );
}

export default function InventoryReportPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-muted-foreground">Đang tải…</div>}>
      <InventoryReport />
    </Suspense>
  );
}
