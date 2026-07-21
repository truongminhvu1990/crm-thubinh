"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Megaphone, Cake, CalendarDays, Clock3, AlarmClockOff, TimerOff } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { getDashboardCounts } from "@/lib/marketing/marketing.service";
import { MarketingDashboardCounts } from "@/types/marketing";

/** Marketing Dashboard (Spec Feature 11, MARKETING_UI.md §3). All 7 cards
 * come from one Postgres RPC round trip (marketing_dashboard_counts) rather
 * than 7 separate queries - a stricter reading of Feature 13 ("avoid
 * duplicated queries") than the UI doc's per-card independent-loading
 * design, disclosed as a judgment call since all 7 numbers share one
 * request anyway. Fixed all-time snapshot, no date filter/search (per UI
 * doc §3) - does not replace or alter the existing /dashboard (LOCKED). */
export default function MarketingDashboardPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<MarketingDashboardCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    const data = await getDashboardCounts();
    setCounts(data);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Marketing</h1>
        <p className="text-muted-foreground text-sm mt-1">Tổng quan phân khúc, chiến dịch và sinh nhật khách hàng</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="text-left" onClick={() => router.push("/marketing/segments")}>
            <StatCard
              title="Phân khúc"
              value={counts?.segmentCount ?? 0}
              placeholder={isLoading}
              icon={<Users className="w-5 h-5" />}
            />
          </button>
          <button className="text-left" onClick={() => router.push("/marketing/campaigns")}>
            <StatCard
              title="Chiến dịch"
              value={counts?.campaignCount ?? 0}
              placeholder={isLoading}
              icon={<Megaphone className="w-5 h-5" />}
            />
          </button>
          <button className="text-left" onClick={() => router.push("/marketing/birthdays")}>
            <StatCard
              title="Sinh nhật hôm nay"
              value={counts?.birthdayToday ?? 0}
              placeholder={isLoading}
              icon={<Cake className="w-5 h-5" />}
              color="bg-amber-100 text-amber-700"
            />
          </button>
          <button className="text-left" onClick={() => router.push("/marketing/birthdays")}>
            <StatCard
              title="Sinh nhật tháng này"
              value={counts?.birthdayThisMonth ?? 0}
              placeholder={isLoading}
              icon={<CalendarDays className="w-5 h-5" />}
              color="bg-amber-100 text-amber-700"
            />
          </button>
          <button className="text-left" onClick={() => router.push("/customers")}>
            <StatCard
              title="Không mua hàng 30 ngày"
              value={counts?.noPurchase30 ?? 0}
              placeholder={isLoading}
              icon={<Clock3 className="w-5 h-5" />}
              color="bg-secondary/10 text-secondary"
            />
          </button>
          <button className="text-left" onClick={() => router.push("/customers")}>
            <StatCard
              title="Không mua hàng 60 ngày"
              value={counts?.noPurchase60 ?? 0}
              placeholder={isLoading}
              icon={<AlarmClockOff className="w-5 h-5" />}
              color="bg-secondary/10 text-secondary"
            />
          </button>
          <button className="text-left" onClick={() => router.push("/customers")}>
            <StatCard
              title="Không mua hàng 90 ngày"
              value={counts?.noPurchase90 ?? 0}
              placeholder={isLoading}
              icon={<TimerOff className="w-5 h-5" />}
              color="bg-secondary/10 text-secondary"
            />
          </button>
      </div>
    </div>
  );
}
