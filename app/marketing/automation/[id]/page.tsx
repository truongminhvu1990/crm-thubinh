"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Play, Pause, XCircle, Clock3 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import AutomationStatusBadge from "@/components/marketing/AutomationStatusBadge";
import AutomationTypeBadge from "@/components/marketing/AutomationTypeBadge";
import RunHistoryTable from "@/components/marketing/RunHistoryTable";
import MarketingPagination from "@/components/marketing/MarketingPagination";
import { formatDate } from "@/lib/utils";
import { getCurrentStaff } from "@/lib/permission";
import { getActivityLogsByEntity } from "@/lib/activityLog.service";
import { ActivityLog } from "@/types/activityLog";
import {
  getAutomationDetail,
  getRunsPage,
  changeAutomationStatus,
  getValidNextStatuses,
  executeAutomationRun,
  getLinkableCampaigns,
  linkCampaignToAutomation,
  AutomationTransitionError,
  AutomationNotActiveError,
  AutomationDetail,
} from "@/lib/marketing/automation.service";
import { AutomationStatus, MarketingAutomationRun } from "@/types/marketingAutomation";

export default function AutomationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [detail, setDetail] = useState<AutomationDetail | null>(null);
  const [runs, setRuns] = useState<MarketingAutomationRun[]>([]);
  const [runsTotalCount, setRunsTotalCount] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkableCampaigns, setLinkableCampaigns] = useState<{ id?: string; name: string; status: string }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");

  async function load() {
    setIsLoading(true);
    const [d, activityLogs] = await Promise.all([
      getAutomationDetail(id),
      getActivityLogsByEntity("marketing_automation", id),
    ]);
    setDetail(d);
    setActivity(activityLogs);
    setIsLoading(false);
  }

  async function loadRuns() {
    const page = await getRunsPage({ automationId: id, page: runsPage });
    setRuns(page.rows);
    setRunsTotalCount(page.totalCount);
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    loadRuns();
  }, [id, runsPage]);

  async function handleStatusChange(next: AutomationStatus) {
    if (!detail) return;
    setError("");
    const staff = await getCurrentStaff();
    try {
      await changeAutomationStatus(id, detail.automation.status, next, staff?.id ?? null);
      load();
    } catch (e) {
      if (e instanceof AutomationTransitionError) setError(e.message);
    }
  }

  async function handleRunNow() {
    setError("");
    setIsRunning(true);
    const staff = await getCurrentStaff();
    try {
      await executeAutomationRun(id, staff?.id ?? null);
    } catch (e) {
      if (e instanceof AutomationNotActiveError) setError(e.message);
    }
    setIsRunning(false);
    load();
    loadRuns();
  }

  async function openLinkModal() {
    setLinkModalOpen(true);
    setLinkableCampaigns(await getLinkableCampaigns());
  }

  async function handleLinkCampaign() {
    if (!selectedCampaignId) return;
    const staff = await getCurrentStaff();
    await linkCampaignToAutomation(selectedCampaignId, id, staff?.id ?? null);
    setLinkModalOpen(false);
    setSelectedCampaignId("");
    load();
  }

  if (isLoading || !detail) {
    return <div className="p-6 text-center text-muted-foreground">Đang tải...</div>;
  }

  const { automation, campaigns, stats } = detail;
  const nextOptions = getValidNextStatuses(automation.status);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h1 className="text-xl font-semibold text-foreground">{automation.name}</h1>
              <AutomationStatusBadge status={automation.status} />
              <AutomationTypeBadge type={automation.automation_type} />
            </div>
            <p className="text-sm text-muted-foreground">v{automation.version} · Tạo bởi {automation.created_by_staff?.full_name || "—"}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {automation.status !== "Completed" && automation.status !== "Cancelled" && (
              <Button variant="secondary" onClick={() => router.push(`/marketing/automation/${id}/edit`)}>Sửa</Button>
            )}
            {automation.status === "Active" && (
              <Button onClick={handleRunNow} isLoading={isRunning}>
                <Play className="w-4 h-4" />
                Chạy ngay
              </Button>
            )}
            {nextOptions.includes("Active") && <Button variant="success" onClick={() => handleStatusChange("Active")}><Play className="w-4 h-4" />Kích hoạt</Button>}
            {nextOptions.includes("Paused") && <Button variant="secondary" onClick={() => handleStatusChange("Paused")}><Pause className="w-4 h-4" />Tạm dừng</Button>}
            {nextOptions.includes("Cancelled") && <Button variant="danger" onClick={() => handleStatusChange("Cancelled")}><XCircle className="w-4 h-4" />Hủy</Button>}
          </div>
        </div>
        {error && <p className="text-destructive text-sm mt-3">{error}</p>}
      </Card>

      <Card>
        <h3 className="font-semibold text-foreground mb-4">Thông tin chung</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Info label="Mô tả" value={automation.description || "—"} />
          <Info label="Phân khúc mục tiêu" value={automation.target_segment ? (
            <Link href={`/marketing/segments/${automation.target_segment.id}`} className="text-primary hover:underline">{automation.target_segment.name}</Link>
          ) : "—"} />
          <Info label="Trigger" value={automation.trigger_type} />
          {automation.trigger_type === "Daily Schedule" && <Info label="Tần suất" value={automation.frequency} />}
          <Info label="Tạo lúc" value={automation.created_at ? formatDate(automation.created_at) : "—"} />
          <Info label="Cập nhật lúc" value={automation.updated_at ? formatDate(automation.updated_at) : "—"} />
        </dl>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Chiến dịch liên kết</h3>
          <Button size="sm" variant="secondary" onClick={openLinkModal}>Liên kết chiến dịch</Button>
        </div>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa liên kết chiến dịch nào</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {campaigns.map((c) => (
              <Link key={c.id} href={`/marketing/campaigns/${c.id}`} className="text-xs px-2.5 py-1 rounded-full bg-muted text-foreground hover:bg-muted/70">
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold text-foreground mb-4">Thống kê thực thi</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Info label="Tổng lần chạy" value={String(stats.totalRuns)} />
          <Info label="Tỷ lệ thành công" value={`${stats.successRate}%`} />
          <Info label="Thành công gần nhất" value={stats.lastSuccessAt ? formatDate(stats.lastSuccessAt) : "—"} />
          <Info label="Thất bại gần nhất" value={stats.lastFailureAt ? formatDate(stats.lastFailureAt) : "—"} />
        </div>
      </Card>

      <div>
        <h3 className="font-semibold text-foreground mb-3">Lịch sử chạy</h3>
        <RunHistoryTable runs={runs} onRetried={() => { load(); loadRuns(); }} />
        <MarketingPagination page={runsPage} totalCount={runsTotalCount} onPageChange={setRunsPage} />
      </div>

      <Card>
        <h3 className="font-semibold text-foreground mb-4">Nhật ký hoạt động</h3>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có hoạt động nào</p>
        ) : (
          <div className="space-y-3">
            {activity.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <Clock3 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-foreground">{log.action}</p>
                  <p className="text-xs text-muted-foreground">{log.staff?.full_name || "Hệ thống"} · {formatDate(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {linkModalOpen && (
        <Modal open title="Liên kết chiến dịch" onClose={() => setLinkModalOpen(false)}>
          <div className="space-y-4">
            <Select
              label="Chiến dịch"
              options={linkableCampaigns.filter((c): c is { id: string; name: string; status: string } => !!c.id).map((c) => ({ value: c.id, label: `${c.name} (${c.status})` }))}
              placeholder="Chọn chiến dịch"
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setLinkModalOpen(false)}>Hủy</Button>
              <Button onClick={handleLinkCampaign}>Liên kết</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-foreground mt-0.5">{value}</dd>
    </div>
  );
}
