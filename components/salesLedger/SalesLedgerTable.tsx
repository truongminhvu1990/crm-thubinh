"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Receipt, ImageOff, AlertTriangle } from "lucide-react";
import { SalesLedgerRow } from "@/types/salesLedger";
import { COMMISSION_STATUS_LABEL, COMMISSION_STATUS_BADGE_VARIANT } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";
import {
  SalesLedgerColumnKey,
  DEFAULT_VISIBLE_SALES_LEDGER_COLUMNS,
  getAvailableSalesLedgerColumns,
} from "@/lib/salesLedger/salesLedgerColumns";
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
  /** Simple Profit Calculation Package, Part 5 - Owner/Manager only. */
  canViewCostAndProfit?: boolean;
  costByProductId?: Map<string, number>;
  /** Task 3 (Column Visibility) - which SALES_LEDGER_COLUMNS keys the user
   * currently has checked in "Cột hiển thị". A column only actually renders
   * when it's both in this set AND still available under the current
   * canViewCostAndProfit/verificationMode gates (getAvailableSalesLedger
   * Columns) - so toggling Verification Mode off hides its columns exactly
   * as before, independent of whatever this set happens to contain.
   * Defaults to every column (all visible), matching this table's own
   * behavior before column visibility existed - existing callers that don't
   * pass this prop (e.g. Data Verification's page) are unaffected. */
  visibleColumns?: Set<SalesLedgerColumnKey>;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function SalesLedgerTable({
  rows,
  isLoading = false,
  verificationMode = false,
  canViewCostAndProfit = false,
  costByProductId = new Map(),
  visibleColumns = DEFAULT_VISIBLE_SALES_LEDGER_COLUMNS,
}: Props) {
  const router = useRouter();

  const availableKeys = new Set(
    getAvailableSalesLedgerColumns({ canViewCostAndProfit, verificationMode, costByProductId }).map((c) => c.key)
  );
  const show = (key: SalesLedgerColumnKey) => availableKeys.has(key) && visibleColumns.has(key);

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
    <>
      {/* D-02: Sales Ledger Compact Row + Detail (Product Owner Decision) -
       * every field here already exists on SalesLedgerRow and every card
       * links to the same /reports/sales-ledger/[id] Detail route the
       * desktop row's onClick already uses. Order Number is intentionally
       * omitted, matching the Detail page's own precedent - it has no
       * backing field on SalesLedgerRow at all (the desktop table's "Số
       * đơn" column is a hardcoded "—", not read from data), so there is
       * nothing to show and nothing to fabricate. Verification Mode's
       * admin-only columns (entry_source/audit_info/duplicate) are likewise
       * left out - the existing Detail page doesn't surface them either. */}
      <div className="lg:hidden space-y-3">
        {rows.map((r) => (
          <Link
            key={r.purchase_id}
            href={`/reports/sales-ledger/${r.purchase_id}`}
            data-testid="sales-ledger-mobile-row"
            className="block bg-card rounded-xl border border-border shadow-sm p-4 active:bg-muted/30 transition-colors touch-manipulation"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{r.product_name || "—"}</p>
                {r.product_code && <p className="text-xs text-muted-foreground truncate">{r.product_code}</p>}
              </div>
              {r.commission_status && (
                <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[r.commission_status]}>
                  {COMMISSION_STATUS_LABEL[r.commission_status]}
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground truncate">{r.customer_name}</span>
              <span className="text-muted-foreground shrink-0 whitespace-nowrap">{formatDate(r.sale_date)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm mt-1">
              <span className="text-muted-foreground truncate">{r.salesperson || "—"}</span>
              <span className="font-semibold text-foreground shrink-0 whitespace-nowrap">{currency.format(r.sale_amount)}</span>
            </div>
            {canViewCostAndProfit && r.product_id && costByProductId.has(r.product_id) && (
              <div className="mt-1 text-sm text-muted-foreground">
                Lãi/Lỗ: {currency.format(r.sale_amount - costByProductId.get(r.product_id)!)}
              </div>
            )}
          </Link>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="sales-ledger-table" className={`w-full ${verificationMode ? "min-w-[1560px]" : "min-w-[1200px]"}`}>
        <thead>
          <tr className="border-b border-border">
            {show("sale_date") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Ngày bán
              </th>
            )}
            {show("order_number") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Số đơn
              </th>
            )}
            {show("product_code") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Mã sản phẩm
              </th>
            )}
            {show("product_name") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Tên sản phẩm
              </th>
            )}
            {show("customer") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Khách hàng
              </th>
            )}
            {show("salesperson") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Nhân viên
              </th>
            )}
            {show("sale_amount") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Giá trị bán
              </th>
            )}
            {show("commission_amount") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Hoa hồng
              </th>
            )}
            {show("cost_price") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Giá vốn
              </th>
            )}
            {show("profit") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Lãi / Lỗ
              </th>
            )}
            {show("commission_status") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Trạng thái hoa hồng
              </th>
            )}
            {show("entry_source") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Nguồn nhập
              </th>
            )}
            {show("audit_info") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Thông tin ghi nhận
              </th>
            )}
            {show("duplicate") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Trùng lặp
              </th>
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
              {show("sale_date") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                  {formatDate(r.sale_date)}
                </td>
              )}
              {show("order_number") && (
                // Order Number - customer_purchases has no linkage to Orders in
                // this schema, so this column is always empty rather than
                // fabricated.
                <td className="px-4 py-3.5 text-sm text-muted-foreground">—</td>
              )}
              {show("product_code") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                  {r.product_code || "—"}
                </td>
              )}
              {show("product_name") && (
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
                    <div className="min-w-0 font-medium text-foreground truncate">{r.product_name || "—"}</div>
                  </div>
                </td>
              )}
              {show("customer") && (
                <td className="px-4 py-3.5">
                  <div className="text-sm font-medium text-foreground">{r.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{r.customer_code}</div>
                </td>
              )}
              {show("salesperson") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground">{r.salesperson || "—"}</td>
              )}
              {show("sale_amount") && (
                <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">
                  {currency.format(r.sale_amount)}
                </td>
              )}
              {show("commission_amount") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                  {r.commission_amount !== null ? currency.format(r.commission_amount) : "—"}
                </td>
              )}
              {show("cost_price") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                  {r.product_id && costByProductId.has(r.product_id)
                    ? currency.format(costByProductId.get(r.product_id)!)
                    : "—"}
                </td>
              )}
              {show("profit") && (
                <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">
                  {r.product_id && costByProductId.has(r.product_id)
                    ? currency.format(r.sale_amount - costByProductId.get(r.product_id)!)
                    : "—"}
                </td>
              )}
              {show("commission_status") && (
                <td className="px-4 py-3.5">
                  {r.commission_status ? (
                    <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[r.commission_status]}>
                      {COMMISSION_STATUS_LABEL[r.commission_status]}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </td>
              )}
              {show("entry_source") && (
                <td className="px-4 py-3.5">
                  {r.entry_source ? (
                    <Badge variant={r.entry_source === "Historical Import" ? "muted" : "secondary"}>
                      {r.entry_source === "Historical Import" ? "Historical Import" : "Live Sale"}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </td>
              )}
              {show("audit_info") && (
                <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                  <div>Tạo: {r.created_by || "—"} · {formatDate(r.purchase_created_at)}</div>
                  <div>Sửa: {r.updated_by || "—"} · {r.updated_at ? formatDate(r.updated_at) : "—"}</div>
                </td>
              )}
              {show("duplicate") && (
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
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
