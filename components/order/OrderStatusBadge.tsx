import Badge from "@/components/ui/Badge";
import { ORDER_STATUS, ORDER_STATUS_BADGE_VARIANT, labelFor } from "@/lib/orders/order.constants";
import { OrderStatus } from "@/types/order";

interface Props {
  status: OrderStatus;
  className?: string;
}

export default function OrderStatusBadge({ status, className }: Props) {
  return (
    <Badge variant={ORDER_STATUS_BADGE_VARIANT[status] || "muted"} className={className}>
      {labelFor(ORDER_STATUS, status) || status}
    </Badge>
  );
}
