"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Wallet, Coins, Percent } from "lucide-react";
import Card from "@/components/ui/Card";
import { DateRange } from "@/lib/dateFilter";
import { getRevenueSummary } from "@/lib/reports/reportsBI.service";
import { currency } from "@/lib/reports/format";

// Feature 7 - Future Profit Section. UI only, per the spec: Revenue is the
// one real figure (reuses the same reports_revenue_summary every other
// section already calls - no new query, no new source of truth). Cost/
// Profit/Margin have no defined calculation yet and must show "Coming
// Soon", not a zero or a guess - a guessed number here would look like a
// real business figure.

interface Props {
  range: DateRange | null;
}

function ComingSoonTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <p className="text-lg font-semibold text-muted-foreground/50 mt-2">Coming Soon</p>
    </div>
  );
}

export default function ProfitSection({ range }: Props) {
  const [revenue, setRevenue] = useState<number | null>(null);

  useEffect(() => {
    getRevenueSummary(range).then((s) => setRevenue(s.revenue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end]);

  return (
    <Card>
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        Lợi nhuận
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="w-4 h-4" />
            <p className="text-xs">Doanh thu</p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-2">
            {revenue !== null ? currency.format(revenue) : "—"}
          </p>
        </div>
        <ComingSoonTile icon={<Coins className="w-4 h-4" />} label="Chi phí" />
        <ComingSoonTile icon={<Wallet className="w-4 h-4" />} label="Lợi nhuận" />
        <ComingSoonTile icon={<Percent className="w-4 h-4" />} label="Biên lợi nhuận" />
      </div>
    </Card>
  );
}
