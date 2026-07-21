"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";

/** Access Control (PRODUCTION_READINESS_UI.md §15) - does not introduce a
 * new access-control mechanism. Reuses the Enterprise Permission Center
 * exactly as it exists: every Ops Console write endpoint is gated by
 * `settings.manage` (the same permission that already gates Permission
 * Center's own admin surface) until a dedicated `production.manage`
 * permission is seeded via a future migration (not created here, per
 * PERMISSION_UI.md's own "no duplicate editors" principle - grant/revoke
 * happens on Permission Center's Role Detail screen, not a second copy
 * built here). */
export default function AccessControlPage() {
  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Quyền truy cập</h1>
      <p className="text-muted-foreground mb-6 text-sm">Ops Console tái sử dụng hệ thống Phân quyền hiện có</p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm text-foreground mb-2">
              Mọi thao tác ghi trong Ops Console (ghi nhận triển khai, xác minh migration, xác nhận backup, ghi nhận restore
              drill, đánh dấu UAT, tick checklist, phê duyệt Go Live) đều yêu cầu quyền{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">settings.manage</code> — quyền tương tự đã
              đang bảo vệ toàn bộ màn hình quản trị của Phân quyền.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Một quyền riêng biệt, dự kiến đặt tên <code className="font-mono text-xs">production.manage</code>, có thể
              được thêm sau (qua migration seed dữ liệu, không phải thay đổi schema) nếu cần tách bạch quyền quản lý Ops
              Console khỏi quyền quản lý Phân quyền — quyết định này chưa được đưa ra ở đây.
            </p>
            <p className="text-sm">
              Cấp/thu hồi quyền được thực hiện tại{" "}
              <Link href="/settings/permissions/roles" className="text-primary hover:underline">
                trang Vai trò của Phân quyền
              </Link>{" "}
              — không có màn hình cấp quyền riêng nào được xây dựng ở đây.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
