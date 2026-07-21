"use client";

import { ReactNode } from "react";
import { Customer } from "@/types/customer";
import { BadgeVariant } from "@/lib/customer.constants";
import Badge from "@/components/ui/Badge";
import FollowUpRow from "./FollowUpRow";

interface Props {
  title: string;
  icon: ReactNode;
  badgeVariant?: BadgeVariant;
  customers: Customer[];
  isSaving: boolean;
  showActions?: boolean;
  emptyLabel: string;
  onComplete: (customer: Customer) => void;
  onReschedule: (customer: Customer) => void;
}

export default function FollowUpSection({
  title,
  icon,
  badgeVariant = "default",
  customers,
  isSaving,
  showActions = true,
  emptyLabel,
  onComplete,
  onReschedule,
}: Props) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border">
        {icon}
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <Badge variant={badgeVariant}>{customers.length}</Badge>
      </div>

      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{emptyLabel}</p>
      ) : (
        <div>
          {customers.map((customer) => (
            <FollowUpRow
              key={customer.id}
              customer={customer}
              isSaving={isSaving}
              showActions={showActions}
              onComplete={onComplete}
              onReschedule={onReschedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}
