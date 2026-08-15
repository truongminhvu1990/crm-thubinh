"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Handshake, Coins, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Compensation } from "@/types/compensation";
import { ActivityLog } from "@/types/activityLog";
import { getActivityLogsByEntity } from "@/lib/activityLog.service";
import { compensationStatusLabel, compensationTypeLabel } from "@/lib/compensation/compensation.constants";
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
  Confirmed: "success",
  Cancelled: "destructive",
  "Handed Off": "muted",
};

const PARTNER_STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Onboarding: "warning",
  Active: "success",
  Inactive: "muted",
  Terminated: "destructive",
};

/** Full Timeline vocabulary (Product Owner Revision 2026-07-31, Decision 3
 * — full 5-status model). "compensation_eligible" is an extra entry beyond
 * the task's own named 4, added so Decision 2's "Eligibility separated"
 * requirement is visibly verifiable (Draft→Pending happens at a distinct
 * moment from creation, at Order Completed, not at Order Confirmed).
 * "Handed Off To Settlement" is named for forward compatibility but
 * unreachable today — Settlement has no implementation anywhere and this
 * task explicitly forbids touching it. */
const TIMELINE_LABELS: Record<string, string> = {
  compensation_created: "Compensation được tạo (Draft)",
  compensation_eligible: "Đủ điều kiện xác nhận (Pending)",
  compensation_confirmed: "Compensation được xác nhận",
  compensation_cancelled: "Compensation đã hủy",
  compensation_handed_off: "Đã chuyển giao cho Settlement",
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function CompensationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [compensation, setCompensation] = useState<Compensation | null>(null);
  const [timeline, setTimeline] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function loadCompensation() {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/compensations/${id}`);
      if (!res.ok) throw new Error("Không tìm thấy compensation");
      setCompensation(await res.json());
      setTimeline(await getActivityLogsByEntity("compensation", id));
    } catch (error) {
      console.error("Failed to load compensation:", error);
      setCompensation(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadCompensation();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleConfirm() {
    setConfirmError(null);
    setIsConfirming(true);
    try {
      const res = await fetch(`/api/compensations/${id}/confirm`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể xác nhận compensation");
      }
      await loadCompensation();
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "Đã có lỗi xảy ra");
    } finally {
      setIsConfirming(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!compensation) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy compensation</p>
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
            <Coins className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{compensation.compensation_code}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{compensationTypeLabel(compensation.compensation_type)}</p>
          </div>
          <Badge variant={STATUS_BADGE_VARIANT[compensation.status] ?? "muted"}>{compensationStatusLabel(compensation.status)}</Badge>
        </div>

        {compensation.status === "Pending" && (
          <div className="flex flex-col items-end gap-1">
            <Button data-testid="compensation-confirm-button" onClick={handleConfirm} isLoading={isConfirming}>
              <CheckCircle2 className="w-4 h-4" />
              Xác nhận
            </Button>
            {confirmError && <p className="text-destructive text-xs max-w-xs text-right">{confirmError}</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Thông tin chung">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mã Compensation</dt>
                <dd className="font-medium">{compensation.compensation_code}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Loại</dt>
                <dd className="font-medium">{compensationTypeLabel(compensation.compensation_type)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ngày tạo</dt>
                <dd className="font-medium">{compensation.created_at ? formatDate(compensation.created_at) : "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Người nhận">
            {compensation.partner ? (
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Đối tác</dt>
                  <dd className="font-medium">
                    <Link href={`/partners/${compensation.partner.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                      <Handshake className="w-3.5 h-3.5" />
                      {compensation.partner.name}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Loại đối tác</dt>
                  <dd className="font-medium">{compensation.partner.partner_type}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Trạng thái đối tác</dt>
                  <dd>
                    <Badge variant={PARTNER_STATUS_BADGE_VARIANT[compensation.partner.status] ?? "muted"}>
                      {compensation.partner.status}
                    </Badge>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Không có thông tin người nhận</p>
            )}
          </SectionCard>

          <SectionCard title="Thông tin đơn hàng">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Đơn hàng</dt>
                <dd className="font-medium">
                  {compensation.order ? (
                    <Link href={`/orders/${compensation.order.id}`} className="text-primary hover:underline">
                      {compensation.order.order_number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Khách hàng</dt>
                <dd className="font-medium">
                  {compensation.customer ? (
                    <Link href={`/customers/${compensation.customer.id}`} className="text-primary hover:underline">
                      {compensation.customer.full_name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sản phẩm</dt>
                <dd className="font-medium">
                  {compensation.product ? (
                    <Link href={`/products/${compensation.product.id}`} className="text-primary hover:underline">
                      {compensation.product.product_name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Tính toán">
            {/* Read-only per the task's own rule — no manual editing anywhere
                on this section. */}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Cơ sở tính</dt>
                <dd className="font-medium">{compensation.basis}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Phương thức</dt>
                <dd className="font-medium">{compensation.method}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Giá trị</dt>
                <dd className="font-medium">{compensation.method === "Percentage" ? `${compensation.value}%` : currency.format(compensation.value)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Số tiền tính toán</dt>
                <dd className="font-semibold text-primary">{currency.format(compensation.calculated_amount)}</dd>
              </div>
            </dl>
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
