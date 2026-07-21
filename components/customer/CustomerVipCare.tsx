"use client";

import { useEffect, useState } from "react";
import { Sparkles, CalendarClock, CheckCircle2, StickyNote, Wallet, ShoppingBag } from "lucide-react";
import { Customer } from "@/types/customer";
import { CustomerPurchaseSummary } from "@/types/purchase";
import {
  parseCustomerNotes,
  parseMultiValue,
  updateCustomerStatus,
  updateCustomerTags,
  scheduleFollowUp,
  completeFollowUp,
} from "@/lib/customer.service";
import { getCustomerRevenue } from "@/lib/purchase.service";
import { useTagOptions } from "@/lib/hooks/useTagOptions";
import {
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_STATUS_BADGE_VARIANT,
  FOLLOWUP_URGENCY_BADGE_VARIANT,
  FOLLOWUP_URGENCY_LABEL,
  getFollowUpUrgency,
  labelFor,
} from "@/lib/customer.constants";
import { formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import CreatableMultiSelect from "@/components/ui/CreatableMultiSelect";

interface Props {
  customer: Customer;
  onUpdate: (updated: Customer) => void;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function CustomerVipCare({ customer, onUpdate }: Props) {
  const [summary, setSummary] = useState<CustomerPurchaseSummary | null>(null);
  const [followUpDate, setFollowUpDate] = useState(customer.next_followup_date || "");
  const [followUpNote, setFollowUpNote] = useState(customer.followup_note || "");
  const [isSaving, setIsSaving] = useState(false);

  const tagOptions = useTagOptions("customer_tag", customer.customer_tags);
  const tags = parseMultiValue(customer.customer_tags);
  const notes = parseCustomerNotes(customer.notes);
  const latestNote = notes[0];
  const urgency = getFollowUpUrgency(customer.next_followup_date);

  useEffect(() => {
    if (!customer.id) return;
    getCustomerRevenue(customer.id, null).then(setSummary);
  }, [customer.id]);

  useEffect(() => {
    setFollowUpDate(customer.next_followup_date || "");
    setFollowUpNote(customer.followup_note || "");
  }, [customer.id, customer.next_followup_date, customer.followup_note]);

  async function handleStatusChange(newStatus: string) {
    if (!customer.id) return;
    setIsSaving(true);
    try {
      const { data, error } = await updateCustomerStatus(customer.id, notes, newStatus, customer.customer_status);
      if (error) throw error;
      if (data) onUpdate(data);
    } catch (error) {
      alert("Lỗi khi cập nhật trạng thái");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTagsChange(newTags: string[]) {
    if (!customer.id) return;
    setIsSaving(true);
    try {
      const { data, error } = await updateCustomerTags(customer.id, notes, newTags, tags);
      if (error) throw error;
      if (data) onUpdate(data);
    } catch (error) {
      alert("Lỗi khi cập nhật tag");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleScheduleFollowUp() {
    if (!customer.id || !followUpDate) return;
    setIsSaving(true);
    try {
      const { data, error } = await scheduleFollowUp(customer.id, notes, followUpDate, followUpNote.trim());
      if (error) throw error;
      if (data) onUpdate(data);
    } catch (error) {
      alert("Lỗi khi lưu lịch chăm sóc");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCompleteFollowUp() {
    if (!customer.id) return;
    setIsSaving(true);
    try {
      const { data, error } = await completeFollowUp(customer.id, notes);
      if (error) throw error;
      if (data) onUpdate(data);
    } catch (error) {
      alert("Lỗi khi hoàn tất lịch chăm sóc");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        Chăm sóc VIP
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
            <Wallet className="w-3.5 h-3.5" />
            Doanh thu trọn đời
          </p>
          <p className="text-base font-semibold text-foreground">
            {summary ? currency.format(summary.totalRevenue) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
            <ShoppingBag className="w-3.5 h-3.5" />
            Số đơn đã mua
          </p>
          <p className="text-base font-semibold text-foreground">{summary?.count ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
            <ShoppingBag className="w-3.5 h-3.5" />
            Mua gần nhất
          </p>
          <p className="text-base font-semibold text-foreground">
            {summary?.lastPurchaseDate ? formatDate(summary.lastPurchaseDate) : "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Trạng thái</label>
          <div className="flex items-center gap-2">
            <Select
              options={CUSTOMER_STATUS_OPTIONS}
              value={customer.customer_status || "New"}
              disabled={isSaving}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="flex-1"
            />
            <Badge variant={CUSTOMER_STATUS_BADGE_VARIANT[customer.customer_status || "New"] || "muted"}>
              {labelFor(CUSTOMER_STATUS_OPTIONS, customer.customer_status) || "Mới"}
            </Badge>
          </div>
        </div>

        <CreatableMultiSelect
          label="Tags"
          placeholder="Nhập hoặc chọn tag..."
          options={tagOptions.options}
          values={tags}
          onChange={handleTagsChange}
          onCreate={tagOptions.createOption}
        />
      </div>

      <div className="border-t border-border pt-4 mb-5">
        <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-primary" />
          Lịch chăm sóc tiếp theo
        </p>

        {customer.next_followup_date && (
          <div className="flex items-center gap-2 mb-3">
            <Badge variant={FOLLOWUP_URGENCY_BADGE_VARIANT[urgency]}>
              {formatDate(customer.next_followup_date)} · {FOLLOWUP_URGENCY_LABEL[urgency]}
            </Badge>
            <Button variant="secondary" size="sm" onClick={handleCompleteFollowUp} disabled={isSaving}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Hoàn tất
            </Button>
          </div>
        )}
        {customer.followup_note && (
          <p className="text-sm text-muted-foreground mb-3">{customer.followup_note}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 items-start">
          <Input
            type="date"
            value={followUpDate}
            disabled={isSaving}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="sm:w-40"
          />
          <Input
            placeholder="Ghi chú follow-up..."
            value={followUpNote}
            disabled={isSaving}
            onChange={(e) => setFollowUpNote(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          className="mt-2"
          onClick={handleScheduleFollowUp}
          disabled={isSaving || !followUpDate}
        >
          Lưu lịch hẹn
        </Button>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
          <StickyNote className="w-4 h-4 text-primary" />
          Ghi chú gần nhất
        </p>
        <p className="text-sm text-muted-foreground">
          {latestNote ? latestNote.content : "Chưa có ghi chú nào."}
        </p>
      </div>
    </Card>
  );
}
