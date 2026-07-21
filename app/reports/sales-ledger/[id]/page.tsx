"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImageOff, Package, User, Wallet, Percent, CalendarDays, StickyNote } from "lucide-react";
import { SalesLedgerRow } from "@/types/salesLedger";
import { getSalesLedgerDetail, getSalesLedgerDetailImages } from "@/lib/salesLedger/salesLedger.service";
import { COMMISSION_STATUS_LABEL, COMMISSION_STATUS_BADGE_VARIANT } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import InfoItem from "@/components/ui/InfoItem";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function SalesLedgerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [row, setRow] = useState<SalesLedgerRow | null>(null);
  const [images, setImages] = useState<{ id: string; image_url: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    if (!id) return;
    setIsLoading(true);
    const data = await getSalesLedgerDetail(id);
    setRow(data);
    if (data?.product_id) {
      setImages(await getSalesLedgerDetailImages(data.product_id));
    } else {
      setImages([]);
    }
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

  if (!row) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy giao dịch</p>
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

      <div className="space-y-6">
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {row.product_name || "Giao dịch bán hàng"}
              </h1>
              {row.product_code && <p className="text-muted-foreground text-sm mt-1.5">Mã sản phẩm: {row.product_code}</p>}
            </div>
            {row.commission_status && (
              <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[row.commission_status]} className="text-sm px-2.5 py-0.5">
                {COMMISSION_STATUS_LABEL[row.commission_status]}
              </Badge>
            )}
          </div>

          {images.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {images.map((img) => (
                <img
                  key={img.id}
                  src={img.image_url}
                  alt={row.product_name || ""}
                  className="w-24 h-24 rounded-lg object-cover border border-border"
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <ImageOff className="w-4 h-4" />
              Không có hình ảnh sản phẩm
            </div>
          )}

          <div className="mt-7 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6">
            <InfoItem icon={<Package className="w-4 h-4" />} label="Sản phẩm">
              {row.product_id ? (
                <Link href={`/products/${row.product_id}`} className="text-primary hover:underline">
                  {row.product_name || row.product_code}
                </Link>
              ) : (
                "—"
              )}
            </InfoItem>
            <InfoItem icon={<User className="w-4 h-4" />} label="Khách hàng">
              <Link href={`/customers/${row.customer_id}`} className="text-primary hover:underline">
                {row.customer_name}
              </Link>
            </InfoItem>
            <InfoItem icon={<User className="w-4 h-4" />} label="Nhân viên">
              {row.salesperson || "—"}
            </InfoItem>
            <InfoItem icon={<CalendarDays className="w-4 h-4" />} label="Ngày bán">
              {formatDate(row.sale_date)}
            </InfoItem>
            <InfoItem icon={<Wallet className="w-4 h-4" />} label="Giá bán">
              {currency.format(row.sale_amount)}
            </InfoItem>
            <InfoItem icon={<Percent className="w-4 h-4" />} label="Hoa hồng">
              {row.commission_amount !== null
                ? `${currency.format(row.commission_amount)} (${row.commission_percent}%)`
                : "—"}
            </InfoItem>
            {row.note && (
              <InfoItem icon={<StickyNote className="w-4 h-4" />} label="Ghi chú">
                {row.note}
              </InfoItem>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
