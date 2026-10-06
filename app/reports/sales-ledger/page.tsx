"use client";

import { BusinessTime } from "@/lib/businessTime";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, ShieldCheck } from "lucide-react";
import { SalesLedgerFilters as Filters, SalesLedgerRow, SalesLedgerSummary as Summary } from "@/types/salesLedger";
import { withGlobalDateRange } from "@/lib/salesLedger/salesLedger.service";
import { exportSalesLedgerToExcel } from "@/lib/salesLedger/salesLedgerExport";
import { getCostPricesByProductIds } from "@/lib/salesLedger/salesLedger.repository";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { useIsOwnerOrManager } from "@/lib/hooks/useIsOwnerOrManager";
import { useReportColumns } from "@/lib/reportColumns/useReportColumns";
import { getProductById } from "@/lib/product.service";
import { addDaysToDateStr } from "@/lib/dateFilter";
import { DrilldownView, activeDrilldownRange, parseDrilldownRange } from "@/lib/reports/drilldown";
import { formatDate } from "@/lib/utils";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import ScopeIndicator from "@/components/shared/ScopeIndicator";
import Button from "@/components/ui/Button";
import SalesLedgerSummary from "@/components/salesLedger/SalesLedgerSummary";
import SalesLedgerFilters from "@/components/salesLedger/SalesLedgerFilters";
import SalesLedgerTable from "@/components/salesLedger/SalesLedgerTable";
import ColumnManager from "@/components/shared/ColumnManager";
import { buildSalesLedgerExportColumns, exportNeedsCost } from "@/components/salesLedger/exportColumns";
import SalesLedgerPagination from "@/components/salesLedger/SalesLedgerPagination";
import VerificationFilters from "@/components/verification/VerificationFilters";

const DEFAULT_FILTERS: Filters = {
  sortField: "sale_date",
  sortDirection: "desc",
  page: 1,
};

const EMPTY_SUMMARY: Summary = { totalTransactions: 0, totalRevenue: 0, totalCommission: 0, averageSale: 0 };

function buildSalesLedgerQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.customer) params.set("customer", filters.customer);
  if (filters.salespersonId) params.set("salespersonId", filters.salespersonId);
  if (filters.productCode) params.set("productCode", filters.productCode);
  if (filters.productName) params.set("productName", filters.productName);
  if (filters.productCategory) params.set("productCategory", filters.productCategory);
  if (filters.minAmount !== undefined) params.set("minAmount", String(filters.minAmount));
  if (filters.maxAmount !== undefined) params.set("maxAmount", String(filters.maxAmount));
  if (filters.commissionStatus) params.set("commissionStatus", filters.commissionStatus);
  if (filters.entrySource) params.set("entrySource", filters.entrySource);
  if (filters.createdBy) params.set("createdBy", filters.createdBy);
  if (filters.updatedBy) params.set("updatedBy", filters.updatedBy);
  if (filters.duplicateOnly) params.set("duplicateOnly", "true");
  params.set("sortField", filters.sortField);
  params.set("sortDirection", filters.sortDirection);
  params.set("page", String(filters.page));
  return params.toString();
}

export default function SalesLedgerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      }
    >
      <SalesLedgerPageInner />
    </Suspense>
  );
}

function SalesLedgerPageInner() {
  // Sales Ledger MUST always use the same selected period as
  // Dashboard/Reports - reuses the exact same shared context, no local
  // date state of its own.
  const { range, ready, periodKey } = useGlobalDateFilter();
  const searchParams = useSearchParams();

  // Feature 8 (Drill-down) - a report card in /reports links here with
  // matching filters in the query string (see lib/reports/drilldown.ts).
  // Non-date filters are folded into the initial state itself (computed
  // once, from the URL present at first mount) rather than an effect that
  // patches them in afterward - after this initial render, this page's own
  // filter UI is the single source of truth, exactly like arriving with no
  // query string at all.
  const [localFilters, setLocalFilters] = useState<Filters>(() => {
    const customer = searchParams.get("customer");
    const productCode = searchParams.get("productCode");
    const productCategory = searchParams.get("productCategory");
    const salespersonId = searchParams.get("salespersonId");
    if (!customer && !productCode && !productCategory && !salespersonId) return DEFAULT_FILTERS;
    return {
      ...DEFAULT_FILTERS,
      customer: customer || undefined,
      productCode: productCode || undefined,
      productCategory: productCategory || undefined,
      salespersonId: salespersonId || undefined,
    };
  });
  const [rows, setRows] = useState<SalesLedgerRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<Summary>({
    totalTransactions: 0,
    totalRevenue: 0,
    totalCommission: 0,
    averageSale: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Simple Profit Calculation Package, Part 5: Owner/Manager see Cost/
  // Profit per row; Sales don't. Cost isn't on the sales_ledger view itself
  // (only sale_amount/commission), so it's looked up from the existing
  // products table for just the current page's rows - bounded to at most
  // SALES_LEDGER_PAGE_SIZE distinct products, computed in memory, nothing
  // stored, nothing added to the view/query.
  const canViewCostAndProfit = useIsOwnerOrManager();
  const [costByProductId, setCostByProductId] = useState<Map<string, number>>(new Map());

  // Data Verification Center (Sprint v2.3.0), Feature 1 - Normal Mode is
  // the default and looks/behaves exactly as before; toggling this on only
  // reveals additional filters/columns, it never changes what Normal Mode
  // itself does.
  const [verificationMode, setVerificationMode] = useState(false);

  // Phase 1.6 Wave B1.3: shared column management (B0) - visibility AND order, persisted per (staff, "sales_ledger"). The two gates
  // (Owner/Manager cost + profit, Verification Mode) are the registry's availability tokens, so a column the viewer may not see is never
  // offered. Presentation only: this state is NOT part of the data request (load / cost effects below), so changing a column never refetches.
  const columnPreference = useReportColumns("sales_ledger", { cost_profit: canViewCostAndProfit, verification_mode: verificationMode });
  const columnKeys = columnPreference.columns.map((c) => c.key);

  // Phase 1.6B (Product Owner): the date range of a drill-down URL (?dateFrom=&dateTo=, end exclusive) is VIEW context
  // only. It is used for this page's data and shown in the heading, but it NEVER writes the Global Date Filter, so the
  // user's saved period is untouched. It stays in force only while the global period is the one that was active when the
  // link was opened: choosing another period in the filter hands control back to the filter.
  const [drilldown, setDrilldown] = useState<DrilldownView | null>(() => parseDrilldownRange(searchParams));
  // Pin the saved period the link was opened over, as soon as it is known (adjust-state-during-render, no effect).
  if (drilldown && drilldown.baseKey === null && ready) setDrilldown({ ...drilldown, baseKey: periodKey });
  const activeDrilldown = activeDrilldownRange(drilldown, periodKey);
  const effectiveRange = activeDrilldown ?? range;

  function clearDrilldown() {
    setDrilldown(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("dateFrom");
    url.searchParams.delete("dateTo");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  const filters = withGlobalDateRange(localFilters, effectiveRange);
  const localFiltersKey = JSON.stringify(localFilters);

  const loadSeq = useRef(0);
  async function load() {
    // Phase 1.6B: a response that arrives after a newer request was issued (period switched meanwhile) is dropped, so an older
  // period's data can never overwrite the newer one.
    const seq = ++loadSeq.current;
    setIsLoading(true);
    const res = await fetch(`/api/sales-ledger?${buildSalesLedgerQuery(filters)}`);
    const data: { rows: SalesLedgerRow[]; totalCount: number; summary: Summary } = res.ok
      ? await res.json()
      : { rows: [], totalCount: 0, summary: EMPTY_SUMMARY };
    if (seq !== loadSeq.current) return;
    setRows(data.rows);
    setTotalCount(data.totalCount);
    setSummary(data.summary);
    setIsLoading(false);
  }

  useEffect(() => {
    if (!ready) return; // Phase 1.6B: never fetch the default period before the stored one is known
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, localFiltersKey, effectiveRange?.start, effectiveRange?.end]);

  useEffect(() => {
    let cancelled = false;
    if (!canViewCostAndProfit || rows.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) setCostByProductId(new Map());
      });
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const uniqueProductIds = Array.from(new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id)));
      const products = await Promise.all(uniqueProductIds.map((id) => getProductById(id)));
      const map = new Map<string, number>();
      for (const p of products) {
        if (p && typeof p.cost_price === "number") map.set(p.id!, p.cost_price);
      }
      if (!cancelled) setCostByProductId(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewCostAndProfit, rows]);

  async function handleExport() {
    setIsExporting(true);
    try {
      // Reporting Permission Enforcement (Decision Q-12, 2026-08-14) -
      // fetches from the new server-side export route (reports.export
      // enforced there) instead of calling the repository directly with
      // the browser client, which had no permission check in front of it.
      const exportRes = await fetch(`/api/sales-ledger/export?${buildSalesLedgerQuery(filters)}`);
      if (!exportRes.ok) throw new Error(`Export failed: ${exportRes.status}`);
      const { rows: allRows }: { rows: SalesLedgerRow[] } = await exportRes.json();

      // Cost/Profit isn't on the sales_ledger view - only fetch it for the
      // full exported set when a Cost/Profit column is actually visible
      // (and permitted), same "don't fetch what nothing needs" discipline
      // as the on-screen costByProductId effect above, just scoped to every
      // filtered row instead of only the current page's 50.
      const needsCost = exportNeedsCost(canViewCostAndProfit, columnPreference.isVisible);
      const exportCostByProductId = needsCost
        ? await getCostPricesByProductIds([...new Set(allRows.map((r) => r.product_id).filter((id): id is string => !!id))])
        : new Map<string, number>();

      const columnContext = { canViewCostAndProfit, verificationMode, costByProductId: exportCostByProductId };
      // Export columns (see exportColumns.ts): the VISIBLE set comes from the current column preference, the ORDER stays the registry
      // order - the export never follows the order the user chose in the table (locked Product Owner decision, Wave B1.3).
      const exportColumns = buildSalesLedgerExportColumns(columnContext, columnPreference.isVisible);

      const blob = await exportSalesLedgerToExcel(allRows, exportColumns, columnContext);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `so-ban-hang-${BusinessTime.todayString()}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Lỗi khi xuất Excel");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Sổ bán hàng</h1>
          <p className="text-muted-foreground mt-1.5 text-sm flex items-center gap-2 flex-wrap">
            {totalCount} giao dịch trong kỳ đã chọn
            <ScopeIndicator resource="revenue" />
          </p>
          <div className="mt-1">
            {activeDrilldown ? (
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground" data-testid="sales-ledger-drilldown-period">
                Đang xem (từ liên kết):{" "}
                <span className="text-primary">
                  {formatDate(activeDrilldown.start)} → {formatDate(addDaysToDateStr(activeDrilldown.end, -1))}
                </span>
                <button type="button" onClick={clearDrilldown} className="text-xs font-normal text-primary underline underline-offset-2">
                  Dùng Kỳ báo cáo đã chọn
                </button>
              </p>
            ) : (
              <PageViewingLabel />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <GlobalDateFilter />
          <Button
            data-testid="sales-ledger-verification-mode-button"
            variant={verificationMode ? "primary" : "secondary"}
            size="md"
            onClick={() => setVerificationMode((v) => !v)}
            title="Chế độ xác minh dữ liệu (Verification Mode)"
          >
            <ShieldCheck className="w-4 h-4" />
            {verificationMode ? "Chế độ xác minh: BẬT" : "Chế độ xác minh"}
          </Button>
          {/* shown only where the desktop table is (the mobile card list is not column-driven and stays as is) */}
          <div className="hidden lg:block">
            <ColumnManager columns={columnPreference} testId="sales-ledger-columns-button" />
          </div>
          <Button
            data-testid="report-export-button"
            variant="secondary"
            size="md"
            onClick={handleExport}
            disabled={isExporting || rows.length === 0}
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
        </div>
      </div>

      <SalesLedgerSummary summary={summary} />

      <SalesLedgerFilters filters={localFilters} onChange={setLocalFilters} />

      {verificationMode && <VerificationFilters filters={localFilters} onChange={setLocalFilters} />}

      <SalesLedgerTable
        rows={rows}
        isLoading={isLoading}
        verificationMode={verificationMode}
        canViewCostAndProfit={canViewCostAndProfit}
        costByProductId={costByProductId}
        columnKeys={columnKeys}
      />

      <SalesLedgerPagination
        page={localFilters.page}
        totalCount={totalCount}
        onPageChange={(page) => setLocalFilters({ ...localFilters, page })}
      />
    </div>
  );
}
