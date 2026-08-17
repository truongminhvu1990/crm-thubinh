"use client";

import Link from "next/link";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { MoneyDebtLedgerEntry } from "@/types/moneyDebtLedger";
import { moneyDebtLedgerTypeLabel } from "@/lib/moneyDebtLedger/moneyDebtLedger.constants";
import {
  resolveSupplier,
  resolveMoneyChangerForSupplierPayment,
  resolveSupplierPaymentCnyAmount,
  resolveSupplierPaymentVndAmount,
} from "@/lib/moneyDebtLedger/moneyDebtLedgerDisplay";
import { formatDate } from "@/lib/utils";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function formatAmount(amount: number, currency: string): string {
  return currency === "VND" ? vnd.format(amount) : `¥${cny.format(amount)}`;
}
function signedAmount(e: Pick<MoneyDebtLedgerEntry, "amount" | "direction">): number {
  return e.direction === "IN" ? e.amount : -e.amount;
}

interface Props {
  entry: MoneyDebtLedgerEntry | null;
  /** Every entry currently in view — used only to resolve correction
   * lineage (original <-> correction rows) for display. Best-effort within
   * the current filtered view, same as the table's own inline summary
   * (Stage 19C) — not a separate fetch. */
  allEntries: MoneyDebtLedgerEntry[];
  onClose: () => void;
  onEdit?: (entry: MoneyDebtLedgerEntry) => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground text-right font-medium">{value}</span>
    </div>
  );
}

/** Same row shape as Field, but the value is a clickable link into an
 * existing route (Order Detail, Partner Detail) — never a new page. */
function LinkField({ label, href, text }: { label: string; href: string; text: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Link href={href} className="text-sm text-primary hover:underline text-right font-medium">
        {text}
      </Link>
    </div>
  );
}

/** Stage 20 Phase H — the full transaction detail view. Everything shown
 * here is derived from fields the ledger already returns (no new fetch,
 * no new business logic) — this component only formats/labels/links what
 * getLedgerEntries()'s existing joins (party, payment, order->customer)
 * already provide. Raw ids are never shown unless there's genuinely
 * nothing more useful to show in their place (e.g. an order/payment that
 * failed to join). */
export default function TransactionDetailModal({ entry, allEntries, onClose, onEdit }: Props) {
  if (!entry) return null;

  const corrections = allEntries.filter((e) => e.corrects_entry_id === entry.id);
  const correctsOriginal = entry.corrects_entry_id ? allEntries.find((e) => e.id === entry.corrects_entry_id) : null;
  const netEffect = corrections.length > 0 ? signedAmount(entry) + corrections.reduce((sum, c) => sum + signedAmount(c), 0) : null;

  return (
    <Modal open={!!entry} title={`Chi tiết giao dịch ${entry.entry_code}`} onClose={onClose} testId="transaction-detail-modal">
      <div className="flex items-center gap-2 mb-4">
        <Badge variant={entry.direction === "IN" ? "success" : "destructive"}>{entry.direction === "IN" ? "TIỀN VÀO" : "TIỀN RA"}</Badge>
        <span className="text-2xl font-bold text-foreground">{formatAmount(entry.amount, entry.currency)}</span>
      </div>

      <div className="space-y-0.5 mb-4">
        <Field label="Mã giao dịch" value={entry.entry_code} />
        <Field label="Ngày" value={formatDate(entry.transaction_date)} />
        <Field label="Loại giao dịch" value={moneyDebtLedgerTypeLabel(entry.transaction_type)} />
        <Field label="Đối tượng" value={entry.party ? `${entry.party.name} (${entry.party.partner_type})` : "—"} />
        <Field label="Currency" value={entry.currency} />
        {/* FX rate / transaction_group are shown in the dedicated Supplier
            Payment block below instead, for that transaction_type only —
            avoids showing the same 2 fields twice on those rows. */}
        {entry.transaction_type !== "Supplier Payment via Money Changer" && (
          <>
            <Field label="FX rate" value={entry.fx_rate ? `1 CNY = ${vnd.format(entry.fx_rate)}` : null} />
            <Field label="Nhóm giao dịch (transaction_group)" value={entry.transaction_group} />
          </>
        )}
        <Field label="Tham chiếu" value={entry.reference} />
        <Field label="Ghi chú" value={entry.note} />
      </div>

      {/* Phase 8 — Customer Payment: Payment Method, Receiving Account,
          Money Changer, Customer, Order (clickable), Payment amount,
          Ledger amount. Money Changer = entry.party directly (this
          transaction_type's own party IS the Money Changer, per
          sync_payment_to_money_debt_ledger's write shape). */}
      {(entry.payment || entry.order) && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4 space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Payment / Order</p>
          {entry.payment && <Field label="Payment Method" value={entry.payment.payment_method} />}
          {entry.payment?.receiving_account && (
            <Field
              label="Receiving Account"
              value={`${entry.payment.receiving_account.bank?.value ?? "—"} · ${entry.payment.receiving_account.account_number}${entry.payment.receiving_account.label ? ` (${entry.payment.receiving_account.label})` : ""}`}
            />
          )}
          {entry.party?.partner_type === "Money Changer" && <Field label="Money Changer" value={entry.party.name} />}
          {entry.order?.customer && <Field label="Khách hàng" value={entry.order.customer.full_name} />}
          {entry.order && <LinkField label="Order / Invoice" href={`/orders/${entry.order.id}`} text={entry.order.order_number} />}
          {entry.payment && <Field label="Payment amount" value={formatAmount(entry.payment.amount, "VND")} />}
          <Field label="Ledger amount" value={formatAmount(entry.amount, entry.currency)} />
        </div>
      )}

      {/* Phase 7/8 — Supplier Payment via Money Changer: Money Changer,
          Supplier (clickable to Partner Detail), CNY amount, FX rate, VND
          equivalent, transaction_group. Resolved via transaction_group
          regardless of which of the 2 paired legs is being viewed. */}
      {entry.transaction_type === "Supplier Payment via Money Changer" &&
        (() => {
          const moneyChanger = resolveMoneyChangerForSupplierPayment(entry);
          const supplier = resolveSupplier(entry);
          const cnyAmount = resolveSupplierPaymentCnyAmount(entry);
          const vndAmount = resolveSupplierPaymentVndAmount(entry);
          return (
            <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4 space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Thanh toán nhà cung cấp qua Money Changer</p>
              {moneyChanger && <Field label="Money Changer" value={moneyChanger.name} />}
              {supplier && <LinkField label="Supplier" href={`/partners/${supplier.id}`} text={supplier.name} />}
              {cnyAmount !== null && <Field label="CNY amount" value={`¥${cny.format(cnyAmount)}`} />}
              {entry.fx_rate && <Field label="FX rate" value={`1 CNY = ${vnd.format(entry.fx_rate)}`} />}
              {vndAmount !== null && <Field label="VND equivalent" value={vnd.format(vndAmount)} />}
              <Field label="Transaction group" value={entry.transaction_group} />
            </div>
          );
        })()}

      {(corrections.length > 0 || correctsOriginal !== null) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 mb-4 space-y-1">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">Correction</p>
          {correctsOriginal && (
            <p className="text-sm text-amber-900">
              Đây là điều chỉnh cho <span className="font-semibold">{correctsOriginal.entry_code}</span> (
              {signedAmount(entry) >= 0 ? "+" : ""}
              {formatAmount(signedAmount(entry), entry.currency)}). Giao dịch gốc không bị thay đổi.
            </p>
          )}
          {corrections.length > 0 && (
            <div className="text-sm text-amber-900 space-y-0.5">
              <p>
                Gốc: <span className="font-medium">{formatAmount(entry.amount, entry.currency)}</span> ({entry.direction})
              </p>
              {corrections.map((c) => (
                <p key={c.id}>
                  Điều chỉnh {c.entry_code}: {signedAmount(c) >= 0 ? "+" : ""}
                  {formatAmount(signedAmount(c), c.currency)}
                </p>
              ))}
              <p className="font-semibold">
                Net: {formatAmount(Math.abs(netEffect!), entry.currency)} {netEffect! >= 0 ? "IN" : "OUT"}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Created by" value={entry.created_by_staff?.full_name ?? (entry.created_by ? "—" : "Hệ thống")} />
        <Field label="Created at" value={new Date(entry.created_at).toLocaleString("vi-VN")} />
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="transaction-detail-close-button" variant="secondary" onClick={onClose}>
          Đóng
        </Button>
        {onEdit && (
          <Button
            data-testid="transaction-detail-edit-button"
            variant="primary"
            onClick={() => {
              onClose();
              onEdit(entry);
            }}
          >
            Chỉnh sửa / Điều chỉnh
          </Button>
        )}
      </div>
    </Modal>
  );
}
