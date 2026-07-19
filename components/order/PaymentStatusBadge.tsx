import Badge from "@/components/ui/Badge";
import { PAYMENT_STATUS, PAYMENT_STATUS_BADGE_VARIANT, labelFor } from "@/lib/orders/order.constants";
import { PaymentStatus } from "@/types/order";

interface Props {
  status: PaymentStatus;
  className?: string;
}

export default function PaymentStatusBadge({ status, className }: Props) {
  return (
    <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[status] || "muted"} className={className}>
      {labelFor(PAYMENT_STATUS, status) || status}
    </Badge>
  );
}
