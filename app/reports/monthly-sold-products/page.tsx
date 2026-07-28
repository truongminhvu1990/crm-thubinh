import { Gem } from "lucide-react";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import MonthlySoldProductsSection from "@/components/reports/MonthlySoldProductsSection";

// Product Owner Decision (2026-07-28) - standalone operational report page,
// not embedded in Dashboard or Reports Overview. Only the page chrome
// (title/subtitle) lives here; MonthlySoldProductsSection (reused as-is)
// still owns every bit of the report itself - filters/search, summary
// cards, data table, pagination and export/print.

export default function MonthlySoldProductsPage() {
  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Gem className="w-7 h-7 text-primary" />
          Sản phẩm đã bán theo tháng
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Danh sách từng sản phẩm đã bán theo kỳ đã chọn - phục vụ kiểm tra vận hành, không phải phân tích BI.
        </p>
        <div className="mt-1.5">
          <PageViewingLabel />
        </div>
      </div>

      <MonthlySoldProductsSection />
    </div>
  );
}
