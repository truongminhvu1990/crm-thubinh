import { DateRange } from "@/lib/dateFilter";

/** Backend API Foundation (Package 4C, Wave 4) - every Reports route below
 * takes the same `DateRange | null` shape (`{ start, end }`, exclusive
 * `end`) the existing services already expect; `null` means "all time,"
 * matching getDateRange()'s own "all_time -> null" convention. Shared here
 * (same pattern as app/api/orders/_errors.ts) so the parsing logic isn't
 * copy-pasted across the many Reports routes. */
export function parseDateRangeParams(
  searchParams: URLSearchParams,
  startKey = "start",
  endKey = "end"
): DateRange | null {
  const start = searchParams.get(startKey);
  const end = searchParams.get(endKey);
  return start && end ? { start, end } : null;
}
