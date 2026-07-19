"use client";

import { History } from "lucide-react";
import { OrderEvent } from "@/types/order";
import { formatDate } from "@/lib/utils";

/** ORDERS_UI.md §9.2 — detailed, append-only, newest-first activity log. */
export default function OrderEventTimeline({ events }: { events: OrderEvent[] }) {
  if (events.length === 0) {
    // Not expected in practice (Order Created is always the first event),
    // but shown defensively rather than assuming a non-empty array.
    return (
      <div className="text-center py-6">
        <History className="w-5 h-5 mx-auto mb-2 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">Chưa có hoạt động nào</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3 text-sm">
          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-foreground">{event.event_detail}</p>
            <p className="text-xs text-muted-foreground">
              {event.actor} · {formatDate(event.event_timestamp)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
