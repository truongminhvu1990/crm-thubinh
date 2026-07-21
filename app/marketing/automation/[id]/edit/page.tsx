"use client";

import { useParams } from "next/navigation";
import AutomationWizard from "@/components/marketing/AutomationWizard";

export default function EditAutomationPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sửa Automation</h1>
        <p className="text-muted-foreground text-sm mt-1">Cập nhật mẫu, đối tượng và lịch chạy</p>
      </div>
      <AutomationWizard automationId={id} />
    </div>
  );
}
