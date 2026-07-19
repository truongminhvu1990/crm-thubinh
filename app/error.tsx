"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { logger } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled route error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Card className="max-w-md w-full text-center">
        <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Đã có lỗi xảy ra</h2>
        <p className="text-muted-foreground mb-6">
          Xin lỗi, đã có sự cố ngoài ý muốn. Vui lòng thử lại.
        </p>
        <Button variant="primary" onClick={reset}>
          Thử lại
        </Button>
      </Card>
    </div>
  );
}
