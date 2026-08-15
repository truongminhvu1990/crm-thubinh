"use client";

import { useEffect, useState } from "react";
import { Download, X, Wallet } from "lucide-react";
import { PaymentMethodReportFilters, PaymentMethodReportRow } from "@/types/paymentMethodReport";
import { exportPaymentMethodReportToExcel, paymentMethodReportCurrency as currency } from "@/lib/paymentMethodReport/paymentMethodReportExport";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import { addDaysToDateStr } from "@/lib/dateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import ScopeIndicator from "@/components/shared/ScopeIndicator";
import Button from "@/components/ui/Button";
import PaymentMethodDrillDownModal from "@/components/reports/paymentMethod/PaymentMethodDrillDownModal";

const inputClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const DEFAULT_FILTERS: PaymentMethodReportFilters = {};

function buildQuery(filters: PaymentMethodReportFilters): string {
  const params = new URLSearchParams();
  if (filters.month) params.set("month", filters.month);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.salesperson) params.set("salesperson", filters.salesperson);
  if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
  return params.toString();
}

/** Payment Method Report (docs/07_REPORTING_SPEC.md §10, Operational
 * Reporting) — "which payment methods is revenue currently coming in
 * through." An operational breakdown table, deliberately not a BI
 * dashboard (Product Owner instruction): no chart, no KPI beyond the four
 * defined columns, same plain title/filters/table shape as Sales Ledger and
 * Monthly Sold Products, its sibling standalone Operational reports. */
export default function PaymentMethodReportPage() {
  const [filters, setFilters] = useState<PaymentMethodReportFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<PaymentMethodReportRow[]>([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [drillDownMethod, setDrillDownMethod] = useState<string | null>(null);

  const salespersonOptions = useMasterDataOptions("salesperson");

  async function load() {
    setIsLoading(true);
    const res = await fetch(`/api/reports/payment-method?${buildQuery(filters)}`);
    const data: { rows: PaymentMethodReportRow[]; paymentMethodOptions: string[] } = res.ok
      ? await res.json()
      : { rows: [], paymentMethodOptions: [] };
    setRows(data.rows);
    setPaymentMethodOptions(data.paymentMethodOptions);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  function update(patch: Partial<PaymentMethodReportFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      // Applied filters affect exported data by construction — `rows` is
      // already the currently-filtered result set, never re-fetched or
      // recalculated here (same "export = what's on screen" rule
      // Sales Ledger's own export follows).
      const blob = await exportPaymentMethodReportToExcel(rows);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `phuong-thuc-thanh-toan-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Lỗi khi xuất Excel");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  }

  const hasActiveFilters = !!(filters.month || filters.dateFrom || filters.dateTo || filters.salesperson || filters.paymentMethod);
  const totalAmount = rows.reduce((sum, r) => sum + r.totalAmount, 0);

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Phương thức thanh toán</h1>
          <p className="text-muted-foreground mt-1.5 text-sm flex items-center gap-2 flex-wrap">
            Doanh thu/bán hàng hiện đang được thanh toán bằng những phương thức nào
            <ScopeIndicator resource="revenue" />
          </p>
          <div className="mt-1">
            <PageViewingLabel />
          </div>
        </div>
        <Button
          data-testid="payment-method-export-button"
          variant="secondary"
          size="md"
          onClick={handleExport}
          disabled={isExporting || rows.length === 0}
        >
          <Download className="w-4 h-4" />
          {isExporting ? "Đang xuất..." : "Xuất Excel"}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Từ</span>
            <input
              data-testid="payment-method-date-from-input"
              type="date"
              value={filters.dateFrom || ""}
              onChange={(e) => update({ dateFrom: e.target.value || undefined, month: undefined })}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">đến</span>
            <input
              data-testid="payment-method-date-to-input"
              type="date"
              value={filters.dateTo ? addDaysToDateStr(filters.dateTo, -1) : ""}
              onChange={(e) =>
                update({ dateTo: e.target.value ? addDaysToDateStr(e.target.value, 1) : undefined, month: undefined })
              }
              className={inputClass}
            />
          </div>

          <input
            data-testid="payment-method-month-input"
            type="month"
            value={filters.month || ""}
            onChange={(e) => update({ month: e.target.value || undefined, dateFrom: undefined, dateTo: undefined })}
            className={inputClass}
            title="Lọc theo tháng"
          />

          <select
            data-testid="payment-method-staff-filter"
            value={filters.salesperson || ""}
            onChange={(e) => update({ salesperson: e.target.value || undefined })}
            className={`${inputClass} w-48`}
          >
            <option value="">Tất cả nhân viên</option>
            {salespersonOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            data-testid="payment-method-filter"
            value={filters.paymentMethod || ""}
            onChange={(e) => update({ paymentMethod: e.target.value || undefined })}
            className={`${inputClass} w-48`}
          >
            <option value="">Tất cả phương thức</option>
            {paymentMethodOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button variant="secondary" size="md" onClick={clearFilters}>
              <X className="w-4 h-4" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {!isLoading && rows.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6 flex items-center gap-3">
          <Wallet className="w-5 h-5 text-primary" />
          <span className="text-sm text-muted-foreground">Tổng số tiền:</span>
          <span className="text-lg font-semibold text-foreground">{currency.format(totalAmount)}</span>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin text-2xl">⟳</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground text-sm" data-testid="payment-method-empty-state">
              Không có dữ liệu thanh toán trong khoảng thời gian/bộ lọc đã chọn
            </p>
          </div>
        ) : (
          <table data-testid="payment-method-table" className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Phương thức thanh toán
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Số đơn hàng
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Số lượt thanh toán
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Tổng số tiền
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.paymentMethod}
                  data-testid={`payment-method-row-${r.paymentMethod}`}
                  className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => setDrillDownMethod(r.paymentMethod)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{r.paymentMethod}</td>
                  <td className="px-4 py-3 text-right text-primary underline decoration-dotted underline-offset-4">
                    {r.orderCount} đơn
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{r.paymentCount}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{currency.format(r.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drillDownMethod && (
        <PaymentMethodDrillDownModal
          paymentMethod={drillDownMethod}
          filters={filters}
          onClose={() => setDrillDownMethod(null)}
        />
      )}
    </div>
  );
}
