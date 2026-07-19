"use client";

import { useState } from "react";
import { PhoneCall, CheckCircle2, Send } from "lucide-react";
import { Customer } from "@/types/customer";
import { parseCustomerNotes, addCustomerNote, updateLastContacted } from "@/lib/customer.service";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

interface Props {
  customer: Customer;
  onUpdate: (updated: Customer) => void;
}

function relativeContact(iso?: string): string {
  if (!iso) return "Chưa từng liên hệ";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Đã liên hệ hôm nay";
  if (days === 1) return "Đã liên hệ hôm qua";
  return `Đã liên hệ ${days} ngày trước`;
}

export default function CustomerFollowUp({ customer, onUpdate }: Props) {
  const [quickNote, setQuickNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleMarkContacted() {
    if (!customer.id) return;
    setIsSaving(true);
    try {
      const { data, error } = await updateLastContacted(customer.id);
      if (error) throw error;
      if (data) onUpdate(data);
    } catch (error) {
      alert("Lỗi khi đánh dấu đã liên hệ");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQuickFollowUp() {
    if (!customer.id || !quickNote.trim()) return;
    setIsSaving(true);
    try {
      const currentNotes = parseCustomerNotes(customer.notes);
      const { data, error } = await addCustomerNote(customer.id, currentNotes, quickNote.trim(), {
        markContacted: true,
      });
      if (error) throw error;
      if (data) {
        onUpdate(data);
        setQuickNote("");
      }
    } catch (error) {
      alert("Lỗi khi lưu ghi chú chăm sóc");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
        <PhoneCall className="w-5 h-5 text-primary" />
        Chăm sóc khách hàng
      </h2>
      <p className="text-sm text-muted-foreground mb-4">{relativeContact(customer.last_contacted)}</p>

      <div className="space-y-2 mb-3">
        <textarea
          placeholder="Ghi chú follow-up nhanh (VD: Đã gọi tư vấn vòng ngọc)..."
          value={quickNote}
          onChange={(e) => setQuickNote(e.target.value)}
          rows={2}
          disabled={isSaving}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        />
        <Button
          variant="primary"
          size="sm"
          fullWidth
          onClick={handleQuickFollowUp}
          disabled={isSaving || !quickNote.trim()}
        >
          <Send className="w-4 h-4" />
          Gửi & đánh dấu đã liên hệ
        </Button>
      </div>

      <Button
        variant="secondary"
        size="sm"
        fullWidth
        onClick={handleMarkContacted}
        disabled={isSaving}
      >
        <CheckCircle2 className="w-4 h-4" />
        Chỉ đánh dấu đã liên hệ
      </Button>
    </Card>
  );
}
