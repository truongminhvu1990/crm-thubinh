"use client";

import { useState } from "react";
import { CheckCircle2, BadgeCheck } from "lucide-react";
import { SalesCommission } from "@/types/commission";
import { approveCommission, markCommissionPaid } from "@/lib/commission/commission.service";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface Props {
  commission: SalesCommission;
  onUpdate: (updated: SalesCommission) => void;
}

/** Feature 5: Pending -> Approve -> Paid, no skipping straight from Pending
 * to Paid. Paid is terminal - no action renders once status is "Paid". */
export default function CommissionStatusActions({ commission, onUpdate }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [paidBy, setPaidBy] = useState("");
  const [note, setNote] = useState("");

  async function handleApprove() {
    setIsSaving(true);
    try {
      const { data, error } = await approveCommission(commission);
      if (error) throw error;
      if (data) onUpdate(data);
    } catch (error) {
      alert("Lỗi khi duyệt hoa hồng");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMarkPaid() {
    setIsSaving(true);
    try {
      const { data, error } = await markCommissionPaid(commission, paidBy.trim(), note.trim());
      if (error) throw error;
      if (data) onUpdate(data);
    } catch (error) {
      alert("Lỗi khi đánh dấu đã thanh toán");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  if (commission.status === "Pending") {
    return (
      <Button variant="primary" onClick={handleApprove} disabled={isSaving}>
        <CheckCircle2 className="w-4 h-4" />
        Duyệt hoa hồng
      </Button>
    );
  }

  if (commission.status === "Approved") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Người thanh toán"
            placeholder="Tên người thanh toán..."
            value={paidBy}
            disabled={isSaving}
            onChange={(e) => setPaidBy(e.target.value)}
          />
          <Input
            label="Ghi chú (không bắt buộc)"
            placeholder="Ghi chú..."
            value={note}
            disabled={isSaving}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button variant="primary" onClick={handleMarkPaid} disabled={isSaving}>
          <BadgeCheck className="w-4 h-4" />
          Đánh dấu đã thanh toán
        </Button>
      </div>
    );
  }

  return null;
}
