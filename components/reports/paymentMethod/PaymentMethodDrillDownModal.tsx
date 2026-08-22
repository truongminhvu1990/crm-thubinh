"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { PaymentMethodReportFilters, PaymentMethodDrillDownRow } from "@/types/paymentMethodReport";
import {
  exportPaymentMethodDrillDownToExcel,
  paymentMethodReportCurrency as currency,
} from "@/lib/paymentMethodReport/paymentMethodReportExport";
import { downloadBlob } from "@/lib/reports/reportsBIExport";
import { formatDate } from "@/lib/utils";
import { calculateOverpaidAmount } from "@/lib/orders/order.rules";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  paymentMethod: string;
  /** Same filters currently applied on the summary table (date/month/
   * salesperson) - the drill-down must stay consistent with whatever the
   * user is already looking at, not reset to unfiltered. */
  filters: PaymentMethodReportFilters;
  onClose: () => void;
}

function buildQuery(filters: PaymentMethodReportFilters, paymentMethod: string): string {
  const params = new URLSearchParams();
  if (filters.month) params.set("month", filters.month);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.salesperson) params.set("salesperson", filters.salesperson);
  params.set("paymentMethod", paymentMethod);
  return params.toString();
}

/** Payment Method Report drill-down (Product Owner task, 2026-08-14) -
 * summary row -> real Orders -> individual Order Items, never collapsed.
 * A Modal (components/ui/Modal.tsx), the app's own existing pattern for
 * showing extra detail without leaving the page - no new drill-down
 * mechanism invented. */
export default function PaymentMethodDrillDownModal({ paymentMethod, filters, onClose }: Props) {
  const [rows, setRows] = useState<PaymentMethodDrillDownRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setIsLoading(true);
      fetch(`/api/reports/payment-method/drill-down?${buildQuery(filters, paymentMethod)}`)
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data: { rows: PaymentMethodDrillDownRow[] }) => {
          if (!cancelled) {
            setRows(data.rows);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRows([]);
            setIsLoading(false);
          }
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, JSON.stringify(filters)]);

  async function handleExport() {
    setIsExporting(true);
    try {
      const blob = await exportPaymentMethodDrillDownToExcel(paymentMethod, rows);
      downloadBlob(blob, `chi-tiet-${paymentMethod.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      alert("Lỗi khi xuất Excel");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Modal open title={`Chi tiết - ${paymentMethod}`} onClose={onClose} size="xl" testId="payment-method-drill-down-modal">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Đang tải..." : `${rows.length} sản phẩm`}
        </p>
        <Button
          data-testid="payment-method-drill-down-export-button"
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={isExporting || isLoading || rows.length === 0}
        >
          <Download className="w-3.5 h-3.5" />
          {isExporting ? "Đang xuất..." : "Xuất Excel"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-muted-foreground text-sm" data-testid="payment-method-drill-down-empty-state">
            Không có đơn hàng nào khớp với bộ lọc đã chọn
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="payment-method-drill-down-table" className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left font-semibold px-3 py-2">Mã đơn hàng</th>
                <th className="text-left font-semibold px-3 py-2">Mã sản phẩm</th>
                <th className="text-left font-semibold px-3 py-2">Tên sản phẩm</th>
                <th className="text-left font-semibold px-3 py-2">Khách hàng</th>
                <th className="text-right font-semibold px-3 py-2">Giá bán</th>
                <th className="text-right font-semibold px-3 py-2">Đã thanh toán</th>
                <th className="text-right font-semibold px-3 py-2">Tiền còn lại</th>
                <th className="text-left font-semibold px-3 py-2">Ngày bán</th>
                <th className="text-left font-semibold px-3 py-2">Phương thức thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.orderId}-${r.productId}-${i}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">{r.orderNumber}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.productCode || "—"}</td>
                  <td className="px-3 py-2">{r.productName || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.customerName} <span className="text-xs text-muted-foreground">({r.customerCode})</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{currency.format(r.saleAmount)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{currency.format(r.amountPaid)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {/* Finance Project #1, Phase C (Product Owner Approval,
                        2026-08-21) — a negative remainingBalance is an
                        overpayment, shown distinctly rather than as a plain
                        negative currency figure. Warning-only, presentational
                        only — remainingBalance itself is untouched. */}
                    {r.remainingBalance < 0 ? (
                      <span className="text-amber-600 font-medium" data-testid="payment-method-drilldown-overpaid">
                        Dư {currency.format(calculateOverpaidAmount(r.remainingBalance))}
                      </span>
                    ) : (
                      currency.format(r.remainingBalance)
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.orderDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.paymentMethods || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
