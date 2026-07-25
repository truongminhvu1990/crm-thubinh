import { DateRange } from "@/lib/dateFilter";

/** Backend API Foundation (Package 4C, Wave 4) - tiny shared query-string
 * builder for the BI Center's per-section components, all of which pass the
 * same `DateRange | null` shape to their respective /api/reports/bi/*
 * route. Kept here rather than repeated in each component. */
export function rangeSearchParams(range: DateRange | null): string {
  return range ? `start=${range.start}&end=${range.end}` : "";
}
