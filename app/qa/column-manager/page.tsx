import { notFound } from "next/navigation";
import Harness from "./Harness";

// Phase 1.6 Wave B0 - QA-only harness so ColumnManager can be exercised in a real browser before any report table is
// wired to it (B1). Returns 404 unless COLUMN_MANAGER_QA_HARNESS=1 is set in the server environment; remove once the
// real tables use ColumnManager.
export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.COLUMN_MANAGER_QA_HARNESS !== "1") notFound();
  return <Harness />;
}
