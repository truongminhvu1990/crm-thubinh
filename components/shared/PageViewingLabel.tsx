"use client";

// Sprint v1.0.2 - shows the active Global Date Filter period directly under
// a page's title, so the user never has to inspect the filter control to
// know what period they're looking at. Shared by Dashboard and Reports.

import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";

export default function PageViewingLabel() {
  const { label } = useGlobalDateFilter();

  return (
    <p className="text-sm font-medium text-foreground">
      Đang xem: <span className="text-primary">{label}</span>
    </p>
  );
}
