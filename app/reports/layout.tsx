import { ReactNode, Suspense } from "react";
import EntityDrawerProvider from "@/components/reports/entity/EntityDrawerProvider";

/** Phase 1.6: every /reports/* page can open the contextual entity drawer
 * (`?detail=type:uuid`). useSearchParams needs a Suspense boundary. */
export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <EntityDrawerProvider>{children}</EntityDrawerProvider>
    </Suspense>
  );
}
