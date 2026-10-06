"use client";

import { Fragment, ReactNode } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, BookText, Pencil, ChevronRight } from "lucide-react";
import { MoneyDebtLedgerEntry } from "@/types/moneyDebtLedger";
import { moneyDebtLedgerTypeLabel } from "@/lib/moneyDebtLedger/moneyDebtLedger.constants";
import { resolveSupplier } from "@/lib/moneyDebtLedger/moneyDebtLedgerDisplay";
import { formatDate } from "@/lib/utils";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function formatAmount(amount: number, currency: string): string {
  return currency === "VND" ? vnd.format(amount) : `¥${cny.format(amount)}`;
}

export type MoneyDebtLedgerColumnKey =
  | "date"
  | "code"
  | "party"
  | "type"
  | "content"
  | "supplier"
  | "order"
  | "currency"
  | "in"
  | "out"
  | "fxRate"
  | "status"
  | "actions";

interface Props {
  entries: MoneyDebtLedgerEntry[];
  isLoading?: boolean;
  onEdit?: (entry: MoneyDebtLedgerEntry) => void;
  onRowClick?: (entry: MoneyDebtLedgerEntry) => void;
  /** Ordered visible column keys (Phase 1.6 Wave B1.4: from useReportColumns("money_debt_ledger")). Omitted = every column in the
   * registry order. "actions" is only ever drawn when onEdit is given. */
  columnKeys?: string[];
  /** The column manager, rendered in the toolbar row above the table from md up (the mobile card list is not column-driven). */
  toolbar?: ReactNode;
}

const TH = "px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide";
const DEFAULT_KEYS: MoneyDebtLedgerColumnKey[] = ["date", "code", "party", "type", "content", "supplier", "order", "currency", "in", "out", "fxRate", "status", "actions"];

/** Stage (Money/Debt Ledger reporting — column config + relation links),
 * Phase 4/5 — human-readable "what is this row about" content. Now backed
 * by `group_counterparty` (service-layer, transaction_group-resolved)
 * instead of searching the current page's own filtered `entries` array —
 * this used to silently fail to identify a counterparty whenever a filter
 * (e.g. currency=VND) excluded the sibling row from the current view; the
 * service-layer join has no such gap. */
function describeContent(entry: MoneyDebtLedgerEntry, allEntries: MoneyDebtLedgerEntry[]): string {
  if (entry.order) {
    const customer = entry.order.customer?.full_name ? ` · ${entry.order.customer.full_name}` : "";
    return `Đơn ${entry.order.order_number}${customer}`;
  }
  if (entry.corrects_entry_id) {
    const original = allEntries.find((e) => e.id === entry.corrects_entry_id);
    return `Điều chỉnh cho ${original?.entry_code ?? entry.corrects_entry_id}`;
  }
  if (entry.transaction_type === "Supplier Payment via Money Changer") {
    // The Money Changer leg is VND; its CNY amount lives on the sibling
    // (group_counterparty's own row isn't fetched here, only its party) —
    // so the FX breakdown is only shown on the leg that actually has both
    // numbers: fx_rate is stamped on both legs, but only the CNY leg's own
    // `amount` is the CNY figure.
    if (entry.currency === "CNY" && entry.fx_rate) {
      return `${cny.format(entry.amount)} CNY × ${vnd.format(entry.fx_rate)} = ${vnd.format(entry.amount * entry.fx_rate)}`;
    }
    return entry.group_counterparty ? `Thanh toán cho ${entry.group_counterparty.name}` : "Thanh toán nhà cung cấp";
  }
  if (entry.transaction_group) return "Mua CNY";
  return entry.reference ?? "—";
}

/** No Delete anywhere on this table, ever — ledger rows are immutable once
 * created (D7) and there is no update/delete function anywhere in
 * lib/moneyDebtLedger/. "Edit" opens CorrectionModal, which never
 * updates/deletes this row — it creates a new Adjustment row carrying a
 * delta and a corrects_entry_id back-reference.
 *
 * Column visibility and order (Phase 1.6 Wave B1.4) are purely presentational — they
 * never change what's fetched, filtered, or calculated; they only change which
 * <td>/<th> render and in what order (the page passes the ordered `columnKeys`
 * from useReportColumns). Desktop renders a real <table>; below `md` it renders a
 * compact stacked card list instead (Phase O) which is NOT column-driven, and the
 * column manager (`toolbar`) is not shown there. */
export default function MoneyDebtLedgerTable({ entries, isLoading = false, onEdit, onRowClick, columnKeys, toolbar }: Props) {
  const correctionsByOriginalId = new Map<string, MoneyDebtLedgerEntry[]>();
  for (const e of entries) {
    if (!e.corrects_entry_id) continue;
    const list = correctionsByOriginalId.get(e.corrects_entry_id) ?? [];
    list.push(e);
    correctionsByOriginalId.set(e.corrects_entry_id, list);
  }

  // ONE map drives both the header and the cells, so their order can never differ. Every cell keeps the exact markup it had before.
  const COLUMNS: Record<MoneyDebtLedgerColumnKey, { label: string; align: "left" | "right"; td: (e: MoneyDebtLedgerEntry) => ReactNode }> = {
    date: { label: "Ngày", align: "left", td: (e) => <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{formatDate(e.transaction_date)}</td> },
    code: { label: "Mã GD", align: "left", td: (e) => <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{e.entry_code}</td> },
    party: { label: "Money Changer / Đối tượng", align: "left", td: (e) => <td className="px-4 py-3 text-sm text-foreground">{e.party?.name ?? "—"}</td> },
    type: {
      label: "Loại",
      align: "left",
      td: (e) => <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{moneyDebtLedgerTypeLabel(e.transaction_type)}</td>,
    },
    content: {
      label: "Nội dung",
      align: "left",
      td: (e) => (
        <td className="px-4 py-3 text-sm text-muted-foreground max-w-[240px] truncate" title={describeContent(e, entries)}>
          {describeContent(e, entries)}
        </td>
      ),
    },
    supplier: {
      label: "Nhà cung cấp",
      align: "left",
      td: (e) => {
        const supplier = resolveSupplier(e);
        return (
          <td className="px-4 py-3 text-sm text-foreground" data-testid={`money-debt-ledger-supplier-${e.id}`}>
            {supplier ? (
              <Link href={`/partners/${supplier.id}`} className="text-primary hover:underline">
                {supplier.name}
              </Link>
            ) : (
              "—"
            )}
          </td>
        );
      },
    },
    order: {
      label: "Đơn hàng",
      align: "left",
      td: (e) => (
        <td className="px-4 py-3 text-sm" data-testid={`money-debt-ledger-order-${e.id}`}>
          {e.order ? (
            <Link
              href={`/orders/${e.order.id}`}
              onClick={(ev) => ev.stopPropagation()}
              className="text-primary hover:underline font-medium"
            >
              {e.order.order_number}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {e.order?.customer && <span className="block text-xs text-muted-foreground">{e.order.customer.full_name}</span>}
        </td>
      ),
    },
    currency: { label: "Tiền", align: "left", td: (e) => <td className="px-4 py-3 text-sm text-muted-foreground">{e.currency}</td> },
    in: {
      label: "IN",
      align: "right",
      td: (e) => (
        <td className="px-4 py-3 text-sm text-right tabular-nums text-secondary font-medium">
          {e.direction === "IN" ? formatAmount(e.amount, e.currency) : ""}
        </td>
      ),
    },
    out: {
      label: "OUT",
      align: "right",
      td: (e) => (
        <td className="px-4 py-3 text-sm text-right tabular-nums text-destructive font-medium">
          {e.direction === "OUT" ? formatAmount(e.amount, e.currency) : ""}
        </td>
      ),
    },
    fxRate: {
      label: "Tỷ giá",
      align: "left",
      td: (e) => <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{e.fx_rate ? `1=${vnd.format(e.fx_rate)}` : "—"}</td>,
    },
    status: {
      label: "Trạng thái",
      align: "left",
      td: (e) => {
        const corrections = correctionsByOriginalId.get(e.id) ?? [];
        const isCorrection = !!e.corrects_entry_id;
        return (
          <td className="px-4 py-3 text-sm">
            {isCorrection && <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Điều chỉnh</span>}
            {corrections.length > 0 && (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Đã điều chỉnh ({corrections.length})</span>
            )}
            {!isCorrection && corrections.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </td>
        );
      },
    },
    actions: {
      label: "Thao tác",
      align: "right",
      td: (e) => (
        <td className="px-4 py-3 text-sm text-right">
          <button
            type="button"
            data-testid={`money-debt-ledger-edit-${e.id}`}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Sửa (tạo điều chỉnh)"
            onClick={(ev) => {
              ev.stopPropagation();
              onEdit?.(e);
            }}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </td>
      ),
    },
  };
  // A column the caller may not edit with is never drawn: "actions" needs onEdit (the page only passes it with money_debt_ledger.create).
  const keys = (columnKeys ?? DEFAULT_KEYS).filter((k): k is MoneyDebtLedgerColumnKey => k in COLUMNS && (k !== "actions" || !!onEdit));

  const toolbarRow = toolbar ? (
    <div className="hidden md:flex justify-end mb-2" data-testid="money-debt-ledger-toolbar">
      {toolbar}
    </div>
  ) : null;

  if (isLoading) {
    return (
      <>
        {toolbarRow}
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        {toolbarRow}
        <div className="bg-card rounded-xl p-12 text-center border border-border">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <BookText className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Không có giao dịch nào khớp với bộ lọc hiện tại</p>
        </div>
      </>
    );
  }

  return (
    <>
      {toolbarRow}

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="money-debt-ledger-table" className="w-full min-w-[1300px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {keys.map((k) => (
                <th key={k} data-column-key={k} className={`${TH} ${COLUMNS[k].align === "right" ? "text-right" : "text-left"}`}>
                  {COLUMNS[k].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                data-testid={`money-debt-ledger-row-${e.id}`}
                onClick={() => onRowClick?.(e)}
                className={`border-b border-border last:border-0 hover:bg-muted/30 ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {keys.map((k) => (
                  <Fragment key={k}>{COLUMNS[k].td(e)}</Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile compact card list */}
      <div className="md:hidden space-y-2">
        {entries.map((e) => {
          const corrections = correctionsByOriginalId.get(e.id) ?? [];
          const isCorrection = !!e.corrects_entry_id;
          const supplier = resolveSupplier(e);
          return (
            <div
              key={e.id}
              data-testid={`money-debt-ledger-card-${e.id}`}
              onClick={() => onRowClick?.(e)}
              className="bg-card border border-border rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{e.entry_code}</span>
                <span className="text-xs text-muted-foreground">{formatDate(e.transaction_date)}</span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">{e.party?.name ?? "—"}</span>
                <span
                  className={`text-sm font-semibold tabular-nums inline-flex items-center gap-1 ${e.direction === "IN" ? "text-secondary" : "text-destructive"}`}
                >
                  {e.direction === "IN" ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  {formatAmount(e.amount, e.currency)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{moneyDebtLedgerTypeLabel(e.transaction_type)}</p>
              {supplier && (
                <p className="text-xs mt-0.5">
                  Nhà cung cấp:{" "}
                  <Link
                    href={`/partners/${supplier.id}`}
                    onClick={(ev) => ev.stopPropagation()}
                    className="text-primary hover:underline font-medium"
                  >
                    {supplier.name}
                  </Link>
                </p>
              )}
              {e.order && (
                <p className="text-xs mt-0.5">
                  Đơn:{" "}
                  <Link
                    href={`/orders/${e.order.id}`}
                    onClick={(ev) => ev.stopPropagation()}
                    className="text-primary hover:underline font-medium"
                  >
                    {e.order.order_number}
                  </Link>
                  {e.order.customer && <span className="text-muted-foreground"> · {e.order.customer.full_name}</span>}
                </p>
              )}
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-1">
                  {isCorrection && <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Điều chỉnh</span>}
                  {corrections.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Đã điều chỉnh ({corrections.length})</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {onEdit && (
                    <button
                      type="button"
                      data-testid={`money-debt-ledger-edit-mobile-${e.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEdit(e);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {onRowClick && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
