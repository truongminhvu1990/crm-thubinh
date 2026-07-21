"use client";

import { ReactNode } from "react";
import Card from "@/components/ui/Card";

interface ChannelCard {
  icon: ReactNode;
  label: string;
}

interface Props {
  icon: ReactNode;
  title: string;
  cards?: ChannelCard[];
}

/** Shared by Broadcast/Loyalty/Voucher (Spec Features 7-9, MARKETING_UI.md
 * §8-11) - same "Sắp ra mắt" visual language as Sidebar.tsx's disabled-entry
 * badge, promoted to a full-page treatment. No control does anything on
 * these pages (Design Principle 4) - not present-but-disabled, entirely
 * absent. */
export default function ComingSoonPanel({ icon, title, cards }: Props) {
  return (
    <div className="max-w-3xl mx-auto text-center py-12">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 text-muted-foreground">
        {icon}
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground mb-8">Tính năng đang được phát triển - Sắp ra mắt</p>

      {cards && cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Card key={card.label} className="flex flex-col items-center gap-2 py-6">
              <div className="text-muted-foreground">{card.icon}</div>
              <p className="text-sm font-medium text-foreground">{card.label}</p>
              <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                Sắp ra mắt
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
