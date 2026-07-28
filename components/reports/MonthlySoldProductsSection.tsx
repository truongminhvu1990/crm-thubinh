"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { MonthlySoldProductsFilters as Filters, MonthlySoldProductRow, MonthlySoldProductsSummary as Summary } from "@/types/monthlySoldProducts";
import { getAllFilteredRowsForExport } from "@/lib/monthlySoldProducts/monthlySoldProducts.service";
import { ExcelColumn, exportRowsToExcel, downloadBlob } from "@/lib/reports/reportsBIExport";
import { useIsOwnerOrManager } from "@/lib/hooks/useIsOwnerOrManager";
import ScopeIndicator from "@/components/shared/ScopeIndicator";
import Button from "@/components/ui/Button";
import MonthlySoldProductsFilters from "@/components/reports/monthlySoldProducts/MonthlySoldProductsFilters";
import MonthlySoldProductsSummary from "@/components/reports/monthlySoldProducts/MonthlySoldProductsSummary";
import MonthlySoldProductsTable from "@/components/reports/monthlySoldProducts/MonthlySoldProductsTable";
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
  totalRevenue: 0,
  totalCustomers: 0,
  totalOrders: 0,
  operatingExpenses: 0,
  cogs: null,
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
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<MonthlySoldProductRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const canViewGrossProfit = useIsOwnerOrManager();

  async function load() {
    setIsLoading(true);
    const res = await fetch(`/api/reports/monthly-sold-products?${buildQuery(filters)}`);
    const data: { rows: MonthlySoldProductRow[]; totalCount: number; summary: Summary } = res.ok
      ? await res.json()
      : { rows: [], totalCount: 0, summary: EMPTY_SUMMARY };
    setRows(data.rows);
    setTotalCount(data.totalCount);
    setSummary(data.summary);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const EXPORT_COLUMNS: ExcelColumn<MonthlySoldProductRow>[] = [
    { header: "Ngày bán", width: 14, value: (r) => r.sale_date },
    { header: "Số đơn", width: 16, value: (r) => r.order_number || "" },
    { header: "Mã sản phẩm", width: 16, value: (r) => r.product_code || "" },
    { header: "Tên sản phẩm", width: 28, value: (r) => r.product_name || "" },
    { header: "Danh mục", width: 16, value: (r) => r.product_category || "" },
    { header: "Khách hàng", width: 24, value: (r) => r.customer_name },
    { header: "Nhân viên", width: 18, value: (r) => r.salesperson || "" },
    { header: "Giá gốc", width: 16, value: (r) => r.original_price ?? "" },
    { header: "Chiết khấu", width: 14, value: (r) => r.discount ?? "" },
    { header: "Giá bán cuối", width: 16, value: (r) => r.final_sale_price },
    { header: "Lãi gộp", width: 16, value: (r) => r.gross_profit ?? "" },
  ];

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const allRows = await getAllFilteredRowsForExport(filters);
      const blob = await exportRowsToExcel<MonthlySoldProductRow>("San pham da ban", EXPORT_COLUMNS, allRows);
      downloadBlob(blob, `san-pham-da-ban-theo-thang-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        <p className="text-sm text-muted-foreground">Ngày in: {new Date().toLocaleDateString("vi-VN")}</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          {totalCount} sản phẩm trong khoảng thời gian đã chọn
          <ScopeIndicator resource="revenue" />
        </p>
        <div className="flex items-center gap-2">
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

      <MonthlySoldProductsTable rows={rows} isLoading={isLoading} canViewGrossProfit={canViewGrossProfit} />

      <div className="print:hidden">
        <MonthlySoldProductsPagination
          page={filters.page}
          totalCount={totalCount}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      </div>

      <ExpenseManagementSection
        filters={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo, month: filters.month }}
        revenue={summary.totalRevenue}
        cogs={summary.cogs}
        profitLoss={summary.profitLoss}
        profitMargin={summary.profitMargin}
        canManage={canViewGrossProfit}
        onExpensesChanged={load}
      />
    </div>
  );
}
