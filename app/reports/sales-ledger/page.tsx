"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, ShieldCheck } from "lucide-react";
import { SalesLedgerFilters as Filters, SalesLedgerRow, SalesLedgerSummary as Summary } from "@/types/salesLedger";
import { getSalesLedgerPage, getSalesLedgerSummary, withGlobalDateRange, getAllFilteredRowsForExport } from "@/lib/salesLedger/salesLedger.service";
import { exportSalesLedgerToExcel } from "@/lib/salesLedger/salesLedgerExport";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { exclusiveEndToInclusiveTo } from "@/lib/reports/drilldown";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import ScopeIndicator from "@/components/shared/ScopeIndicator";
import Button from "@/components/ui/Button";
import SalesLedgerSummary from "@/components/salesLedger/SalesLedgerSummary";
import SalesLedgerFilters from "@/components/salesLedger/SalesLedgerFilters";
import SalesLedgerTable from "@/components/salesLedger/SalesLedgerTable";
import SalesLedgerPagination from "@/components/salesLedger/SalesLedgerPagination";
import VerificationFilters from "@/components/verification/VerificationFilters";

const DEFAULT_FILTERS: Filters = {
  sortField: "sale_date",
  sortDirection: "desc",
  page: 1,
};

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
  const { range, setCustomRange } = useGlobalDateFilter();
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

  // Data Verification Center (Sprint v2.3.0), Feature 1 - Normal Mode is
  // the default and looks/behaves exactly as before; toggling this on only
  // reveals additional filters/columns, it never changes what Normal Mode
  // itself does.
  const [verificationMode, setVerificationMode] = useState(false);

  // The date range half of a drill-down, unlike the filters above, mutates
  // the Global Date Filter - a different component's shared context state -
  // so it has to run as an effect, not a local lazy initializer. Deferred
  // one microtask out so the setCustomRange call isn't a bare synchronous
  // statement in the effect body, same shape as every other setState call
  // in this file already living inside a callback (e.g. `.then(setRows)`).
  const appliedDrilldownRange = useRef(false);
  useEffect(() => {
    if (appliedDrilldownRange.current) return;
    appliedDrilldownRange.current = true;

    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (!dateFrom && !dateTo) return;

    queueMicrotask(() => {
      setCustomRange(dateFrom || "", dateTo ? exclusiveEndToInclusiveTo(dateTo) : "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters = withGlobalDateRange(localFilters, range);

  async function load() {
    setIsLoading(true);
    const [page, summaryData] = await Promise.all([getSalesLedgerPage(filters), getSalesLedgerSummary(filters)]);
    setRows(page.rows);
    setTotalCount(page.totalCount);
    setSummary(summaryData);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(localFilters), range?.start, range?.end]);

  async function handleExport() {
    setIsExporting(true);
    try {
      const allRows = await getAllFilteredRowsForExport(filters);
      const blob = await exportSalesLedgerToExcel(allRows);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `so-ban-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
            <PageViewingLabel />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalDateFilter />
          <Button
            variant={verificationMode ? "primary" : "secondary"}
            size="md"
            onClick={() => setVerificationMode((v) => !v)}
            title="Chế độ xác minh dữ liệu (Verification Mode)"
          >
            <ShieldCheck className="w-4 h-4" />
            {verificationMode ? "Chế độ xác minh: BẬT" : "Chế độ xác minh"}
          </Button>
          <Button variant="secondary" size="md" onClick={handleExport} disabled={isExporting || rows.length === 0}>
            <Download className="w-4 h-4" />
            {isExporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
        </div>
      </div>

      <SalesLedgerSummary summary={summary} />

      <SalesLedgerFilters filters={localFilters} onChange={setLocalFilters} />

      {verificationMode && <VerificationFilters filters={localFilters} onChange={setLocalFilters} />}

      <SalesLedgerTable rows={rows} isLoading={isLoading} verificationMode={verificationMode} />

      <SalesLedgerPagination
        page={localFilters.page}
        totalCount={totalCount}
        onPageChange={(page) => setLocalFilters({ ...localFilters, page })}
      />
    </div>
  );
}
