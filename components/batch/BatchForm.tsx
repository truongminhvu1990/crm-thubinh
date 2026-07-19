"use client";

import { ProductBatch } from "@/types/productBatch";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Hash, Truck, CalendarDays, CalendarClock, Wallet } from "lucide-react";
import { BATCH_STATUS } from "@/lib/product.constants";

interface Props {
  batch: Partial<ProductBatch>;
  setBatch: React.Dispatch<React.SetStateAction<Partial<ProductBatch>>>;
  errors?: Record<string, string>;
}

export default function BatchForm({ batch, setBatch, errors = {} }: Props) {
  const updateField = (field: keyof ProductBatch, value: string) => {
    setBatch({ ...batch, [field]: value });
  };

  const updateNumberField = (field: keyof ProductBatch, value: string) => {
    setBatch({ ...batch, [field]: value === "" ? undefined : Number(value) });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mã lô hàng *"
          placeholder="VD: HX1"
          value={batch.batch_code || ""}
          onChange={(e) => updateField("batch_code", e.target.value)}
          error={errors.batch_code}
          icon={<Hash className="w-4 h-4" />}
        />
        <Input
          label="Nhà cung cấp"
          placeholder="Tên nhà cung cấp"
          value={batch.supplier || ""}
          onChange={(e) => updateField("supplier", e.target.value)}
          icon={<Truck className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Ngày nhận"
          type="date"
          value={batch.received_date || ""}
          onChange={(e) => updateField("received_date", e.target.value)}
          icon={<CalendarDays className="w-4 h-4" />}
        />
        <Input
          label="Hạn trả hàng"
          type="date"
          value={batch.return_due_date || ""}
          onChange={(e) => updateField("return_due_date", e.target.value)}
          icon={<CalendarClock className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Chi phí khác (VNĐ)"
          type="number"
          placeholder="0"
          value={batch.other_cost ?? ""}
          onChange={(e) => updateNumberField("other_cost", e.target.value)}
          icon={<Wallet className="w-4 h-4" />}
        />
        <Select
          label="Trạng thái"
          placeholder="Chọn trạng thái"
          options={BATCH_STATUS}
          value={batch.status || ""}
          onChange={(e) => updateField("status", e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Ghi chú</label>
        <textarea
          placeholder="Ghi chú về lô hàng..."
          value={batch.notes || ""}
          onChange={(e) => updateField("notes", e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </div>
  );
}
