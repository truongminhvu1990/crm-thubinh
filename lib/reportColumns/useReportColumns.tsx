"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { PreferenceStore } from "./preferenceStore";
import { buildSavePayload, moveKey, normalizeColumnPreference } from "./normalize";
import { REPORT_COLUMNS, ReportColumnKey } from "./registry";
import { AVAILABILITY_TOKENS, ColumnContext, ColumnMeta } from "./types";

// Phase 1.6 Wave B0 - shared column-management hook + provider.
//
// Nothing here fetches business data and nothing business-related depends on it: a table renders `columns` (visible,
// in order) and the ColumnManager renders `managerRows`. Changing a preference touches only /api/report-preferences.

const StoreContext = createContext<PreferenceStore | null>(null);

/** One store per signed-in user, shared by every table on the page (one GET per report key). Cleared whenever the auth
 * user changes, so a preference is never visible to - or cached for - another user. */
export function ReportPreferencesProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new PreferenceStore());

  useEffect(() => {
    let currentUser: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      if (currentUser !== undefined && id !== currentUser) store.clear();
      currentUser = id;
    });
    return () => data.subscription.unsubscribe();
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export interface ManagerRow {
  meta: ColumnMeta;
  visible: boolean;
  mandatory: boolean;
}

export interface UseReportColumns {
  /** Visible columns, in display order: what the table renders left to right. */
  columns: ColumnMeta[];
  /** Every AVAILABLE column in effective order (permission-gated ones never appear): what the manager lists. */
  managerRows: ManagerRow[];
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
  /** Keyboard / button move: debounced save. */
  moveBy: (key: string, delta: -1 | 1) => void;
  /** Drag: local only until commitDrag(). */
  dragTo: (key: string, index: number) => void;
  commitDrag: () => void;
  cancelDrag: () => void;
  reset: () => void;
  retry: () => void;
  isDefault: boolean;
  loading: boolean;
  saving: boolean;
  saved: boolean;
  error: null | "load" | "save";
}

export function useReportColumns(reportKey: ReportColumnKey, context: ColumnContext = {}): UseReportColumns {
  const shared = useContext(StoreContext);
  const [own] = useState(() => new PreferenceStore()); // used only when there is no provider
  const store = shared ?? own;

  const defs = REPORT_COLUMNS[reportKey] as readonly ColumnMeta[];
  const ctxSig = AVAILABILITY_TOKENS.map((t) => (context[t] ? "1" : "0")).join("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo<ColumnContext>(() => context, [ctxSig]);

  useEffect(() => {
    void store.load(reportKey);
  }, [store, reportKey]);

  const entry = useSyncExternalStore(
    store.subscribe,
    () => store.get(reportKey),
    () => store.get(reportKey)
  );

  const norm = useMemo(
    () => normalizeColumnPreference(defs, entry.working.visible, entry.working.order, ctx),
    [defs, entry.working, ctx]
  );

  const current = useCallback(() => {
    const e = store.get(reportKey);
    return { e, n: normalizeColumnPreference(defs, e.working.visible, e.working.order, ctx) };
  }, [store, reportKey, defs, ctx]);

  const apply = useCallback(
    (order: string[], shown: Set<string>, mode: "now" | "debounce" | "preview") => {
      const { e } = current();
      const p = buildSavePayload(defs, ctx, order, shown, e.working.visible, e.working.order);
      store.set(reportKey, { visible: p.visibleColumns, order: p.columnOrder }, mode);
    },
    [current, defs, ctx, store, reportKey]
  );

  const byKey = useMemo(() => new Map(defs.map((d) => [d.key, d])), [defs]);

  const toggle = useCallback(
    (key: string) => {
      const { n } = current();
      if (byKey.get(key)?.mandatory || !n.order.includes(key)) return;
      const next = new Set(n.visible);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      apply(n.order, next, "now");
    },
    [current, byKey, apply]
  );

  const moveBy = useCallback(
    (key: string, delta: -1 | 1) => {
      const { n } = current();
      const from = n.order.indexOf(key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= n.order.length) return;
      apply(moveKey(n.order, key, to), n.visible, "debounce");
    },
    [current, apply]
  );

  const dragTo = useCallback(
    (key: string, index: number) => {
      const { n } = current();
      const next = moveKey(n.order, key, index);
      if (next.join("|") === n.order.join("|")) return;
      apply(next, n.visible, "preview");
    },
    [current, apply]
  );

  return {
    columns: norm.columns.map((k) => byKey.get(k)!),
    managerRows: norm.order.map((k) => ({ meta: byKey.get(k)!, visible: norm.visible.has(k), mandatory: !!byKey.get(k)!.mandatory })),
    isVisible: (key) => norm.visible.has(key),
    toggle,
    moveBy,
    dragTo,
    commitDrag: () => store.commitPreview(reportKey),
    cancelDrag: () => store.cancelPreview(reportKey),
    reset: () => store.set(reportKey, { visible: null, order: null }, "now"),
    retry: () => store.retry(reportKey),
    isDefault: entry.working.visible === null && entry.working.order === null,
    loading: entry.loading || !entry.loaded,
    saving: entry.saving,
    saved: entry.saved,
    error: entry.error,
  };
}
