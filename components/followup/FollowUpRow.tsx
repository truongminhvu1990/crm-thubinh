"use client";

import Link from "next/link";
import { CheckCircle2, CalendarClock, ExternalLink, Phone, User } from "lucide-react";
import { Customer } from "@/types/customer";
import { parseCustomerNotes } from "@/lib/customer.service";
import {
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_STATUS_BADGE_VARIANT,
  FOLLOWUP_URGENCY_BADGE_VARIANT,
  FOLLOWUP_URGENCY_LABEL,
  getFollowUpUrgency,
  labelFor,
} from "@/lib/customer.constants";
import { formatDate } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

interface Props {
  customer: Customer;
  isSaving: boolean;
  /** Completed Today rows have nothing left to complete/reschedule from
   * this view - they only get "Open Customer". */
  showActions?: boolean;
  onComplete: (customer: Customer) => void;
  onReschedule: (customer: Customer) => void;
}

export default function FollowUpRow({
  customer,
  isSaving,
  showActions = true,
  onComplete,
  onReschedule,
}: Props) {
  const notes = parseCustomerNotes(customer.notes);
  const latestNote = notes[0];
  const urgency = getFollowUpUrgency(customer.next_followup_date);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-3.5 px-4 border-b border-border last:border-0">
      <div className="flex items-center gap-3 sm:w-56 shrink-0 min-w-0">
        <Avatar name={customer.full_name} vip={customer.vip_level === "VIP"} size="sm" />
        <div className="min-w-0">
          <div className="font-medium text-foreground truncate">{customer.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">{customer.customer_code}</div>
        </div>
      </div>

      <div className="sm:w-32 shrink-0 text-sm text-muted-foreground flex items-center gap-1.5">
        <Phone className="w-3.5 h-3.5 shrink-0" />
        {customer.phone || "—"}
      </div>

      <div className="sm:w-32 shrink-0">
        <Badge variant={CUSTOMER_STATUS_BADGE_VARIANT[customer.customer_status || "New"] || "muted"}>
          {labelFor(CUSTOMER_STATUS_OPTIONS, customer.customer_status) || "Mới"}
        </Badge>
      </div>

      <div className="sm:w-40 shrink-0">
        {customer.next_followup_date ? (
          <Badge variant={FOLLOWUP_URGENCY_BADGE_VARIANT[urgency]}>
            {formatDate(customer.next_followup_date)} · {FOLLOWUP_URGENCY_LABEL[urgency]}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>

      <div className="flex-1 min-w-0 text-sm text-muted-foreground truncate" title={latestNote?.content}>
        {latestNote ? latestNote.content : "Chưa có ghi chú"}
      </div>

      {customer.assigned_salesperson && (
        <div className="sm:w-32 shrink-0 text-sm text-muted-foreground flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{customer.assigned_salesperson}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 shrink-0 justify-end">
        {showActions && (
          <>
            <Button variant="secondary" size="sm" disabled={isSaving} onClick={() => onComplete(customer)}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Hoàn tất</span>
            </Button>
            <Button variant="secondary" size="sm" disabled={isSaving} onClick={() => onReschedule(customer)}>
              <CalendarClock className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Đổi lịch</span>
            </Button>
          </>
        )}
        <Link href={`/customers/${customer.id}`}>
          <Button variant="primary" size="sm">
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Xem</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
