"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  Package,
  CheckCircle2,
  Undo2,
  Boxes,
  Wallet,
  CalendarClock,
} from "lucide-react";
import { ProductBatch } from "@/types/productBatch";
import { Product } from "@/types/product";
import {
  getBatchById,
  updateBatch,
  getProductsByBatch,
  getBatchStats,
  BatchStats,
} from "@/lib/productBatch.service";
import { updateProduct } from "@/lib/product.service";
import { BATCH_STATUS, labelFor } from "@/lib/product.constants";
import { formatDate } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatCard from "@/components/ui/StatCard";
import BatchModal from "@/components/batch/BatchModal";
import BatchProductsTable from "@/components/batch/BatchProductsTable";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive"> = {
  active: "success",
  closed: "muted",
  returned: "destructive",
};

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [batch, setBatch] = useState<ProductBatch | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editBatch, setEditBatch] = useState<Partial<ProductBatch>>({});
  const [isSaving, setIsSaving] = useState(false);

  async function loadAll() {
    if (!id) return;
    setIsLoading(true);
    try {
      const [batchData, productsData, statsData] = await Promise.all([
        getBatchById(id),
        getProductsByBatch(id),
        getBatchStats(id),
      ]);
      setBatch(batchData);
      setProducts(productsData);
      setStats(statsData);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveBatch() {
    if (!batch?.id) return;
    setIsSaving(true);
    try {
      const { data, error } = await updateBatch(batch.id, editBatch);
      if (error) throw error;
      if (data) {
        setBatch(data);
        setModalOpen(false);
      }
    } catch (error) {
      alert("Lỗi khi lưu thông tin lô hàng");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReturnToSupplier(product: Product) {
    const { error } = await updateProduct(product.id!, { status: "Returned" });
    if (error) {
      alert("Lỗi khi trả sản phẩm về nhà cung cấp");
      console.error(error);
      return;
    }
    await loadAll();
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy lô hàng</p>
        <Button onClick={() => router.back()} className="mt-4">
          Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Quay lại
      </button>

      <div className="space-y-6">
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{batch.batch_code}</h1>
                <Badge variant={STATUS_VARIANT[batch.status || ""] || "muted"}>
                  {labelFor(BATCH_STATUS, batch.status) || batch.status}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm mt-1">
                {batch.supplier || "Chưa có nhà cung cấp"}
                {typeof batch.other_cost === "number" &&
                  ` · Chi phí khác: ${currency.format(batch.other_cost)}`}
              </p>
              {batch.notes && <p className="text-sm text-foreground mt-3">{batch.notes}</p>}
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setEditBatch(batch);
                setModalOpen(true);
              }}
            >
              <Edit2 className="w-4 h-4" />
              Chỉnh sửa
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            title="Tổng sản phẩm"
            value={stats?.total ?? 0}
            icon={<Package className="w-5 h-5 text-primary" />}
          />
          <StatCard
            title="Đã bán"
            value={stats?.sold ?? 0}
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            color="bg-emerald-100"
          />
          <StatCard
            title="Đã trả NCC"
            value={stats?.returned ?? 0}
            icon={<Undo2 className="w-5 h-5 text-destructive" />}
            color="bg-red-100"
          />
          <StatCard
            title="Còn lại"
            value={stats?.remaining ?? 0}
            icon={<Boxes className="w-5 h-5 text-amber-600" />}
            color="bg-amber-100"
          />
          <StatCard
            title="Doanh thu"
            value={currency.format(stats?.revenue ?? 0)}
            icon={<Wallet className="w-5 h-5 text-primary" />}
          />
          <StatCard
            title="Hạn trả"
            value={batch.return_due_date ? formatDate(batch.return_due_date) : "—"}
            icon={<CalendarClock className="w-5 h-5 text-muted-foreground" />}
            color="bg-muted text-muted-foreground"
          />
        </div>

        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Sản phẩm trong lô</h2>
          <BatchProductsTable products={products} onReturnToSupplier={handleReturnToSupplier} />
        </div>
      </div>

      <BatchModal
        open={modalOpen}
        title="Chỉnh sửa lô hàng"
        batch={editBatch}
        setBatch={setEditBatch}
        onSave={handleSaveBatch}
        onClose={() => setModalOpen(false)}
        isLoading={isSaving}
      />
    </div>
  );
}
