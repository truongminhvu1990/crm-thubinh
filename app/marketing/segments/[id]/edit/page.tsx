"use client";

import { useParams } from "next/navigation";
import SegmentBuilderForm from "@/components/marketing/SegmentBuilderForm";

export default function EditSegmentPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sửa phân khúc</h1>
        <p className="text-muted-foreground text-sm mt-1">Cập nhật thông tin và điều kiện của phân khúc</p>
      </div>
      <SegmentBuilderForm segmentId={id} />
    </div>
  );
}
