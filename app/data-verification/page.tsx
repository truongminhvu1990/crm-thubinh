"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, PackageCheck, Radio, AlertTriangle, TrendingUp, Download, History } from "lucide-react";
import { SalesLedgerFilters as Filters, SalesLedgerRow } from "@/types/salesLedger";
import { VerificationDashboardData } from "@/types/verification";
import {
  getSalesLedgerPage,
  withGlobalDateRange,
  getAllFilteredRowsForExport,
} from "@/lib/salesLedger/salesLedger.service";
import { getVerificationDashboard } from "@/lib/verification/verification.service";
import { VERIFICATION_EXPORT_COLUMNS } from "@/lib/verification/verificationExport";
import { exportRowsToExcel, downloadBlob } from "@/lib/reports/reportsBIExport";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import StatCard from "@/components/ui/StatCard";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SalesLedgerFilters from "@/components/salesLedger/SalesLedgerFilters";
import SalesLedgerTable from "@/components/salesLedger/SalesLedgerTable";
import SalesLedgerPagination from "@/components/salesLedger/SalesLedgerPagination";
import VerificationFilters from "@/components/verification/VerificationFilters";
import ProgressBar from "@/components/verification/ProgressBar";

// Data Verification Center (Sprint v2.3.0). Owns nothing about how
// transactions are fetched, filtered, paginated, sorted or exported -
// every one of those is lib/salesLedger/salesLedger.service.ts, exactly
// the same module Sales Ledger's own page uses (Feature 10's "do not
// duplicate logic" via "Integrate only"). The only new query this page
// adds is verification_dashboard() for Features 5/6/8's summary numbers.

const DEFAULT_FILTERS: Filters = {
  sortField: "sale_date",
  sortDirection: "desc",
  page: 1,
};

export default function DataVerificationPage() {
  const { range } = useGlobalDateFilter();

  const [dashboard, setDashboard] = useState<VerificationDashboardData | null>(null);
  const [localFilters, setLocalFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<SalesLedgerRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    getVerificationDashboard().then(setDashboard);
  }, []);

  const filters = withGlobalDateRange(localFilters, range);

  // No SalesLedgerSummary card on this page (Feature 8's own summary cards
  // already cover this module's numbers) - only the transaction page
  // itself is fetched, per Feature 10's "do not fetch unnecessary rows".
  useEffect(() => {
    getSalesLedgerPage(filters).then((page) => {
      setRows(page.rows);
      setTotalCount(page.totalCount);
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(localFilters), range?.start, range?.end]);

  async function handleExport() {
    setIsExporting(true);
    try {
      const allRows = await getAllFilteredRowsForExport(filters);
      const blob = await exportRowsToExcel("Xac minh du lieu", VERIFICATION_EXPORT_COLUMNS, allRows);
      downloadBlob(blob, `xac-minh-du-lieu-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      alert("Lỗi khi xuất Excel");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="pb-8 space-y-8">
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            Trung tâm xác minh dữ liệu
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Xác minh dữ liệu nhập lịch sử, phát hiện trùng lặp và theo dõi tiến độ nhập liệu.
          </p>
          <div className="mt-1.5">
            <PageViewingLabel />
          </div>
        </div>
        <GlobalDateFilter />
      </div>

      {/* Feature 8 - Verification Summary */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Tổng quan xác minh
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Đã nhập lịch sử (Historical Imported)"
            value={dashboard ? dashboard.historicalImported : "—"}
            icon={<History className="w-5 h-5 text-primary" />}
            placeholder={dashboard === null}
          />
          <StatCard
            title="Bán hàng trực tiếp (Live Sales)"
            value={dashboard ? dashboard.liveSales : "—"}
            icon={<Radio className="w-5 h-5 text-primary" />}
            placeholder={dashboard === null}
          />
          <StatCard
            title="Cảnh báo trùng lặp (Duplicate Warnings)"
            value={dashboard ? dashboard.duplicateWarnings : "—"}
            icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
            color="bg-destructive/10 text-destructive"
            placeholder={dashboard === null}
          />
          <StatCard
            title="Hoàn thành (Completion %)"
            value={dashboard ? `${dashboard.completionPct.toFixed(1)}%` : "—"}
            icon={<TrendingUp className="w-5 h-5 text-primary" />}
            placeholder={dashboard === null}
          />
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Feature 5 - Import Progress */}
        <Card>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <PackageCheck className="w-5 h-5 text-primary" />
            Tiến độ nhập liệu
          </h3>
          {dashboard === null ? (
            <div className="flex justify-center items-center h-24">
              <div className="animate-spin text-2xl">⟳</div>
            </div>
          ) : (
            <div className="space-y-4">
              <ProgressBar label="Import %" value={dashboard.importPct} />
              <div className="grid grid-cols-3 gap-3 text-center pt-2">
                <div>
                  <p className="text-lg font-bold text-foreground">{dashboard.historicalImported}</p>
                  <p className="text-xs text-muted-foreground">Historical Imported</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{dashboard.liveSales}</p>
                  <p className="text-xs text-muted-foreground">Live Sales</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{dashboard.totalTransactions}</p>
                  <p className="text-xs text-muted-foreground">Total Transactions</p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Feature 6 - Missing History */}
        <Card>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-primary" />
            Lịch sử còn thiếu
          </h3>
          {dashboard === null ? (
            <div className="flex justify-center items-center h-24">
              <div className="animate-spin text-2xl">⟳</div>
            </div>
          ) : (
            <div className="space-y-4">
              <ProgressBar
                label="Completion %"
                value={dashboard.completionPct}
                colorClass={dashboard.remainingHistorical > 0 ? "bg-amber-500" : "bg-secondary"}
              />
              <div className="grid grid-cols-3 gap-3 text-center pt-2">
                <div>
                  <p className="text-lg font-bold text-foreground">{dashboard.estimatedHistorical}</p>
                  <p className="text-xs text-muted-foreground">Estimated Historical</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{dashboard.importedHistorical}</p>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                <div>
                  <p className={`text-lg font-bold ${dashboard.remainingHistorical > 0 ? "text-destructive" : "text-foreground"}`}>
                    {dashboard.remainingHistorical}
                  </p>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Feature 7 - Verification Filters + table (Verification Mode always on here) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Giao dịch cần xác minh
          </h2>
          <Button variant="secondary" size="md" onClick={handleExport} disabled={isExporting || rows.length === 0}>
            <Download className="w-4 h-4" />
            {isExporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
        </div>

        <SalesLedgerFilters filters={localFilters} onChange={setLocalFilters} />
        <VerificationFilters filters={localFilters} onChange={setLocalFilters} />

        <SalesLedgerTable rows={rows} isLoading={isLoading} verificationMode />

        <SalesLedgerPagination
          page={localFilters.page}
          totalCount={totalCount}
          onPageChange={(page) => setLocalFilters({ ...localFilters, page })}
        />
      </section>
    </div>
  );
}
