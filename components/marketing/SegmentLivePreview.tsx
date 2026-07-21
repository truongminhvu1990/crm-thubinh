"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { previewDynamicSegment } from "@/lib/marketing/marketing.service";
import { SegmentPreviewResult, ConditionLogic } from "@/types/marketing";
import { DraftCondition } from "./SegmentConditionRow";

interface Props {
  conditions: DraftCondition[];
  logic: ConditionLogic;
}

const DEBOUNCE_MS = 500;

/** Feature 3 - Live Preview (MARKETING_UI.md §4.1). Re-runs on every
 * Condition Builder change (debounced), server-side (marketing_segment_
 * customer_count / _list RPC), plus a manual Refresh Preview button. */
export default function SegmentLivePreview({ conditions, logic }: Props) {
  const [result, setResult] = useState<SegmentPreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runPreview() {
    setIsLoading(true);
    const data = await previewDynamicSegment(conditions, logic);
    setResult(data);
    setIsLoading(false);
  }

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runPreview, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(conditions), logic]);

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Xem trước trực tiếp</h3>
        <Button variant="secondary" size="sm" onClick={runPreview} isLoading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5" />
          Làm mới
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Số khách hàng</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{isLoading ? "…" : result?.customerCount ?? 0}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Phạm vi tiếp cận ước tính</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{isLoading ? "…" : result?.estimatedReach ?? 0}</p>
        </div>
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-muted-foreground">Thêm điều kiện để thu hẹp phân khúc</p>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mẫu khách hàng</p>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin text-xl">⟳</div>
          </div>
        ) : result && result.sampleCustomers.length > 0 ? (
          <ul className="space-y-1.5">
            {result.sampleCustomers.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm text-foreground">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                {c.full_name} <span className="text-muted-foreground">· {c.customer_code}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Không có khách hàng phù hợp</p>
        )}
      </div>
    </Card>
  );
}
