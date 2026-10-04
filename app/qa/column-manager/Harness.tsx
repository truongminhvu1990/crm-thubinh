"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ColumnManager from "@/components/shared/ColumnManager";
import { isReportKey } from "@/lib/reportColumns/registry";
import { AVAILABILITY_TOKENS, ColumnContext } from "@/lib/reportColumns/types";
import { useReportColumns } from "@/lib/reportColumns/useReportColumns";

function Inner({ reportKey, ctx }: { reportKey: Parameters<typeof useReportColumns>[0]; ctx: ColumnContext }) {
  const cols = useReportColumns(reportKey, ctx);
  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-end">
        <ColumnManager columns={cols} testId="qa-column-manager" />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" data-testid="qa-table">
          <thead>
            <tr>
              {cols.columns.map((c) => (
                <th key={c.key} data-column-key={c.key} className="px-3 py-2 text-left border-b">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {cols.columns.map((c) => (
                <td key={c.key} className="px-3 py-2 border-b">
                  {c.key}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p data-testid="qa-loading">{cols.loading ? "loading" : "ready"}</p>
    </div>
  );
}

function FromQuery() {
  const sp = useSearchParams();
  const report = sp.get("report");
  const tokens = (sp.get("ctx") ?? "").split(",");
  const ctx: ColumnContext = {};
  for (const t of AVAILABILITY_TOKENS) if (tokens.includes(t)) ctx[t] = true;
  if (!isReportKey(report)) return <p>unknown report</p>;
  return <Inner key={report + tokens.join()} reportKey={report} ctx={ctx} />;
}

export default function Harness() {
  return (
    <Suspense fallback={null}>
      <FromQuery />
    </Suspense>
  );
}
