"use client";

import { useEffect } from "react";
import "./globals.css";
import { logger } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled global error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="vi">
      <body className="bg-background font-sans antialiased">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-bold text-foreground mb-2">
              Hệ thống gặp sự cố nghiêm trọng
            </h2>
            <p className="text-muted-foreground mb-6">
              Vui lòng tải lại trang. Nếu sự cố tiếp tục, hãy liên hệ quản trị viên.
            </p>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
            >
              Thử lại
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
