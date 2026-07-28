"use client";

import { useState } from "react";
import { EXPENSE_CATEGORIES, ExpenseCategory, OperatingExpense } from "@/types/operatingExpenses";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CurrencyInput from "@/components/ui/CurrencyInput";
import Button from "@/components/ui/Button";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  Advertising: "Quảng cáo",
  Shipping: "Vận chuyển",
  Packaging: "Đóng gói",
  Gifts: "Quà tặng",
  "Other Expenses": "Chi phí khác",
};

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }));

interface Props {
  expense: OperatingExpense | null;
  onClose: () => void;
  onSaved: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseFormModal({ expense, onClose, onSaved }: Props) {
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date ?? todayStr());
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "Advertising");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState<number | undefined>(expense?.amount);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!amount || amount <= 0) {
      setError("Vui lòng nhập số tiền hợp lệ");
      return;
    }

    setIsSaving(true);
    try {
      const url = expense ? `/api/reports/operating-expenses/${expense.id}` : "/api/reports/operating-expenses";
      const res = await fetch(url, {
        method: expense ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expense_date: expenseDate, category, description, amount }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Lỗi khi lưu chi phí");
        return;
      }
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open title={expense ? "Sửa chi phí" : "Thêm chi phí"} onClose={onClose} testId="expense-form-modal">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Ngày chi phí"
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          required
          data-testid="expense-date-input"
        />
        <Select
          label="Danh mục"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
        />
        <Input
          label="Mô tả"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Không bắt buộc"
        />
        <CurrencyInput label="Số tiền" value={amount} onChange={setAmount} testId="expense-amount-input" />

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" isLoading={isSaving} data-testid="expense-form-submit-button">
            {expense ? "Lưu thay đổi" : "Thêm chi phí"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
