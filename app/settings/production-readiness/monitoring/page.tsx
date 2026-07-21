"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

const NOT_CONFIGURED = [
  {
    title: "Giám sát thời gian hoạt động (Uptime)",
    need: "Cần một công cụ ping /api/health định kỳ và cảnh báo khi không phản hồi.",
  },
  {
    title: "Giám sát tỉ lệ lỗi (Error-rate)",
    need: "Cần một dịch vụ tổng hợp lỗi (Sentry/Datadog/...) — hiện các lỗi chỉ ghi vào console, không được lưu trữ hay tổng hợp.",
  },
  {
    title: "Sức khỏe cơ sở dữ liệu",
    need: "Supabase đã có sẵn dashboard riêng cho việc này — khoảng trống là chưa ai theo dõi nó thường xuyên, không phải thiếu công cụ.",
  },
];

/** Monitoring Overview (§8) + Error Overview (§9) - both explicit
 * placeholders per the locked Business Design (no monitoring vendor
 * exists, no error persistence exists or is recommended). Not stubs that
 * look broken - each card states plainly what's missing and what closing
 * the gap would need. */
export default function MonitoringErrorOverviewPage() {
  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Sức khỏe &amp; Giám sát</h1>
      <p className="text-muted-foreground mb-6 text-sm">Kiểm tra sức khỏe hệ thống: xem tab &quot;Môi trường&quot;</p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {NOT_CONFIGURED.map((item) => (
          <Card key={item.title}>
            <p className="font-semibold text-foreground mb-2">{item.title}</p>
            <Badge variant="muted">Chưa cấu hình</Badge>
            <p className="text-xs text-muted-foreground mt-3">{item.need}</p>
          </Card>
        ))}
      </div>

      <Card>
        <p className="text-sm text-muted-foreground">
          Không có dữ liệu lỗi lịch sử để hiển thị — kể cả khi chọn được công cụ giám sát, dữ liệu lỗi hiện tại chỉ tồn tại
          trong <code className="font-mono text-xs">console</code>, không được lưu lại (theo quyết định trong{" "}
          <code className="font-mono text-xs">PRODUCTION_READINESS_DATABASE.md</code> §9: ứng dụng cố tình{" "}
          <strong>không</strong> lưu log vào Postgres). Màn hình này sẽ chỉ có dữ liệu thật sau khi một công cụ giám sát bên
          ngoài được chọn.
        </p>
      </Card>
    </div>
  );
}
