"use client";

import { Fragment, ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Receipt, ImageOff, AlertTriangle } from "lucide-react";
import { SalesLedgerRow } from "@/types/salesLedger";
import { COMMISSION_STATUS_LABEL, COMMISSION_STATUS_BADGE_VARIANT } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";
import {
  SALES_LEDGER_COLUMNS,
  SalesLedgerColumnKey,
  DEFAULT_VISIBLE_SALES_LEDGER_COLUMNS,
  getAvailableSalesLedgerColumns,
} from "@/lib/salesLedger/salesLedgerColumns";
import EntityLink from "@/components/reports/entity/EntityLink";
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
   * behavior before column visibility existed. Only used when `columnKeys` is not given. */
  visibleColumns?: Set<SalesLedgerColumnKey>;
  /** Phase 1.6 Wave B1.3: the columns to render, ALREADY normalised, visibility-filtered and ordered by the shared column preference
   * (useReportColumns). Header and cells are both produced from this one list, so their order can never differ. When given it replaces
   * `visibleColumns`. Presentation only: it is never part of the data request. The desktop table only - the mobile card list below is
   * not column-driven and is unaffected. */
  columnKeys?: string[];
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const TH = "px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";

interface ColumnRenderer {
  label: string;
  td: (r: SalesLedgerRow) => ReactNode;
}

/** One entry per Sales Ledger column: its header text and its cell, side by side, so a reorder moves both. */
function buildColumns(costByProductId: Map<string, number>): Record<SalesLedgerColumnKey, ColumnRenderer> {
  return {
    sale_date: { label: "Ngày bán", td: (r) => <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(r.sale_date)}</td> },
    // Order Number - customer_purchases has no linkage to Orders in this schema, so this column is always empty rather than fabricated.
    order_number: { label: "Số đơn", td: () => <td className="px-4 py-3.5 text-sm text-muted-foreground">—</td> },
    product_code: {
      label: "Mã sản phẩm",
      td: (r) => (
        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
          <EntityLink type="product" id={r.product_id}>{r.product_code || "—"}</EntityLink>
        </td>
      ),
    },
    product_name: {
      label: "Tên sản phẩm",
      td: (r) => (
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
            <div className="min-w-0 font-medium text-foreground truncate"><EntityLink type="product" id={r.product_id}>{r.product_name || "—"}</EntityLink></div>
          </div>
        </td>
      ),
    },
    customer: {
      label: "Khách hàng",
      td: (r) => (
        <td className="px-4 py-3.5">
          <div className="text-sm font-medium text-foreground"><EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink></div>
          <div className="text-xs text-muted-foreground">{r.customer_code}</div>
        </td>
      ),
    },
    salesperson: { label: "Nhân viên", td: (r) => <td className="px-4 py-3.5 text-sm text-muted-foreground">{r.salesperson || "—"}</td> },
    sale_amount: { label: "Giá trị bán", td: (r) => <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">{currency.format(r.sale_amount)}</td> },
    commission_amount: {
      label: "Hoa hồng",
      td: (r) => (
        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
          {r.commission_amount !== null ? currency.format(r.commission_amount) : "—"}
        </td>
      ),
    },
    cost_price: {
      label: "Giá vốn",
      td: (r) => (
        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
          {r.product_id && costByProductId.has(r.product_id) ? currency.format(costByProductId.get(r.product_id)!) : "—"}
        </td>
      ),
    },
    profit: {
      label: "Lãi / Lỗ",
      td: (r) => (
        <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">
          {r.product_id && costByProductId.has(r.product_id) ? currency.format(r.sale_amount - costByProductId.get(r.product_id)!) : "—"}
        </td>
      ),
    },
    commission_status: {
      label: "Trạng thái hoa hồng",
      td: (r) => (
        <td className="px-4 py-3.5">
          {r.commission_status ? (
            <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[r.commission_status]}>{COMMISSION_STATUS_LABEL[r.commission_status]}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </td>
      ),
    },
    entry_source: {
      label: "Nguồn nhập",
      td: (r) => (
        <td className="px-4 py-3.5">
          {r.entry_source ? (
            <Badge variant={r.entry_source === "Historical Import" ? "muted" : "secondary"}>
              {r.entry_source === "Historical Import" ? "Historical Import" : "Live Sale"}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </td>
      ),
    },
    audit_info: {
      label: "Thông tin ghi nhận",
      td: (r) => (
        <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
          <div>Tạo: {r.created_by || "—"} · {formatDate(r.purchase_created_at)}</div>
          <div>Sửa: {r.updated_by || "—"} · {r.updated_at ? formatDate(r.updated_at) : "—"}</div>
        </td>
      ),
    },
    duplicate: {
      label: "Trùng lặp",
      td: (r) => (
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
      ),
    },
  };
}

export default function SalesLedgerTable({
  rows,
  isLoading = false,
  verificationMode = false,
  canViewCostAndProfit = false,
  costByProductId = new Map(),
  visibleColumns = DEFAULT_VISIBLE_SALES_LEDGER_COLUMNS,
  columnKeys,
}: Props) {
  const router = useRouter();

  const availableKeys = new Set<string>(
    getAvailableSalesLedgerColumns({ canViewCostAndProfit, verificationMode, costByProductId }).map((c) => c.key)
  );
  const COLUMNS = buildColumns(costByProductId);
  // Without `columnKeys` (legacy callers): registry order, filtered by the old visibility set.
  const requested = columnKeys ?? SALES_LEDGER_COLUMNS.map((c) => c.key as string).filter((k) => visibleColumns.has(k as SalesLedgerColumnKey));
  // A column renders only when it is available under the current permission / mode gates AND this table knows it - so a column the
  // viewer may not see (cost_price / profit) is never drawn, whatever list a caller passes.
  const keys = requested.filter((k): k is SalesLedgerColumnKey => availableKeys.has(k) && k in COLUMNS);

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
       * left out - the existing Detail page doesn't surface them either.
       * The cards are NOT column-driven: the column preference never changes them. */}
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
              {keys.map((k) => (
                <th key={k} data-column-key={k} className={TH}>
                  {COLUMNS[k].label}
                </th>
              ))}
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
                {keys.map((k) => (
                  <Fragment key={k}>{COLUMNS[k].td(r)}</Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
