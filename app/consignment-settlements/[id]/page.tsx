"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PackageSearch, Users, Send, CheckCircle2, Ban } from "lucide-react";
import { ConsignmentSettlement } from "@/types/consignmentSettlement";
import { ActivityLog } from "@/types/activityLog";
import { getActivityLogsByEntity } from "@/lib/activityLog.service";
import { consignmentSettlementStatusLabel } from "@/lib/consignment/consignmentSettlement.constants";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Draft: "muted",
  Pending: "warning",
  Approved: "warning",
  Completed: "success",
  Cancelled: "destructive",
};

const TIMELINE_LABELS: Record<string, string> = {
  consignment_settlement_created: "Consignment Settlement được tạo",
  consignment_settlement_approved: "Consignment Settlement được duyệt",
  consignment_settlement_completed: "Consignment Settlement hoàn tất",
  consignment_settlement_cancelled: "Consignment Settlement đã hủy",
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function ConsignmentSettlementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [settlement, setSettlement] = useState<ConsignmentSettlement | null>(null);
  const [timeline, setTimeline] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadSettlement() {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/consignment-settlements/${id}`);
      if (!res.ok) throw new Error("Không tìm thấy consignment settlement");
      setSettlement(await res.json());
      setTimeline(await getActivityLogsByEntity("consignment_settlement", id));
    } catch (error) {
      console.error("Failed to load consignment settlement:", error);
      setSettlement(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSettlement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAction(action: "submit" | "approve" | "complete" | "cancel") {
    setActionError(null);
    setIsActing(true);
    try {
      const res = await fetch(`/api/consignment-settlements/${id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể thực hiện thao tác");
      }
      await loadSettlement();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Đã có lỗi xảy ra");
    } finally {
      setIsActing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!settlement) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy consignment settlement</p>
        <Button onClick={() => router.back()} className="mt-4">
          Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary mb-6 transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-primary/5"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại
      </button>

      <div className="bg-card border border-border rounded-xl shadow-sm p-6 mb-6 flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <PackageSearch className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{settlement.settlement_code}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{settlement.settlement_method}</p>
          </div>
          <Badge variant={STATUS_BADGE_VARIANT[settlement.status] ?? "muted"}>
            {consignmentSettlementStatusLabel(settlement.status)}
          </Badge>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            {settlement.status === "Draft" && (
              <Button data-testid="consignment-settlement-submit-button" size="sm" onClick={() => handleAction("submit")} isLoading={isActing}>
                <Send className="w-4 h-4" />
                Gửi duyệt
              </Button>
            )}
            {settlement.status === "Pending" && (
              <Button data-testid="consignment-settlement-approve-button" size="sm" onClick={() => handleAction("approve")} isLoading={isActing}>
                <CheckCircle2 className="w-4 h-4" />
                Duyệt
              </Button>
            )}
            {settlement.status === "Approved" && (
              <Button
                data-testid="consignment-settlement-complete-button"
                variant="success"
                size="sm"
                onClick={() => handleAction("complete")}
                isLoading={isActing}
              >
                <CheckCircle2 className="w-4 h-4" />
                Hoàn tất
              </Button>
            )}
            {["Draft", "Pending", "Approved"].includes(settlement.status) && (
              <Button data-testid="consignment-settlement-cancel-button" variant="secondary" size="sm" onClick={() => handleAction("cancel")} isLoading={isActing}>
                <Ban className="w-4 h-4" />
                Hủy
              </Button>
            )}
          </div>
          {actionError && <p className="text-destructive text-xs max-w-xs text-right">{actionError}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Thông tin chung">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mã Settlement</dt>
                <dd className="font-medium">{settlement.settlement_code}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Phương thức</dt>
                <dd className="font-medium">{settlement.settlement_method}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ngày tạo</dt>
                <dd className="font-medium">{settlement.created_at ? formatDate(settlement.created_at) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Số Financial Record</dt>
                <dd className="font-medium">{settlement.items.length}</dd>
              </div>
              <div className="sm:col-span-2">
                {/* Always SUM(items), computed by the service layer, never a
                    stored/editable field — Customer Paid (§5, Final Design
                    Specification) once this Settlement reaches Completed. */}
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tổng số tiền (tự động tính)</dt>
                <dd className="font-semibold text-primary">{currency.format(settlement.total_amount)}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Khách hàng (Consignor)">
            {settlement.customer ? (
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Khách hàng</dt>
                  <dd className="font-medium">
                    <Link href={`/customers/${settlement.customer.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {settlement.customer.full_name}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mã khách hàng</dt>
                  <dd className="font-medium">{settlement.customer.customer_code}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Không có thông tin khách hàng</p>
            )}
          </SectionCard>

          <SectionCard title="Consignment Financial Record bao gồm">
            {settlement.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có financial record</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <th className="text-left py-2 pr-4">Mã Consignment</th>
                      <th className="text-left py-2 pr-4">Đơn hàng</th>
                      <th className="text-right py-2">Customer Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlement.items.map((item) => {
                      const r = item.consignment_financial_record;
                      if (!r) return null;
                      return (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-4">
                            {r.consignment ? (
                              <span className="text-foreground">{r.consignment.consignment_code}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {r.order ? (
                              <Link href={`/orders/${r.order.id}`} className="text-primary hover:underline">
                                {r.order.order_number}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2 text-right font-medium">{currency.format(r.customer_payable)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td colSpan={2} className="py-2 pr-4 text-right">
                        Tổng cộng
                      </td>
                      <td className="py-2 text-right text-primary">{currency.format(settlement.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Dòng thời gian">
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có lịch sử</p>
            ) : (
              <ul className="space-y-4">
                {timeline.map((entry) => (
                  <li key={entry.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">{TIMELINE_LABELS[entry.action] ?? entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.created_at)}
                        {entry.staff?.full_name ? ` · ${entry.staff.full_name}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
