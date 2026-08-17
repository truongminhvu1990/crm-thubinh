"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, BookText, Pencil, ChevronRight } from "lucide-react";
import { MoneyDebtLedgerEntry } from "@/types/moneyDebtLedger";
import { moneyDebtLedgerTypeLabel } from "@/lib/moneyDebtLedger/moneyDebtLedger.constants";
import { resolveSupplier } from "@/lib/moneyDebtLedger/moneyDebtLedgerDisplay";
import { useMoneyDebtLedgerColumnPreference } from "@/lib/hooks/useMoneyDebtLedgerColumnPreference";
import ColumnPicker, { ColumnPickerOption } from "@/components/reports/ColumnPicker";
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

const ALL_COLUMNS: ColumnPickerOption<MoneyDebtLedgerColumnKey>[] = [
  { key: "date", label: "Ngày" },
  { key: "code", label: "Mã GD" },
  { key: "party", label: "Money Changer / Đối tượng" },
  { key: "type", label: "Loại" },
  { key: "content", label: "Nội dung" },
  { key: "supplier", label: "Nhà cung cấp" },
  { key: "order", label: "Đơn hàng" },
  { key: "currency", label: "Currency" },
  { key: "in", label: "IN" },
  { key: "out", label: "OUT" },
  { key: "fxRate", label: "Tỷ giá" },
  { key: "status", label: "Trạng thái" },
  { key: "actions", label: "Thao tác" },
];

interface Props {
  entries: MoneyDebtLedgerEntry[];
  isLoading?: boolean;
  onEdit?: (entry: MoneyDebtLedgerEntry) => void;
  onRowClick?: (entry: MoneyDebtLedgerEntry) => void;
}

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
 * Column visibility (this stage) is purely presentational — hiding a
 * column never changes what's fetched, filtered, or calculated; it only
 * changes which <td>/<th> render. Desktop renders a real <table>; below
 * `md` it renders a compact stacked card list instead (Phase O), and the
 * "Chọn cột" picker works identically on both (it toggles the same
 * `visibleColumns` set the mobile cards also read from). */
export default function MoneyDebtLedgerTable({ entries, isLoading = false, onEdit, onRowClick }: Props) {
  const availableColumns = onEdit ? ALL_COLUMNS : ALL_COLUMNS.filter((c) => c.key !== "actions");
  const availableKeys = availableColumns.map((c) => c.key);
  const { visibleColumns, setVisibleColumns, resetToDefault } = useMoneyDebtLedgerColumnPreference<MoneyDebtLedgerColumnKey>(availableKeys);

  const correctionsByOriginalId = new Map<string, MoneyDebtLedgerEntry[]>();
  for (const e of entries) {
    if (!e.corrects_entry_id) continue;
    const list = correctionsByOriginalId.get(e.corrects_entry_id) ?? [];
    list.push(e);
    correctionsByOriginalId.set(e.corrects_entry_id, list);
  }

  const columnPicker = (
    <ColumnPicker
      testId="money-debt-ledger-column-picker"
      columns={availableColumns}
      visibleKeys={visibleColumns}
      onChange={setVisibleColumns}
      onReset={resetToDefault}
    />
  );

  if (isLoading) {
    return (
      <>
        <div className="flex justify-end mb-2">{columnPicker}</div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <div className="flex justify-end mb-2">{columnPicker}</div>
        <div className="bg-card rounded-xl p-12 text-center border border-border">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <BookText className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Không có giao dịch nào khớp với bộ lọc hiện tại</p>
        </div>
      </>
    );
  }

  const col = (key: MoneyDebtLedgerColumnKey) => visibleColumns.has(key);

  return (
    <>
      <div className="flex justify-end mb-2">{columnPicker}</div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="money-debt-ledger-table" className="w-full min-w-[1300px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {col("date") && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ngày</th>}
              {col("code") && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mã GD</th>}
              {col("party") && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Money Changer / Đối tượng</th>
              )}
              {col("type") && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loại</th>}
              {col("content") && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nội dung</th>}
              {col("supplier") && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nhà cung cấp</th>
              )}
              {col("order") && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Đơn hàng</th>}
              {col("currency") && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tiền</th>}
              {col("in") && <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">IN</th>}
              {col("out") && <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">OUT</th>}
              {col("fxRate") && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tỷ giá</th>}
              {col("status") && <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>}
              {col("actions") && onEdit && (
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Thao tác</th>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const corrections = correctionsByOriginalId.get(e.id) ?? [];
              const isCorrection = !!e.corrects_entry_id;
              const supplier = resolveSupplier(e);
              return (
                <tr
                  key={e.id}
                  data-testid={`money-debt-ledger-row-${e.id}`}
                  onClick={() => onRowClick?.(e)}
                  className={`border-b border-border last:border-0 hover:bg-muted/30 ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {col("date") && <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{formatDate(e.transaction_date)}</td>}
                  {col("code") && <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{e.entry_code}</td>}
                  {col("party") && <td className="px-4 py-3 text-sm text-foreground">{e.party?.name ?? "—"}</td>}
                  {col("type") && (
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{moneyDebtLedgerTypeLabel(e.transaction_type)}</td>
                  )}
                  {col("content") && (
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-[240px] truncate" title={describeContent(e, entries)}>
                      {describeContent(e, entries)}
                    </td>
                  )}
                  {col("supplier") && (
                    <td className="px-4 py-3 text-sm text-foreground" data-testid={`money-debt-ledger-supplier-${e.id}`}>
                      {supplier ? (
                        <Link href={`/partners/${supplier.id}`} className="text-primary hover:underline">
                          {supplier.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {col("order") && (
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
                  )}
                  {col("currency") && <td className="px-4 py-3 text-sm text-muted-foreground">{e.currency}</td>}
                  {col("in") && (
                    <td className="px-4 py-3 text-sm text-right tabular-nums text-secondary font-medium">
                      {e.direction === "IN" ? formatAmount(e.amount, e.currency) : ""}
                    </td>
                  )}
                  {col("out") && (
                    <td className="px-4 py-3 text-sm text-right tabular-nums text-destructive font-medium">
                      {e.direction === "OUT" ? formatAmount(e.amount, e.currency) : ""}
                    </td>
                  )}
                  {col("fxRate") && (
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{e.fx_rate ? `1=${vnd.format(e.fx_rate)}` : "—"}</td>
                  )}
                  {col("status") && (
                    <td className="px-4 py-3 text-sm">
                      {isCorrection && <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Điều chỉnh</span>}
                      {corrections.length > 0 && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
                          Đã điều chỉnh ({corrections.length})
                        </span>
                      )}
                      {!isCorrection && corrections.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  )}
                  {col("actions") && onEdit && (
                    <td className="px-4 py-3 text-sm text-right">
                      <button
                        type="button"
                        data-testid={`money-debt-ledger-edit-${e.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Sửa (tạo điều chỉnh)"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEdit(e);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
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
