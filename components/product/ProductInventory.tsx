"use client";

import { useEffect, useState } from "react";
import { PackageCheck, PackageX, Undo2 } from "lucide-react";
import { Product } from "@/types/product";
import { getBatchStats, BatchStats } from "@/lib/productBatch.service";
import StatCard from "@/components/ui/StatCard";

interface Props {
  product: Product;
}

/**
 * Shows batch-derived stock (from products.status, the trusted signal - see
 * productBatch.service.ts), not the legacy available/reserved/sold counters,
 * which are stale and disconnected from the real sell workflow (same
 * distrust rule the Inventory module already applies to these columns).
 */
export default function ProductInventory({ product }: Props) {
  const [batchStats, setBatchStats] = useState<BatchStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!product.batch_id) {
      setBatchStats(null);
      return;
    }
    setIsLoading(true);
    getBatchStats(product.batch_id)
      .then(setBatchStats)
      .finally(() => setIsLoading(false));
  }, [product.batch_id]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-3">📦 Tồn kho</h2>

      {!product.batch_id ? (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-xl p-4">
          Sản phẩm chưa được gán vào lô hàng - trạng thái tồn kho dựa trên trạng thái sản phẩm ở trên.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            title="Tổng trong lô"
            value={batchStats?.total ?? 0}
            icon={<PackageCheck className="w-6 h-6 text-primary" />}
            color="bg-primary/10"
            placeholder={isLoading}
          />
          <StatCard
            title="Còn lại"
            value={batchStats?.remaining ?? 0}
            icon={<PackageCheck className="w-6 h-6 text-emerald-600" />}
            color="bg-emerald-100"
            placeholder={isLoading}
          />
          <StatCard
            title="Đã bán"
            value={batchStats?.sold ?? 0}
            icon={<PackageX className="w-6 h-6 text-muted-foreground" />}
            color="bg-muted text-muted-foreground"
            placeholder={isLoading}
          />
        </div>
      )}

      {!isLoading && !!batchStats?.returned && (
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
          <Undo2 className="w-3.5 h-3.5" />
          {batchStats.returned} sản phẩm trong lô đã trả về NCC
        </p>
      )}
    </div>
  );
}
