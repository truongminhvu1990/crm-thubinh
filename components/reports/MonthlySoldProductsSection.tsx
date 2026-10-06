"use client";

import { formatDate } from "@/lib/utils";
import { BusinessTime } from "@/lib/businessTime";
import { useEffect, useRef, useState } from "react";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { Download, Printer } from "lucide-react";
import { MonthlySoldProductsFilters as Filters, MonthlySoldProductRow, MonthlySoldProductsSummary as Summary } from "@/types/monthlySoldProducts";
import { exportRowsToExcel, downloadBlob } from "@/lib/reports/reportsBIExport";
import { useIsOwnerOrManager } from "@/lib/hooks/useIsOwnerOrManager";
import { useReportColumns } from "@/lib/reportColumns/useReportColumns";
import ScopeIndicator from "@/components/shared/ScopeIndicator";
import Button from "@/components/ui/Button";
import MonthlySoldProductsFilters from "@/components/reports/monthlySoldProducts/MonthlySoldProductsFilters";
import MonthlySoldProductsSummary from "@/components/reports/monthlySoldProducts/MonthlySoldProductsSummary";
import MonthlySoldProductsTable from "@/components/reports/monthlySoldProducts/MonthlySoldProductsTable";
import ColumnManager from "@/components/shared/ColumnManager";
import { buildMonthlySoldProductsExportColumns } from "@/components/reports/monthlySoldProducts/exportColumns";
import MonthlySoldProductsPagination from "@/components/reports/monthlySoldProducts/MonthlySoldProductsPagination";
import ExpenseManagementSection from "@/components/reports/monthlySoldProducts/ExpenseManagementSection";

// Product Owner Decision (2026-07-28) - standalone operational report page
// at app/reports/monthly-sold-products/page.tsx, no longer embedded in the
// Reports Overview/BI Center (superseding the 2026-07-27 Fix 2 review that
// had embedded it there). This component still owns all of the report's own
// state/data-fetching; the page around it now only supplies the page title.

const REPORT_TITLE = "Sản phẩm đã bán theo tháng";

const DEFAULT_FILTERS: Filters = { page: 1 };

const EMPTY_SUMMARY: Summary = {
  soldValue: 0,
  recognizedRevenue: 0,
  legacyRecognizedValue: 0,
  unrecognizedValue: 0,
  soldLines: 0,
  totalCustomers: 0,
  totalOrders: 0,
  recognizedOrders: 0,
  unrecognizedOrders: 0,
  recognizedRatio: 0,
  operatingExpenses: 0,
  cogs: null,
  partnerCompensation: null,
  staffCommission: null,
  profitLoss: null,
  profitMargin: null,
};

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.month) params.set("month", filters.month);
  if (filters.salespersonId) params.set("salespersonId", filters.salespersonId);
  if (filters.productCategory) params.set("productCategory", filters.productCategory);
  if (filters.customer) params.set("customer", filters.customer);
  params.set("page", String(filters.page));
  return params.toString();
}

export default function MonthlySoldProductsSection() {
  // Phase 1.6B: the period is the Global Date Filter's; this section only owns the non-date filters and the page number.
  const { range, ready, periodKey } = useGlobalDateFilter();
  const [localFilters, setLocalFilters] = useState<Filters>(DEFAULT_FILTERS);
  // The page number only counts for the period it was chosen in (a new period starts at page 1).
  const [pagePeriodKey, setPagePeriodKey] = useState(periodKey);
  const filters: Filters = {
    ...localFilters,
    page: pagePeriodKey === periodKey ? localFilters.page : 1,
    dateFrom: range?.start,
    dateTo: range?.end,
    month: undefined,
  };
  const filtersKey = JSON.stringify(filters);
  function setFilters(next: Filters) {
    setPagePeriodKey(periodKey);
    setLocalFilters(next);
  }
  const [rows, setRows] = useState<MonthlySoldProductRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const canViewGrossProfit = useIsOwnerOrManager();

  // Phase 1.6 Wave B1.2: shared column management (B0) - visibility AND order, persisted per (staff, "monthly_sold_products").
  // Presentation only: this state is deliberately NOT part of `filters` / `filtersKey`, so changing a column never refetches the report.
  const columnPreference = useReportColumns("monthly_sold_products", { owner_or_manager: canViewGrossProfit });
  const columnKeys = columnPreference.columns.map((c) => c.key);

  const loadSeq = useRef(0);
  async function load() {
    // Phase 1.6B: a response that arrives after a newer request was issued (period switched meanwhile) is dropped, so an older
  // period's data can never overwrite the newer one.
    const seq = ++loadSeq.current;
    setIsLoading(true);
    const res = await fetch(`/api/reports/monthly-sold-products?${buildQuery(filters)}`);
    const data: { rows: MonthlySoldProductRow[]; totalCount: number; summary: Summary } = res.ok
      ? await res.json()
      : { rows: [], totalCount: 0, summary: EMPTY_SUMMARY };
    if (seq !== loadSeq.current) return;
    setRows(data.rows);
    setTotalCount(data.totalCount);
    setSummary(data.summary);
    setIsLoading(false);
  }

  useEffect(() => {
    if (!ready) return; // never fetch the default period before the stored one is known
    queueMicrotask(() => {
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filtersKey]);

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      // Reporting Permission Enforcement (Decision Q-12, 2026-08-14) -
      // fetches from the new server-side export route (reports.export
      // enforced there) instead of calling the repository directly with
      // the browser client, which had no permission check in front of it.
      const exportRes = await fetch(`/api/reports/monthly-sold-products/export?${buildQuery(filters)}`);
      if (!exportRes.ok) throw new Error(`Export failed: ${exportRes.status}`);
      const { rows: allRows }: { rows: MonthlySoldProductRow[] } = await exportRes.json();

      // Export columns (see exportColumns.ts): the VISIBLE set comes from the current column preference, the ORDER stays the registry
      // order - the export never follows the order the user chose in the table (locked Product Owner decision, Wave B1.2).
      const exportColumns = buildMonthlySoldProductsExportColumns(canViewGrossProfit, columnPreference.isVisible);

      const blob = await exportRowsToExcel<MonthlySoldProductRow>("San pham da ban", exportColumns, allRows);
      downloadBlob(blob, `san-pham-da-ban-theo-thang-${BusinessTime.todayString()}.xlsx`);
    } catch (error) {
      alert("Lỗi khi xuất Excel");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4">
      {/* Print-only header - the toolbar/filters below are hidden on print
          (print:hidden), so the printed page needs its own title/date. */}
      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-bold text-foreground">{REPORT_TITLE}</h1>
        <p className="text-sm text-muted-foreground">Ngày in: {formatDate(new Date())}</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          {totalCount} sản phẩm trong khoảng thời gian đã chọn
          <ScopeIndicator resource="revenue" />
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <ColumnManager columns={columnPreference} testId="monthly-sold-products-columns-button" />
          <Button
            data-testid="monthly-sold-products-export-excel-button"
            variant="secondary"
            size="sm"
            onClick={handleExportExcel}
            disabled={isExporting || rows.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
          <Button data-testid="monthly-sold-products-print-button" variant="secondary" size="sm" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" />
            In
          </Button>
        </div>
      </div>

      <MonthlySoldProductsSummary summary={summary} />

      <div className="print:hidden">
        <MonthlySoldProductsFilters filters={filters} onChange={setFilters} />
      </div>

      <MonthlySoldProductsTable
        rows={rows}
        isLoading={isLoading}
        canViewGrossProfit={canViewGrossProfit}
        columnKeys={columnKeys}
      />

      <div className="print:hidden">
        <MonthlySoldProductsPagination
          page={filters.page}
          totalCount={totalCount}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      </div>

      {ready && (
      <ExpenseManagementSection
        filters={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo }}
        revenue={summary.recognizedRevenue}
        soldValue={summary.soldValue}
        unrecognizedValue={summary.unrecognizedValue}
        cogs={summary.cogs}
        partnerCompensation={summary.partnerCompensation}
        staffCommission={summary.staffCommission}
        profitLoss={summary.profitLoss}
        profitMargin={summary.profitMargin}
        canManage={canViewGrossProfit}
        onExpensesChanged={load}
      />
      )}
    </div>
  );
}
