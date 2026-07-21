"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import { getActiveRulesForPicker, searchCustomersForBalance } from "@/lib/marketing/loyalty.service";
import { LOYALTY_TXN_TYPE_OPTIONS } from "@/lib/marketing/marketing.constants";
import { LoyaltyTransactionType } from "@/types/marketingAutomation";
import { Option } from "@/lib/customer.constants";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: { customerId: string; ruleId: string | null; transactionType: LoyaltyTransactionType; points: number; note: string }) => Promise<void>;
  /** Pre-selected customer, e.g. opened from that customer's Balance view. */
  initialCustomerId?: string;
}

/** The only write path this sprint (no automatic point calculation, Spec
 * Rev.2 decision #8) - a manual transaction-entry form. */
export default function LoyaltyTransactionFormModal({ open, onClose, onSave, initialCustomerId }: Props) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: string; full_name: string; customer_code: string }[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [ruleOptions, setRuleOptions] = useState<Option[]>([]);
  const [ruleId, setRuleId] = useState("");
  const [transactionType, setTransactionType] = useState<LoyaltyTransactionType>("Earn");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getActiveRulesForPicker().then((rules) => setRuleOptions(rules.map((r) => ({ value: r.id, label: r.name }))));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomerId(initialCustomerId || "");
    setCustomerSearch("");
    setRuleId("");
    setTransactionType("Earn");
    setPoints("");
    setNote("");
    setError("");
  }, [open, initialCustomerId]);

  useEffect(() => {
    if (!customerSearch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerResults([]);
      return;
    }
    const timeout = setTimeout(() => searchCustomersForBalance(customerSearch).then(setCustomerResults), 300);
    return () => clearTimeout(timeout);
  }, [customerSearch]);

  async function handleSubmit() {
    const pointsNum = Number(points);
    if (!customerId || !pointsNum) {
      setError("Vui lòng chọn khách hàng và nhập số điểm khác 0.");
      return;
    }
    setIsSaving(true);
    await onSave({ customerId, ruleId: ruleId || null, transactionType, points: pointsNum, note });
    setIsSaving(false);
  }

  return (
    <Modal open={open} title="Giao dịch điểm mới" onClose={onClose}>
      <div className="space-y-4">
        {!initialCustomerId && (
          <div>
            <SearchInput placeholder="Tìm khách hàng..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} onClear={() => setCustomerSearch("")} />
            {customerResults.length > 0 && (
              <div className="mt-2 border border-border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setCustomerId(c.id); setCustomerSearch(`${c.customer_code} · ${c.full_name}`); setCustomerResults([]); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    {c.customer_code} · {c.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Select
          label="Loại giao dịch"
          options={LOYALTY_TXN_TYPE_OPTIONS}
          value={transactionType}
          onChange={(e) => setTransactionType(e.target.value as LoyaltyTransactionType)}
        />
        <Input label="Số điểm (âm để trừ)" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
        <Select label="Quy tắc (tùy chọn)" options={ruleOptions} placeholder="Không chọn" value={ruleId} onChange={(e) => setRuleId(e.target.value)} />
        <Input label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit} isLoading={isSaving}>Lưu</Button>
        </div>
      </div>
    </Modal>
  );
}
