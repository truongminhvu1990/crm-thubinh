"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { MarketingAutomationLog } from "@/types/marketingAutomation";
import { getLogsByRun, retryFailedRecipients } from "@/lib/marketing/automation.service";
import { getCurrentStaff } from "@/lib/permission";
import { BadgeVariant } from "@/lib/customer.constants";

interface Props {
  runId: string;
  onClose: () => void;
  onRetried: () => void;
}

const RESULT_BADGE_VARIANT: Record<string, BadgeVariant> = {
  Pending: "muted",
  Success: "success",
  Failed: "destructive",
};

/** Execution Log drill-down (§3.5) - per-recipient detail within one Run,
 * opened as a Modal rather than a route (same "detail-in-a-dialog" pattern
 * as CampaignFormModal). This is where Broadcast's "Delivery Status" is
 * actually seen for a Manual Broadcast run. */
export default function ExecutionLogModal({ runId, onClose, onRetried }: Props) {
  const [logs, setLogs] = useState<MarketingAutomationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    getLogsByRun(runId, 1).then((page) => {
      setLogs(page.rows);
      setIsLoading(false);
    });
  }, [runId]);

  const hasFailed = logs.some((l) => l.result === "Failed");

  async function handleRetry() {
    setIsRetrying(true);
    const staff = await getCurrentStaff();
    await retryFailedRecipients(runId, staff?.id ?? null);
    setIsRetrying(false);
    onRetried();
  }

  return (
    <Modal open title="Chi tiết thực thi" onClose={onClose}>
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-6">Đang tải...</div>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">Không có khách hàng nào trong lần chạy này.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{log.customer?.full_name || "—"}</p>
                  {log.message && <p className="text-xs text-muted-foreground truncate">{log.message}</p>}
                </div>
                <Badge variant={RESULT_BADGE_VARIANT[log.result]}>{log.result}</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
          {hasFailed && (
            <Button onClick={handleRetry} isLoading={isRetrying}>Thử lại thất bại</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
