"use client";

import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { ORDER_STATUS, PAYMENT_STATUS, ORDER_STATUS_BADGE_VARIANT, PAYMENT_STATUS_BADGE_VARIANT, labelFor } from "@/lib/orders/order.constants";
import { OrderValueBreakdownRow } from "@/lib/orders/orderValueSummary.service";

interface Props {
  rows: OrderValueBreakdownRow[];
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

/** Revenue Management Visibility (2026-08-29), Order Revenue Visibility
 * Semantic Gap fix (2026-08-29 follow-up) - drill-down for "Giá trị đơn
 * chưa ghi nhận" (B3), computed dynamically per period by
 * getOrderValueSummary()'s `breakdown` (lib/orders/orderValueSummary.
 * service.ts), never hardcoded. Every row here is an Order Status x
 * Payment Status combination, from the Orders population only, that
 * failed BR-001 (anything except Completed + Paid) - these rows sum to
 * exactly B3, by construction (same query as Tổng giá trị đơn hàng).
 * Deliberately never framed as "Tổng giá trị đơn hàng minus Doanh thu đã
 * ghi nhận" - "Doanh thu đã ghi nhận" (B2) can include BR-002 legacy
 * customer_purchases revenue with no linked Order at all, which has no
 * row here since it isn't an Order. */
export default function UnrecognizedOrderValueBreakdown({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <Card testId="dashboard-unrecognized-breakdown-card">
        <h2 className="text-base font-semibold text-foreground mb-1">Giá trị đơn chưa ghi nhận — chi tiết</h2>
        <p className="text-sm text-muted-foreground">Không có đơn nào chưa đủ điều kiện ghi nhận doanh thu trong kỳ đã chọn.</p>
      </Card>
    );
  }

  const total = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <Card testId="dashboard-unrecognized-breakdown-card">
      <h2 className="text-base font-semibold text-foreground mb-1">Giá trị đơn chưa ghi nhận — chi tiết</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Tính riêng từ Đơn hàng — vì sao các đơn này chưa đủ điều kiện ghi nhận doanh thu (Completed + Paid)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="dashboard-unrecognized-breakdown-table">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-4 font-medium">Trạng thái đơn</th>
              <th className="py-2 pr-4 font-medium">Trạng thái thanh toán</th>
              <th className="py-2 pr-4 font-medium text-right">Số đơn</th>
              <th className="py-2 font-medium text-right">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.order_status}|${row.payment_status}`} className="border-b border-border last:border-0">
                <td className="py-2 pr-4">
                  <Badge variant={ORDER_STATUS_BADGE_VARIANT[row.order_status] ?? "muted"}>
                    {labelFor(ORDER_STATUS, row.order_status) ?? row.order_status}
                  </Badge>
                </td>
                <td className="py-2 pr-4">
                  <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[row.payment_status] ?? "muted"}>
                    {labelFor(PAYMENT_STATUS, row.payment_status) ?? row.payment_status}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-right text-foreground">{row.count}</td>
                <td className="py-2 text-right font-medium text-foreground">{currency.format(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <td className="py-2 pr-4" colSpan={3}>
                Tổng giá trị đơn chưa ghi nhận
              </td>
              <td className="py-2 text-right text-foreground">{currency.format(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
