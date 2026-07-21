"use client";

import { useEffect, useState } from "react";
import BirthdaySection from "@/components/marketing/BirthdaySection";
import { getBirthdayCenterData } from "@/lib/marketing/marketing.service";
import { BirthdayCenterData } from "@/types/marketing";

export default function BirthdayCenterPage() {
  const [data, setData] = useState<BirthdayCenterData>({ today: [], thisWeek: [], thisMonth: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [monthSearch, setMonthSearch] = useState("");

  async function load(search?: string) {
    setIsLoading(true);
    const result = await getBirthdayCenterData(search);
    setData(result);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(monthSearch || undefined), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthSearch]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Trung tâm Sinh nhật</h1>
        <p className="text-muted-foreground text-sm mt-1">Khách hàng theo sinh nhật gần nhất</p>
      </div>

      <BirthdaySection title="Hôm nay" customers={data.today} isLoading={isLoading} emptyMessage="Không có sinh nhật nào hôm nay" />
      <BirthdaySection title="Tuần này" customers={data.thisWeek} isLoading={isLoading} emptyMessage="Không có sinh nhật nào tuần này" />
      <BirthdaySection
        title="Tháng này"
        customers={data.thisMonth}
        isLoading={isLoading}
        emptyMessage="Không có sinh nhật nào tháng này"
        search={monthSearch}
        onSearchChange={setMonthSearch}
      />
    </div>
  );
}
