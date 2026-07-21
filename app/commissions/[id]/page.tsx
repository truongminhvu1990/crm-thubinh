"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock3, UserPlus, BadgeCheck, CheckCircle2 } from "lucide-react";
import { SalesCommission } from "@/types/commission";
import { getCommissionDetail } from "@/lib/commission/commission.service";
import { COMMISSION_STATUS_LABEL, COMMISSION_STATUS_BADGE_VARIANT } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import InfoItem from "@/components/ui/InfoItem";
import CommissionStatusActions from "@/components/commission/CommissionStatusActions";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface HistoryItem {
  label: string;
  date: string | null;
  icon: React.ReactNode;
}

export default function CommissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [commission, setCommission] = useState<SalesCommission | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    if (!id) return;
    setIsLoading(true);
    const data = await getCommissionDetail(id);
    setCommission(data);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!commission) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy bản ghi hoa hồng</p>
        <Button onClick={() => router.back()} className="mt-4">
          Quay lại
        </Button>
      </div>
    );
  }

  // History (Feature 4) - reconstructed from the fields that actually exist
  // on the snapshot (created_at / status / paid_at / paid_by / note). There
  // is no separate approved_at column - the locked field list for
  // sales_commissions doesn't define one, so the "Approved" step in this
  // trail carries no timestamp of its own.
  const history: HistoryItem[] = [
    { label: "Tạo bản ghi hoa hồng (Chờ duyệt)", date: commission.created_at, icon: <UserPlus className="w-3.5 h-3.5" /> },
  ];
  if (commission.status === "Approved" || commission.status === "Paid") {
    history.push({ label: "Đã duyệt", date: null, icon: <BadgeCheck className="w-3.5 h-3.5" /> });
  }
  if (commission.status === "Paid") {
    history.push({
      label: `Đã thanh toán${commission.paid_by ? ` bởi ${commission.paid_by}` : ""}`,
      date: commission.paid_at,
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    });
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

      <div className="space-y-6">
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  {commission.customer?.full_name || "Khách hàng"}
                </h1>
                <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[commission.status]}>
                  {COMMISSION_STATUS_LABEL[commission.status]}
                </Badge>
              </div>
              {commission.customer?.customer_code && (
                <p className="text-muted-foreground text-sm mt-1.5">Mã khách hàng: {commission.customer.customer_code}</p>
              )}
            </div>
          </div>

          <div className="mt-7 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6">
            <InfoItem icon={<Clock3 className="w-4 h-4" />} label="Giá trị bán">
              {currency.format(commission.sale_amount)}
            </InfoItem>
            <InfoItem icon={<Clock3 className="w-4 h-4" />} label="Tỷ lệ hoa hồng">
              {commission.commission_percent}%
            </InfoItem>
            <InfoItem icon={<Clock3 className="w-4 h-4" />} label="Hoa hồng">
              {currency.format(commission.commission_amount)}
            </InfoItem>
            <InfoItem icon={<Clock3 className="w-4 h-4" />} label="Nhân viên">
              {commission.salesperson || "—"}
            </InfoItem>
            <InfoItem icon={<Clock3 className="w-4 h-4" />} label="Ngày tạo">
              {formatDate(commission.created_at)}
            </InfoItem>
            <InfoItem icon={<Clock3 className="w-4 h-4" />} label="Ngày thanh toán">
              {commission.paid_at ? formatDate(commission.paid_at) : "—"}
            </InfoItem>
            {commission.note && (
              <InfoItem icon={<Clock3 className="w-4 h-4" />} label="Ghi chú">
                {commission.note}
              </InfoItem>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">Thao tác</h2>
          <CommissionStatusActions commission={commission} onUpdate={setCommission} />
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock3 className="w-5 h-5 text-primary" />
            Lịch sử
          </h2>
          <ul className="space-y-4">
            {history.map((item, index) => (
              <li key={index} className="relative pl-5">
                {index !== history.length - 1 && (
                  <span className="absolute left-[5px] top-4 bottom-[-16px] w-px bg-border" />
                )}
                <span className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full bg-primary flex items-center justify-center text-white">
                  {item.icon}
                </span>
                <p className="text-sm text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.date ? new Date(item.date).toLocaleString("vi-VN") : "—"}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
