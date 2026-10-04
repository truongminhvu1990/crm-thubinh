import { ColumnContext, ColumnMeta, NormalizedColumnPreference } from "./types";

/** Keeps only strings, first occurrence of each. Returns null when the value is not an array at all (malformed). */
export function cleanKeyArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function availableColumns(defs: readonly ColumnMeta[], ctx: ColumnContext): ColumnMeta[] {
  return defs.filter((d) => !d.availableWhen || ctx[d.availableWhen] === true);
}

/** Deterministic, side-effect free. Called when READING a preference; it never writes anything back.
 *
 * - no / malformed visible_columns -> every available column visible
 * - column_order present (new format): it is the list of ALL columns known when the user saved, so a column absent
 *   from both visible_columns and column_order is NEW -> visible; absent from visible_columns only -> hidden by the user
 * - column_order NULL / malformed (legacy row): visible_columns is the whole truth (unlisted = hidden), as before Wave B
 * - mandatory columns are always visible; unknown / unavailable / duplicate keys are ignored */
export function normalizeColumnPreference(
  defs: readonly ColumnMeta[],
  storedVisible: unknown,
  storedOrder: unknown,
  ctx: ColumnContext
): NormalizedColumnPreference {
  const avail = availableColumns(defs, ctx);
  const availKeys = avail.map((d) => d.key);
  const availSet = new Set(availKeys);
  const mandatory = avail.filter((d) => d.mandatory).map((d) => d.key);

  const V = cleanKeyArray(storedVisible);
  const O = cleanKeyArray(storedOrder);

  const fromStored = (O ?? []).filter((k) => availSet.has(k));
  const placed = new Set(fromStored);
  const order = [...fromStored, ...availKeys.filter((k) => !placed.has(k))];

  let visible: string[];
  if (V === null) {
    visible = availKeys;
  } else if (O !== null) {
    const vSet = new Set(V);
    const known = new Set(O);
    visible = availKeys.filter((k) => vSet.has(k) || !known.has(k));
  } else {
    const vSet = new Set(V);
    visible = availKeys.filter((k) => vSet.has(k));
  }

  const visibleSet = new Set(visible);
  for (const k of mandatory) visibleSet.add(k);
  if (visibleSet.size === 0) for (const k of availKeys) visibleSet.add(k); // nothing at all to show: fall back to defaults

  return { order, visible: visibleSet, columns: order.filter((k) => visibleSet.has(k)) };
}

export interface SavePayload {
  visibleColumns: string[];
  columnOrder: string[];
}

/** Builds what gets persisted after the user changes something. `shownOrder` is the effective order of the AVAILABLE
 * columns and `shown` the visible subset of them. Keys that are currently unavailable (permission / mode) but were
 * stored before are preserved, so they return when the context becomes valid again. */
export function buildSavePayload(
  defs: readonly ColumnMeta[],
  ctx: ColumnContext,
  shownOrder: readonly string[],
  shown: ReadonlySet<string>,
  prevVisible: unknown,
  prevOrder: unknown
): SavePayload {
  const availSet = new Set(availableColumns(defs, ctx).map((d) => d.key));
  const allKeys = new Set(defs.map((d) => d.key));
  const keepV = (cleanKeyArray(prevVisible) ?? []).filter((k) => allKeys.has(k) && !availSet.has(k));
  const keepO = (cleanKeyArray(prevOrder) ?? []).filter((k) => allKeys.has(k) && !availSet.has(k));
  const visibleColumns = [...shownOrder.filter((k) => shown.has(k)), ...keepV];
  const columnOrder = [...shownOrder, ...keepO.filter((k) => !shownOrder.includes(k))];
  return { visibleColumns, columnOrder };
}

/** Moves `key` to `index` (clamped) in `order`. Returns a new array. */
export function moveKey(order: readonly string[], key: string, index: number): string[] {
  const from = order.indexOf(key);
  if (from < 0) return [...order];
  const next = order.filter((k) => k !== key);
  next.splice(Math.max(0, Math.min(next.length, index)), 0, key);
  return next;
}
