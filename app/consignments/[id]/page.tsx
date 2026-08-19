"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PackageOpen, Users, Gem, CheckCircle2, Undo2 } from "lucide-react";
import { Consignment } from "@/types/consignment";
import { ConsignmentOverviewRow } from "@/types/consignmentOverview";
import { ActivityLog } from "@/types/activityLog";
import { getActivityLogsByEntity } from "@/lib/activityLog.service";
import { consignmentStatusLabel } from "@/lib/consignment/consignment.constants";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  RECEIVED: "muted",
  AVAILABLE_FOR_SALE: "warning",
  SOLD: "success",
  RETURNED: "destructive",
};

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value === null ? "—" : currency.format(value);
}

const TIMELINE_LABELS: Record<string, string> = {
  consignment_received: "Consignment được nhận",
  consignment_available: "Chuyển sang Sẵn sàng bán",
  consignment_sold: "Consignment đã bán",
  consignment_returned: "Consignment đã trả",
  consignment_financial_record_created: "Đã tạo Consignment Financial Record",
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function ConsignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [consignment, setConsignment] = useState<Consignment | null>(null);
  const [overview, setOverview] = useState<ConsignmentOverviewRow | null>(null);
  const [timeline, setTimeline] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadConsignment() {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/consignments/${id}`);
      if (!res.ok) throw new Error("Không tìm thấy consignment");
      setConsignment(await res.json());

      const overviewRes = await fetch(`/api/consignments?consignmentId=${id}`);
      if (overviewRes.ok) {
        const rows: ConsignmentOverviewRow[] = await overviewRes.json();
        setOverview(rows[0] ?? null);
      }

      setTimeline(await getActivityLogsByEntity("consignment", id));
    } catch (error) {
      console.error("Failed to load consignment:", error);
      setConsignment(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadConsignment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAction(action: "available" | "return") {
    setActionError(null);
    setIsActing(true);
    try {
      const res = await fetch(`/api/consignments/${id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể thực hiện thao tác");
      }
      await loadConsignment();
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

  if (!consignment) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy consignment</p>
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
            <PackageOpen className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{consignment.consignment_code}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{consignment.product?.product_name ?? "—"}</p>
          </div>
          <Badge variant={STATUS_BADGE_VARIANT[consignment.status] ?? "muted"}>{consignmentStatusLabel(consignment.status)}</Badge>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            {consignment.status === "RECEIVED" && (
              <Button data-testid="consignment-available-button" size="sm" onClick={() => handleAction("available")} isLoading={isActing}>
                <CheckCircle2 className="w-4 h-4" />
                Sẵn sàng bán
              </Button>
            )}
            {["RECEIVED", "AVAILABLE_FOR_SALE"].includes(consignment.status) && (
              <Button data-testid="consignment-return-button" variant="secondary" size="sm" onClick={() => handleAction("return")} isLoading={isActing}>
                <Undo2 className="w-4 h-4" />
                Trả hàng
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
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mã Consignment</dt>
                <dd className="font-medium">{consignment.consignment_code}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ngày nhận</dt>
                <dd className="font-medium">{consignment.created_at ? formatDate(consignment.created_at) : "—"}</dd>
              </div>
              {overview && (
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Thời gian giữ</dt>
                  <dd className="font-medium">{overview.holdingDays} ngày</dd>
                </div>
              )}
              {consignment.returned_at && (
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ngày trả</dt>
                  <dd className="font-medium">{formatDate(consignment.returned_at)}</dd>
                </div>
              )}
            </dl>
          </SectionCard>

          <SectionCard title="Khách hàng (Consignor)">
            {consignment.customer ? (
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Khách hàng</dt>
                  <dd className="font-medium">
                    <Link href={`/customers/${consignment.customer.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {consignment.customer.full_name}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mã khách hàng</dt>
                  <dd className="font-medium">{consignment.customer.customer_code}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Không có thông tin khách hàng</p>
            )}
          </SectionCard>

          <SectionCard title="Sản phẩm">
            {consignment.product ? (
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sản phẩm</dt>
                  <dd className="font-medium">
                    <Link href={`/products/${consignment.product.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                      <Gem className="w-3.5 h-3.5" />
                      {consignment.product.product_name}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mã sản phẩm</dt>
                  <dd className="font-medium">{consignment.product.product_code}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Trạng thái sản phẩm (không đổi bởi Consignment)</dt>
                  <dd className="font-medium">{consignment.product.status}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Không có thông tin sản phẩm</p>
            )}
          </SectionCard>

          {overview?.salePrice !== null && overview !== null && (
            <SectionCard title="Bán hàng / Tài chính">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Người mua</dt>
                  <dd className="font-medium">
                    {overview.buyerId ? (
                      <Link href={`/customers/${overview.buyerId}`} className="text-primary hover:underline">
                        {overview.buyerName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Đơn hàng</dt>
                  <dd className="font-medium">
                    {overview.orderId ? (
                      <Link href={`/orders/${overview.orderId}`} className="text-primary hover:underline">
                        {overview.orderNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ngày bán</dt>
                  <dd className="font-medium">{overview.saleDate ? formatDate(overview.saleDate) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Nhân viên bán</dt>
                  <dd className="font-medium">{overview.salesperson ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Giá bán</dt>
                  <dd className="font-medium">{money(overview.salePrice)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Phí</dt>
                  <dd className="font-medium">{money(overview.fee)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Khách hàng nhận (Payable)</dt>
                  <dd className="font-medium">{money(overview.customerPayable)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Đã trả</dt>
                  <dd className="font-medium text-success">{money(overview.customerPaid)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Còn lại</dt>
                  <dd className="font-medium text-destructive">{money(overview.customerOutstanding)}</dd>
                </div>
              </dl>
            </SectionCard>
          )}
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
