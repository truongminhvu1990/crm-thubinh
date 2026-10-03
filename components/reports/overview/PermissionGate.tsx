"use client";

import { ReactNode } from "react";
import type { AccessState } from "@/lib/hooks/accessLoader";
import { SkeletonBlock, SkeletonCard } from "./Skeleton";

interface Props {
  state: AccessState;
  /** Page title, kept visible in every state so the page never looks empty or reloaded. */
  title: string;
  children: ReactNode;
}

export const PERMISSION_DENIED_TEXT = "Bạn không có quyền xem báo cáo";
export const PERMISSION_ERROR_TEXT = "Không kiểm tra được quyền truy cập. Vui lòng tải lại trang.";

/** One place that separates the states the old pages collapsed into "false = no permission":
 *   loading -> skeleton (NEVER the "no permission" text)   denied -> the message   error -> a retry hint   allowed -> page. */
export default function PermissionGate({ state, title, children }: Props) {
  if (state === "allowed") return <>{children}</>;
  return (
    <div className="pb-8" data-testid="permission-gate" data-permission-state={state}>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      {state === "loading" && (
        <div className="mt-6 space-y-4" role="status" aria-label="Đang kiểm tra quyền truy cập">
          <SkeletonBlock className="h-4 w-64" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      )}
      {state === "denied" && <p className="mt-4 text-muted-foreground">{PERMISSION_DENIED_TEXT}</p>}
      {state === "error" && (
        <div className="mt-4 space-y-2">
          <p className="text-destructive">{PERMISSION_ERROR_TEXT}</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium hover:border-primary">
            Tải lại
          </button>
        </div>
      )}
    </div>
  );
}
