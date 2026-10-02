import { NextResponse } from "next/server";
import { DateRange } from "@/lib/dateFilter";
import type { InventoryFilters } from "@/lib/reports/inventoryValue.service";

/** Phase 1 - Reporting Foundation: shared query-string parsing for the
 * Overview drill-down endpoints (/api/reports/overview/*). Each endpoint takes
 * the SAME `start` / `end` the Dashboard overview endpoint takes
 * (`end` exclusive, YYYY-MM-DD), so the drill-down describes exactly the
 * period of the number that was clicked.
 *
 * Unlike the lenient parseDateRangeParams (which silently treats "only one of
 * the two" as all-time), a drill-down that received a half-specified or
 * malformed range is rejected with 400: silently widening the period would
 * make the detail total disagree with the clicked Dashboard number. */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function parseOverviewRange(searchParams: URLSearchParams): { range: DateRange | null } | { error: NextResponse } {
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start && !end) return { range: null };
  if (!start || !end) {
    return { error: NextResponse.json({ error: "start and end must be provided together" }, { status: 400 }) };
  }
  if (!isRealDate(start) || !isRealDate(end)) {
    return { error: NextResponse.json({ error: "start and end must be valid YYYY-MM-DD dates" }, { status: 400 }) };
  }
  if (start >= end) {
    return { error: NextResponse.json({ error: "start must be before end (end is exclusive)" }, { status: 400 }) };
  }
  return { range: { start, end } };
}

/** Optional inventory narrowing - the same three fields /inventory filters
 * by, minus the ones that are not part of the held/remaining definition. */
export function parseInventoryFilters(searchParams: URLSearchParams): InventoryFilters {
  return {
    category: searchParams.get("category") || undefined,
    salesperson: searchParams.get("salesperson") || undefined,
    batchId: searchParams.get("batchId") || undefined,
  };
}
