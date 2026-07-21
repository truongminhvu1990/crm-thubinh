"use client";

import { useEffect, useState } from "react";
import { Radio, Users, CheckCircle2, XCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import StatCard from "@/components/ui/StatCard";
import RunHistoryTable from "@/components/marketing/RunHistoryTable";
import MarketingPagination from "@/components/marketing/MarketingPagination";
import { getActiveSegmentsForPicker, previewDynamicSegment, getSegmentDetail } from "@/lib/marketing/marketing.service";
import { getBroadcastRunsPage, getBroadcastDeliverySummary } from "@/lib/marketing/automation.service";
import { MarketingAutomationRun } from "@/types/marketingAutomation";
import { Option } from "@/lib/customer.constants";

/** Broadcast (§3.6) - simulation only, no channel picker/message composer of
 * any kind. Creating a broadcast happens through Automation -> New ->
 * Template = "Manual Broadcast" (§3.6's note); this page is a rollup/
 * monitoring + audience-preview surface, not a duplicate creation flow. */
export default function BroadcastPage() {
  const [segmentOptions, setSegmentOptions] = useState<Option[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [estimatedReach, setEstimatedReach] = useState<number | null>(null);

  const [runs, setRuns] = useState<MarketingAutomationRun[]>([]);
  const [runsTotalCount, setRunsTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);

  const [summary, setSummary] = useState({ success: 0, failed: 0, pending: 0 });

  useEffect(() => {
    getActiveSegmentsForPicker().then((segments) => setSegmentOptions(segments.map((s) => ({ value: s.id, label: s.name }))));
    getBroadcastDeliverySummary().then(setSummary);
  }, []);

  useEffect(() => {
    if (!selectedSegmentId) {
      setEstimatedReach(null);
      return;
    }
    getSegmentDetail(selectedSegmentId).then((detail) => setEstimatedReach(detail?.estimatedReach ?? 0));
  }, [selectedSegmentId]);

  async function loadRuns() {
    setIsLoadingRuns(true);
    const result = await getBroadcastRunsPage(page);
    setRuns(result.rows);
    setRunsTotalCount(result.totalCount);
    setIsLoadingRuns(false);
  }

  useEffect(() => {
    loadRuns();
  }, [page]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Radio className="w-6 h-6" />
          Broadcast
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Gửi tin mô phỏng - không tích hợp Email/SMS/Zalo/Facebook/TikTok thực</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Thành công" value={summary.success} icon={<CheckCircle2 className="w-5 h-5" />} color="bg-emerald-100 text-emerald-700" />
        <StatCard title="Thất bại" value={summary.failed} icon={<XCircle className="w-5 h-5" />} color="bg-red-100 text-red-700" />
        <StatCard title="Đang chờ" value={summary.pending} icon={<Users className="w-5 h-5" />} />
      </div>

      <Card>
        <h3 className="font-semibold text-foreground mb-4">Xem trước đối tượng</h3>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <Select label="Phân khúc" options={segmentOptions} placeholder="Chọn phân khúc" value={selectedSegmentId} onChange={(e) => setSelectedSegmentId(e.target.value)} />
          </div>
          {estimatedReach !== null && (
            <div className="text-sm text-muted-foreground pb-2">
              Ước tính tiếp cận: <span className="text-foreground font-semibold">{estimatedReach}</span> khách hàng
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Đây chỉ là công cụ xem trước - để tạo broadcast thực, vào Automation → Tạo mới → chọn mẫu &quot;Gửi tin thủ công&quot;.
        </p>
      </Card>

      <div>
        <h3 className="font-semibold text-foreground mb-3">Lịch sử gửi tin</h3>
        <RunHistoryTable runs={runs} isLoading={isLoadingRuns} showAutomationColumn onRetried={loadRuns} />
        <MarketingPagination page={page} totalCount={runsTotalCount} onPageChange={setPage} />
      </div>
    </div>
  );
}
