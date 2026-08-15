"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Phone, Mail, MapPin, Handshake, ShoppingBag } from "lucide-react";
import { Partner } from "@/types/partner";
import { PartnerOrderRow, PartnerOrderStats } from "@/lib/partner/partner.service";
import { ActivityLog } from "@/types/activityLog";
import { getActivityLogsByEntity } from "@/lib/activityLog.service";
import { partnerStatusLabel, partnerTypeLabel } from "@/lib/partner/partner.constants";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Link from "next/link";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const ORDER_STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Draft: "muted",
  Reserved: "warning",
  Completed: "success",
  Lost: "destructive",
};

const EMPTY_STATS: PartnerOrderStats = { totalOrders: 0, successfulOrders: 0, revenueGenerated: 0 };

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Onboarding: "warning",
  Active: "success",
  Inactive: "muted",
  Terminated: "destructive",
};

const TIMELINE_LABELS: Record<string, string> = {
  partner_created: "Đối tác được tạo",
  partner_updated: "Đối tác được cập nhật",
  partner_activated: "Đối tác được kích hoạt",
  partner_deactivated: "Đối tác ngưng hoạt động",
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [partner, setPartner] = useState<Partner | null>(null);
  const [timeline, setTimeline] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<PartnerOrderStats>(EMPTY_STATS);
  const [orders, setOrders] = useState<PartnerOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadPartner() {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/partners/${id}`);
      if (!res.ok) throw new Error("Không tìm thấy đối tác");
      setPartner(await res.json());

      const [timelineData, statsRes, ordersRes] = await Promise.all([
        getActivityLogsByEntity("partner", id),
        fetch(`/api/partners/${id}/stats`),
        fetch(`/api/partners/${id}/orders`),
      ]);
      setTimeline(timelineData);
      setStats(statsRes.ok ? await statsRes.json() : EMPTY_STATS);
      setOrders(ordersRes.ok ? await ordersRes.json() : []);
    } catch (error) {
      console.error("Failed to load partner:", error);
      setPartner(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPartner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy đối tác</p>
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
            <Handshake className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{partner.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {partner.partner_code} · {partnerTypeLabel(partner.partner_type)}
            </p>
          </div>
          <Badge variant={STATUS_BADGE_VARIANT[partner.status] ?? "muted"}>{partnerStatusLabel(partner.status)}</Badge>
        </div>
        <Button data-testid="partner-edit-button" variant="secondary" onClick={() => router.push(`/partners/${id}/edit`)}>
          <Edit2 className="w-4 h-4" />
          Chỉnh sửa
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Thông tin chung">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{partner.phone || "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{partner.email || "—"}</span>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{partner.address || "—"}</span>
              </div>
              {partner.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ghi chú</dt>
                  <dd className="text-foreground whitespace-pre-wrap">{partner.notes}</dd>
                </div>
              )}
            </dl>
          </SectionCard>

          <SectionCard title="Mối quan hệ">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Loại đối tác</dt>
                <dd className="font-medium">{partnerTypeLabel(partner.partner_type)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Trạng thái hiện tại</dt>
                <dd>
                  <Badge variant={STATUS_BADGE_VARIANT[partner.status] ?? "muted"}>{partnerStatusLabel(partner.status)}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ngày tạo</dt>
                <dd className="font-medium">{partner.created_at ? formatDate(partner.created_at) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Hoạt động gần nhất</dt>
                <dd className="font-medium">{partner.updated_at ? formatDate(partner.updated_at) : "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Thống kê đối tác">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tổng đơn hàng</dt>
                <dd className="font-medium">{stats.totalOrders}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Đơn hàng thành công</dt>
                <dd className="font-medium">{stats.successfulOrders}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Doanh thu tạo ra</dt>
                <dd className="font-medium">{currency.format(stats.revenueGenerated)}</dd>
              </div>
              {/* Compensation-derived figures: fixed 0 until the Compensation
                  Module exists anywhere in the codebase (Product Owner
                  Revision 2026-07-31, Decision 2) — not a query result. */}
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tổng hoa hồng</dt>
                <dd className="font-medium">{currency.format(0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Hoa hồng đã trả</dt>
                <dd className="font-medium">{currency.format(0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Hoa hồng chưa thanh toán</dt>
                <dd className="font-medium">{currency.format(0)}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Đơn hàng">
            {orders.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">Chưa có đơn hàng nào được giới thiệu bởi đối tác này</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <th className="text-left py-2 pr-4">Mã đơn hàng</th>
                      <th className="text-left py-2 pr-4">Ngày đặt</th>
                      <th className="text-left py-2 pr-4">Trạng thái</th>
                      <th className="text-right py-2">Tổng tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={`/orders/${order.id}`} className="text-primary hover:underline">
                            {order.order_number}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{formatDate(order.order_date)}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={ORDER_STATUS_BADGE_VARIANT[order.order_status] ?? "muted"}>{order.order_status}</Badge>
                        </td>
                        <td className="py-2 text-right font-medium">{currency.format(order.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Tổng hợp hoa hồng">
            {/* Section kept per Product Owner Revision 2026-07-31, Decision 2
                — displays 0 until the Compensation Module exists anywhere in
                the codebase (docs/13_COMPENSATION_SPEC.md,
                docs/14_SETTLEMENT_SPEC.md are both still zero-code specs). */}
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tổng hoa hồng</dt>
                <dd className="font-medium">{currency.format(0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Đã thanh toán</dt>
                <dd className="font-medium">{currency.format(0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Chưa thanh toán</dt>
                <dd className="font-medium">{currency.format(0)}</dd>
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
