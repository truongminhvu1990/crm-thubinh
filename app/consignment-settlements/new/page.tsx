"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { CONSIGNMENT_SETTLEMENT_METHOD_OPTIONS } from "@/lib/consignment/consignmentSettlement.constants";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface EligibleConsignmentFinancialRecord {
  id: string;
  customer_payable: number;
  consignment: { id: string; consignment_code: string; customer_id: string; customer?: { id: string; full_name: string } | null } | null;
}

/** Create Consignment Settlement (D8/D03/D04, LOCKED). Multiple Financial
 * Records may be selected, but must share the same Consignor (Customer) —
 * enforced by the service layer, surfaced here as a disabled checkbox once
 * a different customer has been picked, matching /settlements/new's own
 * Partner-based pattern exactly. */
export default function CreateConsignmentSettlementPage() {
  const router = useRouter();
  const [records, setRecords] = useState<EligibleConsignmentFinancialRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState("Bank Transfer");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/consignment-financial-records/eligible")
      .then((res) => (res.ok ? res.json() : []))
      .then(setRecords)
      .catch((error) => console.error("Failed to load eligible consignment financial records:", error))
      .finally(() => setIsLoading(false));
  }, []);

  const selectedRows = records.filter((r) => selected.has(r.id));
  const selectedCustomerId = selectedRows[0]?.consignment?.customer_id ?? null;
  const total = selectedRows.reduce((sum, r) => sum + r.customer_payable, 0);

  function toggle(record: EligibleConsignmentFinancialRecord) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(record.id)) {
        next.delete(record.id);
      } else {
        next.add(record.id);
      }
      return next;
    });
  }

  async function handleSave() {
    setFormError(null);
    if (selected.size === 0) {
      setFormError("Vui lòng chọn ít nhất một consignment financial record");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/consignment-settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consignment_financial_record_ids: [...selected], settlement_method: method }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể tạo consignment settlement");
      }
      const created = await res.json();
      router.push(`/consignment-settlements/${created.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="pb-8 max-w-3xl">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary mb-6 transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-primary/5"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại
      </button>

      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-6">Tạo Consignment Settlement</h1>

      <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin text-2xl">⟳</div>
          </div>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Không có consignment financial record nào chưa thuộc về settlement nào.
          </p>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Consignment Financial Record (chọn một hoặc nhiều) *
              </label>
              <div className="space-y-2">
                {records.map((r) => {
                  const customerId = r.consignment?.customer_id ?? null;
                  const disabled = selectedCustomerId !== null && customerId !== selectedCustomerId && !selected.has(r.id);
                  return (
                    <label
                      key={r.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm ${
                        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-muted/40"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r)}
                          disabled={disabled}
                          data-testid="consignment-settlement-record-checkbox"
                        />
                        <span>
                          <span className="font-medium">{r.consignment?.consignment_code ?? "—"}</span> ·{" "}
                          {r.consignment?.customer?.full_name ?? "—"}
                        </span>
                      </span>
                      <span className="font-medium">{currency.format(r.customer_payable)}</span>
                    </label>
                  );
                })}
              </div>
              {selectedCustomerId && (
                <p className="text-xs text-muted-foreground mt-2">
                  Chỉ có thể chọn thêm financial record của cùng một khách hàng (Consignor) trong một Settlement.
                </p>
              )}
            </div>

            {selectedRows.length > 0 && (
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm flex justify-between items-center">
                <span className="text-muted-foreground">Tổng cộng ({selectedRows.length} financial record)</span>
                <span className="font-semibold text-primary">{currency.format(total)}</span>
              </div>
            )}

            <Select
              data-testid="consignment-settlement-method-select"
              label="Phương thức Settlement"
              options={CONSIGNMENT_SETTLEMENT_METHOD_OPTIONS}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            />
          </>
        )}

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="secondary" onClick={() => router.back()} disabled={isSaving}>
            Hủy
          </Button>
          <Button data-testid="consignment-settlement-save-button" onClick={handleSave} isLoading={isSaving} disabled={records.length === 0}>
            <Send className="w-4 h-4" />
            Tạo Consignment Settlement
          </Button>
        </div>
      </div>
    </div>
  );
}
