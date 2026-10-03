import { SupabaseClient } from "@supabase/supabase-js";

// Phase 1.2 - Reporting pagination correctness.
//
// PostgREST (Supabase) silently truncates every response at its `max-rows`
// setting (default 1000) - no error, no warning (proven on the Dev project in
// Phase 1.1). Any reporting read that can match more rows than that MUST go
// through fetchAllRows / selectIn below. A calculation computed over a truncated
// read is wrong even when the Dashboard and its drill-down agree with each
// other, so completeness is enforced here, once, instead of being re-argued per
// loader.

/** Rows requested per page. The server may return fewer (its own cap can be
 * lower than this); fetchAllRows never assumes it returns exactly this many. */
export const PAGE_SIZE = 1000;

/** `.in()` id lists are chunked so the request URL stays short. */
export const IN_CHUNK = 200;

export interface FetchAllResult<T> {
  /** null only when a page failed (see `error`). */
  data: T[] | null;
  error: unknown;
  /** Number of sequential requests issued (diagnostics / tests). */
  pages: number;
}

/** Reads EVERY row matching a query, page by page.
 *
 *  - `applyFilters` receives a fresh `.select(columns)` builder for each page and
 *    must apply the SAME filters / data scope every time (it may be async - the
 *    data-scope helpers are). Rebuilding per page matters: a PostgREST builder is
 *    consumed by awaiting it.
 *  - `applyFilters` returns `{ query }`, NEVER the bare builder: a PostgREST
 *    builder is thenable, so `await`-ing it (or returning it from an async
 *    function) EXECUTES it and yields the result instead of the builder - the same
 *    trap lib/permission/dataScope.ts documents and wraps around.
 *  - Pages are ordered by `orderColumn`, which MUST be a unique, stable key (every
 *    caller uses the table's `id` primary key) so pages neither overlap nor skip.
 *  - The next page starts at the number of rows ACTUALLY received so far - never
 *    at a fixed offset - so a server cap lower than PAGE_SIZE cannot create gaps.
 *  - The exact total is requested with the first page only (`count: "exact"`) and
 *    paging stops once that many rows are held. If no count comes back, paging
 *    continues until an EMPTY page, rather than guessing from a short page.
 *  - Sequential by design: one request at a time, no added concurrency. */
export async function fetchAllRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyFilters: (query: any) => { query: any } | Promise<{ query: any }>,
  orderColumn = "id"
): Promise<FetchAllResult<T>> {
  const all: T[] = [];
  let total: number | null = null;
  let pages = 0;

  for (;;) {
    const from = all.length;
    const base = total === null ? client.from(table).select(columns, { count: "exact" }) : client.from(table).select(columns);
    const { query } = await applyFilters(base);
    const { data, error, count } = await query.order(orderColumn, { ascending: true }).range(from, from + PAGE_SIZE - 1);
    pages += 1;
    if (error) return { data: null, error, pages };

    const page = (data as T[] | null) ?? [];
    if (total === null && typeof count === "number") total = count;
    all.push(...page);

    if (page.length === 0) break;
    if (total !== null && all.length >= total) break;
  }
  return { data: all, error: null, pages };
}

/** Id-keyed lookup (payments by order id, order items by order id, ...), chunked
 * AND paged within each chunk: a chunk of 200 orders can easily own more than
 * 1000 payment rows. A failed chunk is logged and skipped (never thrown), the
 * same degrade-don't-crash behavior every report read here already had. */
export async function selectIn<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  values: string[],
  orderColumn = "id"
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK);
    const { data, error } = await fetchAllRows<T>(client, table, columns, (q) => ({ query: q.in(column, chunk) }), orderColumn);
    if (error || !data) {
      console.error(`Error fetching ${table} for report drill-down:`, error);
      continue;
    }
    rows.push(...data);
  }
  return rows;
}
