// Test-only. PostgREST response semantics shared by every reporting fake, so that no
// test can pass against a client that is more generous than the real server.
//
// Behaviors reproduced (these are the ones that matter for completeness):
//  - `max-rows`: EVERY response, paged or not, holds at most `maxRows` rows
//    (default 1000, the Supabase default). An unpaged read of a larger table is
//    silently truncated with no error - exactly what Phase 1.1 proved on Dev.
//  - `.order(col)` sorts before the window is taken (stable, by column value).
//  - `.range(from, to)` selects that window of the ordered rows, then the cap applies.
//  - `.select(cols, { count: "exact" })` returns the total number of rows matching the
//    filters (before the window), like the Content-Range total.
//  - every request is recorded so tests can assert how many pages were fetched and
//    that paging was ordered.

export const POSTGREST_MAX_ROWS = 1000;

export interface WindowState {
  order?: { col: string; ascending: boolean };
  range?: [number, number];
  countExact?: boolean;
}

export interface RequestLogEntry {
  table: string;
  ordered: string | null;
  range: [number, number] | null;
  count: boolean;
  returned: number;
}

export interface FakeStats {
  maxRows: number;
  requests: RequestLogEntry[];
  /** Simulates a server/proxy that never returns the exact count. */
  omitCount?: boolean;
}

export function newFakeStats(maxRows = POSTGREST_MAX_ROWS, opts: { omitCount?: boolean } = {}): FakeStats {
  return { maxRows, requests: [], omitCount: opts.omitCount };
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

/** Applies order -> total -> range -> server cap, in the order PostgREST does. */
export function applyWindow<T>(
  rows: T[],
  state: WindowState,
  stats?: FakeStats,
  table = "?"
): { data: T[]; count: number | null } {
  let r = rows;
  if (state.order) {
    const { col, ascending } = state.order;
    r = [...rows].sort((x, y) => {
      const c = compare((x as Record<string, unknown>)[col], (y as Record<string, unknown>)[col]);
      return ascending ? c : -c;
    });
  }
  const total = r.length;
  if (state.range) r = r.slice(state.range[0], state.range[1] + 1);
  const maxRows = stats?.maxRows ?? POSTGREST_MAX_ROWS;
  r = r.slice(0, maxRows);
  stats?.requests.push({
    table,
    ordered: state.order ? state.order.col : null,
    range: state.range ?? null,
    count: !!state.countExact,
    returned: r.length,
  });
  return { data: r, count: state.countExact && !stats?.omitCount ? total : null };
}
