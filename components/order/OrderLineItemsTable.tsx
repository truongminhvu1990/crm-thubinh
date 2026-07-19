"use client";

import Link from "next/link";
import { Gift, PackageOpen, X } from "lucide-react";
import { OrderItem } from "@/types/order";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  items: OrderItem[];
  /** ORDERS_UI.md §5 Edit Order — shows a remove action per row when the
   * order is still open (Draft/Reserved). Inline price/discount editing is
   * not built in this increment (Add/Remove is); a mistaken price is
   * corrected by removing and re-adding the line for now. */
  editable?: boolean;
  onRemove?: (itemId: string) => void;
}

export default function OrderLineItemsTable({ items, editable = false, onRemove }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
          <PackageOpen className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Chưa có sản phẩm nào trong đơn.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
            <th className="text-left font-semibold px-1 py-2">Sản phẩm</th>
            <th className="text-left font-semibold px-1 py-2">Số chứng nhận</th>
            <th className="text-right font-semibold px-1 py-2">Đơn giá</th>
            <th className="text-right font-semibold px-1 py-2">Giảm giá</th>
            <th className="text-right font-semibold px-1 py-2">Thành tiền</th>
            <th className="text-left font-semibold px-1 py-2">Đóng gói</th>
            {editable && <th className="px-1 py-2" aria-label="Xóa" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-0">
              <td className="px-1 py-2.5 font-medium text-foreground">
                {item.product ? (
                  <Link href={`/products/${item.product.id}`} className="text-primary hover:underline">
                    {item.product.product_name} ({item.product.product_code})
                  </Link>
                ) : (
                  "—"
                )}
                {item.is_gift && (
                  <span
                    className="ml-2 inline-flex items-center gap-1 text-xs text-secondary"
                    title={item.gift_recipient_name ? `Quà tặng cho ${item.gift_recipient_name}` : "Quà tặng"}
                  >
                    <Gift className="w-3.5 h-3.5" />
                    {item.gift_recipient_name ? `cho ${item.gift_recipient_name}` : ""}
                  </span>
                )}
              </td>
              <td className="px-1 py-2.5 text-muted-foreground whitespace-nowrap">
                {item.product?.certificate_no || ""}
              </td>
              <td className="px-1 py-2.5 text-right whitespace-nowrap">{currency.format(item.snapshot_sale_price)}</td>
              <td className="px-1 py-2.5 text-right whitespace-nowrap text-muted-foreground">
                {item.discount ? currency.format(item.discount) : "—"}
              </td>
              <td className="px-1 py-2.5 text-right whitespace-nowrap font-medium text-foreground">
                {currency.format(item.line_total)}
              </td>
              <td className="px-1 py-2.5 text-muted-foreground">{item.packaging_option || "—"}</td>
              {editable && (
                <td className="px-1 py-2.5 text-right">
                  <button
                    onClick={() => item.id && onRemove?.(item.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Xóa sản phẩm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
