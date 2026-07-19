"use client";

import { Check } from "lucide-react";
import { Order } from "@/types/order";
import { deriveOrderTimelineStages, isOrderTimelineInterrupted, OrderTimelineStage } from "@/lib/orders/order.rules";
import Card from "@/components/ui/Card";

const STAGE_LABELS: Record<OrderTimelineStage, string> = {
  Created: "Tạo đơn",
  Reserved: "Đã giữ hàng",
  Payment: "Thanh toán",
  Completed: "Hoàn thành",
};

const ALL_STAGES: OrderTimelineStage[] = ["Created", "Reserved", "Payment", "Completed"];

/** ORDERS_UI.md §9.1 — simplified progress bar. Product Owner-approved V1
 * scope: derived from current order_status/payment_status only (see
 * order.rules.ts's deriveOrderTimelineStages) — a Lost order is simply
 * shown interrupted, never reconstructed to a specific prior stage. */
export default function OrderTimeline({ order }: { order: Order }) {
  const litStages = deriveOrderTimelineStages(order.order_status, order.payment_status);
  const interrupted = isOrderTimelineInterrupted(order.order_status);

  return (
    <Card>
      <div className="flex items-center">
        {ALL_STAGES.map((stage, index) => {
          const isLit = litStages.includes(stage);
          const isLast = index === ALL_STAGES.length - 1;
          return (
            <div key={stage} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    isLit ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {isLit ? <Check className="w-4 h-4" /> : <span className="text-xs">{index + 1}</span>}
                </div>
                <span className={`text-xs whitespace-nowrap ${isLit ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              {!isLast && <div className={`flex-1 h-0.5 mx-2 mb-5 ${isLit ? "bg-primary" : "bg-border"}`} />}
            </div>
          );
        })}
      </div>
      {interrupted && (
        <p className="text-center text-sm text-destructive mt-3">
          Đơn hàng đã Lost{order.lost_reason ? ` — ${order.lost_reason}` : ""}
        </p>
      )}
    </Card>
  );
}
