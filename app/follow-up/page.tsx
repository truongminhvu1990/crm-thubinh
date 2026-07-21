"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck, CalendarClock, CheckCircle2 } from "lucide-react";
import { Customer } from "@/types/customer";
import { getCustomers, parseCustomerNotes, completeFollowUp, scheduleFollowUp } from "@/lib/customer.service";
import { getFollowUpUrgency, wasFollowUpCompletedToday } from "@/lib/customer.constants";
import FollowUpSection from "@/components/followup/FollowUpSection";
import FollowUpRescheduleModal from "@/components/followup/FollowUpRescheduleModal";

export default function FollowUpCenterPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalCustomer, setModalCustomer] = useState<Customer | null>(null);
  const [modalMode, setModalMode] = useState<"complete" | "reschedule">("reschedule");

  async function loadCustomers() {
    setIsLoading(true);
    const data = await getCustomers();
    setCustomers(data);
    setIsLoading(false);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  function applyUpdate(updated: Customer) {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleComplete(customer: Customer) {
    if (!customer.id) return;
    setIsSaving(true);
    try {
      const notes = parseCustomerNotes(customer.notes);
      const { data, error } = await completeFollowUp(customer.id, notes);
      if (error) throw error;
      if (data) {
        applyUpdate(data);
        setModalMode("complete");
        setModalCustomer(data);
      }
    } catch (error) {
      alert("Lỗi khi hoàn tất lịch chăm sóc");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  function handleReschedule(customer: Customer) {
    setModalMode("reschedule");
    setModalCustomer(customer);
  }

  async function handleSaveSchedule(date: string, note: string) {
    if (!modalCustomer?.id || !date) return;
    setIsSaving(true);
    try {
      const notes = parseCustomerNotes(modalCustomer.notes);
      const { data, error } = await scheduleFollowUp(modalCustomer.id, notes, date, note);
      if (error) throw error;
      if (data) {
        applyUpdate(data);
        setModalCustomer(null);
      }
    } catch (error) {
      alert("Lỗi khi lưu lịch chăm sóc");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  const overdue = customers.filter((c) => getFollowUpUrgency(c.next_followup_date) === "overdue");
  const today = customers.filter((c) => getFollowUpUrgency(c.next_followup_date) === "today");
  const next7Days = customers.filter((c) => getFollowUpUrgency(c.next_followup_date) === "soon");
  const completedToday = customers.filter((c) => wasFollowUpCompletedToday(parseCustomerNotes(c.notes)));

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Follow-up Center</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Chăm sóc khách hàng theo lịch follow-up - cập nhật không cần tải lại trang.
        </p>
      </div>

      <div className="space-y-6">
        <FollowUpSection
          title="Quá hạn"
          icon={<AlertTriangle className="w-4.5 h-4.5 text-destructive" />}
          badgeVariant="destructive"
          customers={overdue}
          isSaving={isSaving}
          emptyLabel="Không có khách hàng quá hạn follow-up."
          onComplete={handleComplete}
          onReschedule={handleReschedule}
        />

        <FollowUpSection
          title="Hôm nay"
          icon={<CalendarClock className="w-4.5 h-4.5 text-amber-600" />}
          badgeVariant="warning"
          customers={today}
          isSaving={isSaving}
          emptyLabel="Không có lịch follow-up hôm nay."
          onComplete={handleComplete}
          onReschedule={handleReschedule}
        />

        <FollowUpSection
          title="7 ngày tới"
          icon={<CalendarCheck className="w-4.5 h-4.5 text-primary" />}
          badgeVariant="default"
          customers={next7Days}
          isSaving={isSaving}
          emptyLabel="Không có lịch follow-up trong 7 ngày tới."
          onComplete={handleComplete}
          onReschedule={handleReschedule}
        />

        <FollowUpSection
          title="Đã hoàn tất hôm nay"
          icon={<CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />}
          badgeVariant="success"
          customers={completedToday}
          isSaving={isSaving}
          showActions={false}
          emptyLabel="Chưa hoàn tất lịch follow-up nào hôm nay."
          onComplete={handleComplete}
          onReschedule={handleReschedule}
        />
      </div>

      <FollowUpRescheduleModal
        key={modalCustomer?.id ?? "closed"}
        open={!!modalCustomer}
        mode={modalMode}
        isSaving={isSaving}
        onClose={() => setModalCustomer(null)}
        onSave={handleSaveSchedule}
      />
    </div>
  );
}
