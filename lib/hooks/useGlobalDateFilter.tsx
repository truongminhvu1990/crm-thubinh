"use client";

// Sprint v1.0.2 - Global Date Filter. One shared DateRange state, mounted
// once in AppShell (components/AppShell.tsx) so it survives client-side
// navigation between /dashboard and /reports without a reload - both pages
// read/write the exact same state via this hook instead of keeping their
// own local filter state. Persisted to localStorage so an F5 refresh keeps
// the selected period; default is "This Month" both on first-ever load and
// whenever nothing valid is in storage.

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import {
  DateFilterOption,
  DateRange,
  getDateRange,
  getDateFilterLabel,
  isDateFilterOption,
  validateCustomRange,
} from "@/lib/dateFilter";

interface GlobalDateFilterValue {
  option: DateFilterOption;
  setOption: (option: DateFilterOption) => void;
  customFrom: string;
  customTo: string;
  setCustomRange: (from: string, to: string) => void;
  range: DateRange | null;
  /** Phase 1.6B: stable string identity of the active period (`start|end`, or `all|all` for Toàn thời gian). Use as an effect
   * dependency / result key instead of re-deriving it from `range`. */
  periodKey: string;
  label: string;
  /** Phase 1.5A: false until the stored period has been read on the client. Anything that fetches by `range` MUST wait
   * for this, otherwise it first fetches the fixed default ("Tháng này") and only then the stored period. */
  ready: boolean;
}

const GlobalDateFilterContext = createContext<GlobalDateFilterValue | null>(null);

const DEFAULT_OPTION: DateFilterOption = "this_month";
const STORAGE_KEY = "crm-thubinh:globalDateFilter";

interface StoredFilter {
  option: DateFilterOption;
  customFrom: string;
  customTo: string;
}

function readStoredFilter(): StoredFilter | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isDateFilterOption(parsed.option)) return null;
    const restored = {
      option: parsed.option,
      customFrom: typeof parsed.customFrom === "string" ? parsed.customFrom : "",
      customTo: typeof parsed.customTo === "string" ? parsed.customTo : "",
    };
    // A stored custom period that is incomplete or reversed (left over from the old live-typing behaviour) would send
    // an invalid range to every report - treat it as "nothing stored".
    if (restored.option === "custom" && !validateCustomRange(restored.customFrom, restored.customTo).ok) return null;
    return restored;
  } catch {
    return null;
  }
}

function writeStoredFilter(next: StoredFilter) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) - persistence is
    // a nice-to-have, not a hard requirement, so fail silently.
  }
}

export function GlobalDateFilterProvider({ children }: { children: ReactNode }) {
  // Server and the client's first render must match exactly, so state
  // starts at the fixed default here and only picks up a stored value
  // afterward, client-side, in the mount effect below - reading
  // localStorage during the initializer would desync from the server HTML.
  const [option, setOptionState] = useState<DateFilterOption>(DEFAULT_OPTION);
  const [customFrom, setCustomFromState] = useState("");
  const [customTo, setCustomToState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredFilter();
    // localStorage only exists client-side, so this can't be read during
    // the initial render (would desync client/server output) - an effect
    // is the correct place for this one-time, external-source hydration.
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptionState(stored.option);
      setCustomFromState(stored.customFrom);
      setCustomToState(stored.customTo);
    }
    // Both state updates above and this flag land in the same render, so consumers never see "ready" with the default.
    setReady(true);
  }, []);

  const value = useMemo<GlobalDateFilterValue>(() => {
    // Defined inside the memo so they close over this render's current
    // customFrom/customTo/option (no ref needed for "latest values") and
    // don't force the memo to recompute on every render.
    const setOption = (next: DateFilterOption) => {
      setOptionState(next);
      writeStoredFilter({ option: next, customFrom, customTo });
    };

    const setCustomRange = (from: string, to: string) => {
      // Always switches option to "custom" too (not just the dates) - the
      // UI already only ever calls this while option is already "custom"
      // (the date inputs only render then), so this is a no-op there. It
      // also makes the call safe for a caller like a report drill-down
      // link that sets a custom range and expects "custom" to become the
      // active option in the very same synchronous batch - without this,
      // setOption("custom") followed immediately by setCustomRange(...)
      // would persist the *previous* option to storage, since both
      // closures capture this render's now-stale `option` value.
      setOptionState("custom");
      setCustomFromState(from);
      setCustomToState(to);
      writeStoredFilter({ option: "custom", customFrom: from, customTo: to });
    };

    const range = getDateRange(option, customFrom, customTo);
    return {
      option,
      setOption,
      customFrom,
      customTo,
      setCustomRange,
      range,
      periodKey: `${range?.start ?? "all"}|${range?.end ?? "all"}`,
      label: getDateFilterLabel(option, customFrom, customTo),
      ready,
    };
  }, [option, customFrom, customTo, ready]);

  return <GlobalDateFilterContext.Provider value={value}>{children}</GlobalDateFilterContext.Provider>;
}

export function useGlobalDateFilter(): GlobalDateFilterValue {
  const ctx = useContext(GlobalDateFilterContext);
  if (!ctx) {
    throw new Error("useGlobalDateFilter must be used within GlobalDateFilterProvider");
  }
  return ctx;
}
