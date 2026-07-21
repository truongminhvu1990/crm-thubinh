"use client";

import AutomationWizard from "@/components/marketing/AutomationWizard";

export default function NewAutomationPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Automation mới</h1>
        <p className="text-muted-foreground text-sm mt-1">Định nghĩa mẫu, đối tượng và lịch chạy</p>
      </div>
      <AutomationWizard />
    </div>
  );
}
