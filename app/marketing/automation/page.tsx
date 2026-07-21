"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, Play, Pause, CalendarClock, AlertTriangle, Plus } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import Select from "@/components/ui/Select";
import AutomationTable from "@/components/marketing/AutomationTable";
import AutomationRunStatusBadge from "@/components/marketing/AutomationRunStatusBadge";
import VoucherStatusBadge from "@/components/marketing/VoucherStatusBadge";
import MarketingPagination from "@/components/marketing/MarketingPagination";
import { cn, formatRelativeTime } from "@/lib/utils";
import { getCurrentStaff } from "@/lib/permission";
import {
  getAutomationsPage,
  getAutomationDashboardCounts,
  getRecentExecutions,
  getLatestBroadcastSummary,
  changeAutomationStatus,
  bulkChangeAutomationStatus,
  AutomationTransitionError,
} from "@/lib/marketing/automation.service";
import { getLatestVoucher } from "@/lib/marketing/voucher.service";
import {
  AUTOMATION_STATUS_OPTIONS,
  AUTOMATION_TYPE_OPTIONS,
  FREQUENCY_OPTIONS,
  TRIGGER_TYPE_OPTIONS,
} from "@/lib/marketing/marketing.constants";
import {
  MarketingAutomation,
  MarketingAutomationRun,
  AutomationStatus,
  AutomationDashboardCounts,
} from "@/types/marketingAutomation";
import { MarketingVoucher } from "@/types/marketingAutomation";

type Row = MarketingAutomation & { lastRun?: MarketingAutomationRun | null };

const ALL = "All";

/** Automation's two-tab-one-route landing page (Dashboard + List), same
 * precedent as app/inventory/page.tsx's Inventory List/Batch View tabs
 * (MARKETING_AUTOMATION_UI.md §1.3). */
export default function AutomationPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"dashboard" | "list">("dashboard");

  // Dashboard state
  const [counts, setCounts] = useState<AutomationDashboardCounts | null>(null);
  const [recentRuns, setRecentRuns] = useState<MarketingAutomationRun[]>([]);
  const [latestBroadcast, setLatestBroadcast] = useState<{ run: MarketingAutomationRun; recipientCount: number } | null>(null);
  const [latestVoucher, setLatestVoucher] = useState<MarketingVoucher | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

  // List state
  const [rows, setRows] = useState<Row[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isListLoading, setIsListLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AutomationStatus | "All">(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [frequencyFilter, setFrequencyFilter] = useState(ALL);
  const [triggerFilter, setTriggerFilter] = useState(ALL);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setIsDashboardLoading(true);
    const [c, runs, broadcast, voucher] = await Promise.all([
      getAutomationDashboardCounts(),
      getRecentExecutions(10),
      getLatestBroadcastSummary(),
      getLatestVoucher(),
    ]);
    setCounts(c);
    setRecentRuns(runs);
    setLatestBroadcast(broadcast);
    setLatestVoucher(voucher);
    setIsDashboardLoading(false);
  }

  async function loadList() {
    setIsListLoading(true);
    const result = await getAutomationsPage({
      search: search || undefined,
      status: statusFilter,
      automationType: typeFilter === ALL ? "All" : (typeFilter as MarketingAutomation["automation_type"]),
      frequency: frequencyFilter === ALL ? "All" : (frequencyFilter as MarketingAutomation["frequency"]),
      triggerType: triggerFilter === ALL ? "All" : (triggerFilter as MarketingAutomation["trigger_type"]),
      page,
    });
    setRows(result.rows);
    setTotalCount(result.totalCount);
    setIsListLoading(false);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (tab === "list") loadList();
  }, [tab, search, statusFilter, typeFilter, frequencyFilter, triggerFilter, page]);

  async function handleStatusChange(automation: Row, next: AutomationStatus) {
    setError("");
    const staff = await getCurrentStaff();
    try {
      await changeAutomationStatus(automation.id!, automation.status, next, staff?.id ?? null);
      loadList();
      loadDashboard();
    } catch (e) {
      if (e instanceof AutomationTransitionError) setError(e.message);
    }
  }

  async function handleBulkStatusChange(selected: Row[], next: AutomationStatus) {
    const staff = await getCurrentStaff();
    const result = await bulkChangeAutomationStatus(selected, next, staff?.id ?? null);
    setError(`Đã cập nhật ${result.succeeded}/${result.total} automation.`);
    loadList();
    loadDashboard();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Automation</h1>
          <p className="text-muted-foreground text-sm mt-1">Tự động hóa chiến dịch, sinh nhật và chăm sóc khách hàng</p>
        </div>
        <Button onClick={() => router.push("/marketing/automation/new")}>
          <Plus className="w-4 h-4" />
          Automation mới
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab("dashboard")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "dashboard" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Dashboard
        </button>
        <button
          onClick={() => setTab("list")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "list" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Danh sách Automation
        </button>
      </div>

      {tab === "dashboard" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard title="Tổng automation" value={counts?.totalAutomations ?? 0} placeholder={isDashboardLoading} icon={<Zap className="w-5 h-5" />} />
            <StatCard title="Đang hoạt động" value={counts?.activeAutomations ?? 0} placeholder={isDashboardLoading} icon={<Play className="w-5 h-5" />} color="bg-emerald-100 text-emerald-700" />
            <StatCard title="Tạm dừng" value={counts?.pausedAutomations ?? 0} placeholder={isDashboardLoading} icon={<Pause className="w-5 h-5" />} color="bg-amber-100 text-amber-700" />
            <StatCard title="Lần chạy hôm nay" value={counts?.todaysRuns ?? 0} placeholder={isDashboardLoading} icon={<CalendarClock className="w-5 h-5" />} />
            <StatCard title="Thất bại hôm nay" value={counts?.failedRunsToday ?? 0} placeholder={isDashboardLoading} icon={<AlertTriangle className="w-5 h-5" />} color="bg-red-100 text-red-700" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <h3 className="font-semibold text-foreground mb-3">Hoạt động gần đây</h3>
              {recentRuns.length === 0 ? (
                <EmptyDashboardState />
              ) : (
                <div className="space-y-2">
                  {recentRuns.map((run) => (
                    <Link key={run.id} href={`/marketing/automation/${run.automation_id}`} className="flex items-center justify-between gap-2 text-sm hover:bg-muted/40 rounded-lg px-2 py-1.5 -mx-2">
                      <span className="text-foreground truncate">{run.automation?.name || "—"}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(run.started_at!)}</span>
                        <AutomationRunStatusBadge status={run.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-semibold text-foreground mb-3">Broadcast gần nhất</h3>
              {!latestBroadcast ? (
                <EmptyDashboardState />
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="text-foreground font-medium">{latestBroadcast.run.automation?.name || "—"}</p>
                  <div className="flex items-center gap-2">
                    <AutomationRunStatusBadge status={latestBroadcast.run.status} />
                    <span className="text-muted-foreground">{latestBroadcast.recipientCount} người nhận</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(latestBroadcast.run.started_at!)}</p>
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-semibold text-foreground mb-3">Voucher gần nhất</h3>
              {!latestVoucher ? (
                <EmptyDashboardState />
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="text-foreground font-medium">{latestVoucher.code} - {latestVoucher.name}</p>
                  <VoucherStatusBadge status={latestVoucher.status} />
                  <p className="text-xs text-muted-foreground">
                    {latestVoucher.start_date || "—"} - {latestVoucher.end_date || "—"}
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 min-w-0">
                <SearchInput placeholder="Tìm theo tên..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} onClear={() => setSearch("")} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Select
                  options={[{ value: ALL, label: "Tất cả trạng thái" }, ...AUTOMATION_STATUS_OPTIONS]}
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value as AutomationStatus | "All"); setPage(1); }}
                  className="w-40"
                />
                <Select
                  options={[{ value: ALL, label: "Tất cả mẫu" }, ...AUTOMATION_TYPE_OPTIONS]}
                  value={typeFilter}
                  onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                  className="w-44"
                />
                <Select
                  options={[{ value: ALL, label: "Tất cả tần suất" }, ...FREQUENCY_OPTIONS]}
                  value={frequencyFilter}
                  onChange={(e) => { setFrequencyFilter(e.target.value); setPage(1); }}
                  className="w-36"
                />
                <Select
                  options={[{ value: ALL, label: "Tất cả trigger" }, ...TRIGGER_TYPE_OPTIONS]}
                  value={triggerFilter}
                  onChange={(e) => { setTriggerFilter(e.target.value); setPage(1); }}
                  className="w-36"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <AutomationTable
            automations={rows}
            isLoading={isListLoading}
            onStatusChange={handleStatusChange}
            onBulkStatusChange={handleBulkStatusChange}
          />
          <MarketingPagination page={page} totalCount={totalCount} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

function EmptyDashboardState() {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-muted-foreground mb-3">Chưa có automation nào</p>
      <Link href="/marketing/automation/new" className="text-sm text-primary hover:underline">
        Tạo automation đầu tiên
      </Link>
    </div>
  );
}
