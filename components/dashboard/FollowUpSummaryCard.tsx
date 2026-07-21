"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarCheck, ArrowRight } from "lucide-react";
import { FollowUpSummaryCounts } from "@/lib/customer.service";
import Card from "@/components/ui/Card";

interface Props {
  counts: FollowUpSummaryCounts;
}

export default function FollowUpSummaryCard({ counts }: Props) {
  return (
    <Link href="/follow-up" className="block">
      <Card className="hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Follow-up Summary</h2>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center mx-auto mb-1.5">
              <AlertTriangle className="w-4.5 h-4.5 text-red-600" />
            </div>
            <p className="text-xl font-bold text-foreground">{counts.overdue}</p>
            <p className="text-xs text-muted-foreground">Quá hạn</p>
          </div>
          <div className="text-center">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center mx-auto mb-1.5">
              <CalendarClock className="w-4.5 h-4.5 text-amber-600" />
            </div>
            <p className="text-xl font-bold text-foreground">{counts.today}</p>
            <p className="text-xs text-muted-foreground">Hôm nay</p>
          </div>
          <div className="text-center">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-1.5">
              <CalendarCheck className="w-4.5 h-4.5 text-primary" />
            </div>
            <p className="text-xl font-bold text-foreground">{counts.next7Days}</p>
            <p className="text-xs text-muted-foreground">7 ngày tới</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
