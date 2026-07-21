"use client";

import { useRouter } from "next/navigation";
import { Receipt, ImageOff, AlertTriangle } from "lucide-react";
import { SalesLedgerRow } from "@/types/salesLedger";
import { COMMISSION_STATUS_LABEL, COMMISSION_STATUS_BADGE_VARIANT } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";

interface Props {
  rows: SalesLedgerRow[];
  isLoading?: boolean;
  /** Sprint v2.3.0 (Data Verification Center), Feature 1 - Verification
   * Mode. Purely additive: undefined/false renders exactly what this table
   * has always rendered (Normal Mode, unchanged); true appends the Entry
   * Source / Audit Info / Possible Duplicate columns (Features 2/3/4) and
   * highlights duplicate-flagged rows. */
  verificationMode?: boolean;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function SalesLedgerTable({ rows, isLoading = false, verificationMode = false }: Props) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Receipt className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Không có giao dịch nào trong khoảng thời gian này</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className={`w-full ${verificationMode ? "min-w-[1560px]" : "min-w-[1200px]"}`}>
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ngày bán
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Số đơn
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Sản phẩm
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Khách hàng
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Nhân viên
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Giá trị bán
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Hoa hồng
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Trạng thái
            </th>
            {verificationMode && (
              <>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Nguồn nhập
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Thông tin ghi nhận
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Trùng lặp
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.purchase_id}
              onClick={() => router.push(`/reports/sales-ledger/${r.purchase_id}`)}
              className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${
                verificationMode && r.is_duplicate ? "bg-amber-50" : ""
              }`}
            >
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(r.sale_date)}
              </td>
              {/* Order Number - customer_purchases has no linkage to Orders in this
                  schema, so this column is always empty rather than fabricated. */}
              <td className="px-4 py-3.5 text-sm text-muted-foreground">—</td>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  {r.product_image_url ? (
                    <img
                      src={r.product_image_url}
                      alt={r.product_name || ""}
                      className="w-9 h-9 rounded-md object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-md border border-border bg-muted flex items-center justify-center shrink-0">
                      <ImageOff className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{r.product_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.product_code || "—"}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3.5">
                <div className="text-sm font-medium text-foreground">{r.customer_name}</div>
                <div className="text-xs text-muted-foreground">{r.customer_code}</div>
              </td>
              <td className="px-4 py-3.5 text-sm text-muted-foreground">{r.salesperson || "—"}</td>
              <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">
                {currency.format(r.sale_amount)}
              </td>
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                {r.commission_amount !== null ? currency.format(r.commission_amount) : "—"}
              </td>
              <td className="px-4 py-3.5">
                {r.commission_status ? (
                  <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[r.commission_status]}>
                    {COMMISSION_STATUS_LABEL[r.commission_status]}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </td>
              {verificationMode && (
                <>
                  <td className="px-4 py-3.5">
                    <Badge variant={r.entry_source === "Historical Import" ? "muted" : "secondary"}>
                      {r.entry_source === "Historical Import" ? "Historical Import" : "Live Sale"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    <div>Tạo: {r.created_by || "—"} · {formatDate(r.purchase_created_at)}</div>
                    <div>Sửa: {r.updated_by || "—"} · {formatDate(r.updated_at)}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    {r.is_duplicate ? (
                      <Badge variant="warning">
                        <AlertTriangle className="w-3 h-3" />
                        Possible Duplicate
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
