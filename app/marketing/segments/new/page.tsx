"use client";

import SegmentBuilderForm from "@/components/marketing/SegmentBuilderForm";

export default function NewSegmentPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Phân khúc mới</h1>
        <p className="text-muted-foreground text-sm mt-1">Định nghĩa tên, loại và điều kiện của phân khúc</p>
      </div>
      <SegmentBuilderForm />
    </div>
  );
}
