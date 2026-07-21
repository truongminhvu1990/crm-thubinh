"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import { searchCustomersForBalance } from "@/lib/marketing/loyalty.service";
import { MarketingVoucher } from "@/types/marketingAutomation";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: { code: string; name: string; description: string; customerId: string | null; startDate: string; endDate: string }) => Promise<void>;
  voucher?: MarketingVoucher | null;
}

/** Simple flat form (no wizard) - matches Rule Detail's flat-entity
 * treatment (MARKETING_AUTOMATION_UI.md §3.8). */
export default function VoucherFormModal({ open, onClose, onSave, voucher }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: string; full_name: string; customer_code: string }[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(voucher?.code || "");
    setName(voucher?.name || "");
    setDescription(voucher?.description || "");
    setCustomerId(voucher?.customer_id || null);
    setCustomerSearch(voucher?.customer ? `${voucher.customer.customer_code} · ${voucher.customer.full_name}` : "");
    setStartDate(voucher?.start_date || "");
    setEndDate(voucher?.end_date || "");
    setError("");
  }, [open, voucher]);

  useEffect(() => {
    if (!customerSearch || customerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerResults([]);
      return;
    }
    const timeout = setTimeout(() => searchCustomersForBalance(customerSearch).then(setCustomerResults), 300);
    return () => clearTimeout(timeout);
  }, [customerSearch, customerId]);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Vui lòng nhập tên voucher.");
      return;
    }
    if (endDate && startDate && endDate < startDate) {
      setError("Ngày kết thúc không được trước ngày bắt đầu.");
      return;
    }
    setIsSaving(true);
    await onSave({ code, name, description, customerId, startDate, endDate });
    setIsSaving(false);
  }

  return (
    <Modal open={open} title={voucher ? "Sửa voucher" : "Voucher mới"} onClose={onClose}>
      <div className="space-y-4">
        <Input label="Mã voucher (để trống để tự sinh)" value={code} onChange={(e) => setCode(e.target.value)} disabled={!!voucher} />
        <Input label="Tên voucher" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div>
          <SearchInput
            placeholder="Gán cho khách hàng (tùy chọn)..."
            value={customerSearch}
            onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(null); }}
            onClear={() => { setCustomerSearch(""); setCustomerId(null); }}
          />
          {customerResults.length > 0 && (
            <div className="mt-2 border border-border rounded-lg divide-y divide-border max-h-32 overflow-y-auto">
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
        <div className="grid grid-cols-2 gap-3">
          <Input label="Ngày bắt đầu" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="Ngày kết thúc" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit} isLoading={isSaving}>Lưu</Button>
        </div>
      </div>
    </Modal>
  );
}
